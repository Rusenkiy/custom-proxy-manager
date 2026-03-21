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
  if (!proxy) {
    return new Promise((resolve) => {
      chrome.proxy.settings.clear({ scope: 'regular' }, resolve);
    });
  }
  
  const config = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "http",
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

chrome.webRequest.onAuthRequired.addListener(
  function(details, asyncCallback) {
    if (!details.isProxy) {
      asyncCallback();
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
    applyConfig(request.proxy).then(() => {
      chrome.action.setBadgeText({ text: "ON" });
      chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
      sendResponse({ success: true });
    });
    return true; 
  } 
  
  if (request.action === 'clearProxy') {
    applyConfig(null).then(() => {
      chrome.action.setBadgeText({ text: "" });
      sendResponse({ success: true });
    });
    return true;
  }

  if (request.action === 'pingProxy') {
    async function executePingTest() {
      const proxy = request.proxy;
      
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
          
        await applyConfig(activeProxy);
        sendResponse({ success: pingSuccess });
      });
    }
    
    executePingTest();
    return true; 
  }
});