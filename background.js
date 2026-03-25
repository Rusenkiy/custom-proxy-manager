let cachedAuth = null;

function initAuthCache() {
  chrome.storage.local.get(['activeProxyId', 'proxies'], (result) => {
    if (result.activeProxyId && result.proxies) {
      const activeProxy = result.proxies.find((p) => p.id === result.activeProxyId);
      if (activeProxy && activeProxy.username) {
        cachedAuth = { username: activeProxy.username, password: activeProxy.password };
      }
    }
  });
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['activeProxyId'], (result) => {
    if (result.activeProxyId) {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.get(['activeProxyId'], (result) => {
    if (result.activeProxyId) {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  });
});

async function applyConfig(proxy) {
  const data = await chrome.storage.local.get(['adblockEnabled']);
  const adblock = !!data.adblockEnabled;

  if (!proxy && !adblock) {
    return new Promise((resolve) => {
      chrome.proxy.settings.clear({ scope: 'regular' }, resolve);
    });
  }
  
  if (proxy && !adblock) {
    const config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: proxy.type ? proxy.type.toLowerCase() : "http",
          host: proxy.host,
          port: parseInt(proxy.port, 10)
        },
        bypassList: ["localhost", "127.0.0.1"]
      }
    };
    return new Promise((resolve) => {
      chrome.proxy.settings.set({ value: config, scope: 'regular' }, resolve);
    });
  }

  // PAC script for AdBlock
  let fallback = "DIRECT";
  if (proxy) {
    let type = proxy.type ? proxy.type.toUpperCase() : "HTTP";
    if (type === "HTTP") type = "PROXY"; // Chrome PAC syntax mapping
    fallback = `${type} ${proxy.host}:${proxy.port}`;
  }

  const pacScript = `
    const adDomains = [
      "doubleclick.net",
      "googleadservices.com",
      "googlesyndication.com",
      "adservice.google.com",
      "scorecardresearch.com",
      "taboola.com",
      "outbrain.com",
      "criteo.com",
      "amazon-adsystem.com",
      "adsafeprotected.com"
    ];

    function FindProxyForURL(url, host) {
      for (let i = 0; i < adDomains.length; i++) {
        if (dnsDomainIs(host, adDomains[i])) {
          return "PROXY 0.0.0.0:80"; // block
        }
      }
      return "${fallback}";
    }
  `;

  const config = {
    mode: "pac_script",
    pacScript: {
      data: pacScript
    }
  };

  return new Promise((resolve) => {
    chrome.proxy.settings.set({ value: config, scope: 'regular' }, resolve);
  });
}

chrome.webRequest.onAuthRequired.addListener(
  function(details, asyncCallback) {
    if (!details.isProxy) {
      asyncCallback();
      return;
    }
    
    if (cachedAuth) {
      asyncCallback({ authCredentials: cachedAuth });
      return;
    }
    
    chrome.storage.local.get(['activeProxyId', 'proxies', 'pingProxy'], (result) => {
      let targetProxy = null;
      
      if (result.pingProxy) {
        targetProxy = result.pingProxy;
      } else if (result.activeProxyId && result.proxies) {
        targetProxy = result.proxies.find((p) => p.id === result.activeProxyId);
      }
      
      if (targetProxy && targetProxy.username) {
        asyncCallback({
          authCredentials: {
            username: targetProxy.username,
            password: targetProxy.password
          }
        });
      } else {
        asyncCallback();
      }
    });
  },
  { urls: ["<all_urls>"] },
  ['asyncBlocking']
);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'setProxy') {
    if (request.proxy && request.proxy.username) {
      cachedAuth = { username: request.proxy.username, password: request.proxy.password };
    } else {
      cachedAuth = null;
    }
    applyConfig(request.proxy).then(() => {
      if (request.proxy) {
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
      } else {
        chrome.action.setBadgeText({ text: "" });
      }
      sendResponse({ success: true });
    });
    return true; 
  } 
  
  if (request.action === 'clearProxy') {
    cachedAuth = null;
    applyConfig(null).then(() => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'fetchIP') {
    async function executeFetchIP() {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        
        if (!data.error && data.ip) {
          sendResponse({ ip: data.ip, country_name: data.country_name || data.country });
          return;
        }
      } catch (err) {
        console.warn('Primary IP fetch failed, trying fallback:', err);
      }
      
      try {
        const fbRes = await fetch('https://api.ipify.org?format=json');
        const fbData = await fbRes.json();
        
        if (fbData && fbData.ip) {
          sendResponse({ ip: fbData.ip });
          return;
        }
      } catch (fbErr) {
        console.error('Fallback IP fetch failed:', fbErr);
      }
      
      sendResponse({ error: 'Failed to fetch IP' });
    }
    
    executeFetchIP();
    return true;
  }

  if (request.action === 'pingProxy') {
    async function executePingTest() {
      const proxy = request.proxy;
      
      if (proxy && proxy.username) {
        cachedAuth = { username: proxy.username, password: proxy.password };
      }
      
      await chrome.storage.local.set({ pingProxy: proxy });
      await applyConfig(proxy);
      
      let pingSuccess = false;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); 
        
        const response = await fetch('https://api.ipify.org?format=json', { 
            signal: controller.signal,
            cache: 'no-store'
        });
        
        clearTimeout(timeoutId);
        if (response.ok) {
           pingSuccess = true;
        }
      } catch (err) {
        console.error("Ping failed:", err);
      }
      
      await chrome.storage.local.remove('pingProxy');
      
      chrome.storage.local.get(['activeProxyId', 'proxies'], async (data) => {
        const activeProxy = (data.proxies && data.activeProxyId) 
          ? data.proxies.find((p) => p.id === data.activeProxyId) 
          : null;
          
        if (activeProxy && activeProxy.username) {
          cachedAuth = { username: activeProxy.username, password: activeProxy.password };
        } else {
          cachedAuth = null;
        }
        await applyConfig(activeProxy);
        sendResponse({ success: pingSuccess });
      });
    }
    
    executePingTest();
    return true; 
  }
});
// Initialize cache immediately on SW wake
initAuthCache();
