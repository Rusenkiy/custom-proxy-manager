document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  // Theme initialization
  chrome.storage.local.get(['theme'], (result) => {
    let savedTheme = result.theme;
    
    if (!savedTheme) {
      // Check system preference
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      savedTheme = isSystemDark ? 'dark' : 'light';
    }
    
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      themeToggleBtn.textContent = '☀️';
    } else {
      document.documentElement.classList.add('light');
      themeToggleBtn.textContent = '🌙';
    }
  });

  themeToggleBtn.addEventListener('click', () => {
    let newTheme = 'light';
    const isDark = document.documentElement.classList.contains('dark') || 
                   (!document.documentElement.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
                   
    if (isDark) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
      themeToggleBtn.textContent = '🌙';
      newTheme = 'light';
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
      themeToggleBtn.textContent = '☀️';
      newTheme = 'dark';
    }
    chrome.storage.local.set({ theme: newTheme });
  });

  const form = document.getElementById('add-proxy-form');
  const proxyListEl = document.getElementById('proxy-list');
  const toggleBtn = document.getElementById('toggleFormBtn');
  const formContainer = document.getElementById('addProxyFormContainer');

  const ipText = document.getElementById('ip-text');
  const refreshIpBtn = document.getElementById('refresh-ip-btn');

  async function fetchCurrentIP() {
    if (ipText) ipText.textContent = 'My IP: Fetching...';
    
    try {
      // Primary API
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      
      if (data.error) throw new Error('API Error');
      
      if (data.ip) {
        if (ipText) ipText.textContent = `My IP: ${data.ip} (${data.country_name || data.country || 'Unknown'})`;
        return;
      }
    } catch (err) {
      // Fallback API
      try {
        const fallbackRes = await fetch('https://api.ipify.org?format=json');
        const fallbackData = await fallbackRes.json();
        
        if (fallbackData.ip) {
          if (ipText) ipText.textContent = `My IP: ${fallbackData.ip}`;
          return;
        }
      } catch (fallbackErr) {
        console.error('IP Check failed:', fallbackErr);
      }
    }
    
    // UI failure state
    if (ipText) ipText.textContent = 'My IP: Click to retry';
  }

  if (refreshIpBtn) {
    refreshIpBtn.addEventListener('click', fetchCurrentIP);
  }

  // Initial fetch on load
  fetchCurrentIP();

  let proxies = [];
  let activeProxyId = null;
  let selectedProxyType = 'HTTP';

  const proxyTypeBtns = document.querySelectorAll('.segment-btn');
  proxyTypeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      proxyTypeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedProxyType = btn.dataset.type;
    });
  });

  toggleBtn.addEventListener('click', () => {
    if (formContainer.style.display === 'none') {
      formContainer.style.display = 'block';
      toggleBtn.textContent = 'Close';
    } else {
      formContainer.style.display = 'none';
      toggleBtn.textContent = '+ Add New Proxy';
    }
  });

  // Load proxies and active state
  chrome.storage.local.get(['proxies', 'activeProxyId'], (result) => {
    if (result.proxies) proxies = result.proxies;
    if (result.activeProxyId) activeProxyId = result.activeProxyId;
    renderProxies();
  });

    form.addEventListener('submit', (e) => {
    e.preventDefault();
    const newProxy = {
      id: Date.now().toString(),
      type: selectedProxyType,
      name: document.getElementById('name').value,
      host: document.getElementById('host').value,
      port: parseInt(document.getElementById('port').value, 10),
      username: document.getElementById('username').value,
      password: document.getElementById('password').value,
    };

    proxies.push(newProxy);
    saveProxies();
    renderProxies();
    form.reset();

    // Reset proxy type to default HTTP
    proxyTypeBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('.segment-btn[data-type="HTTP"]').classList.add('active');
    selectedProxyType = 'HTTP';

    // Hide form after successful addition
    formContainer.style.display = 'none';
    toggleBtn.textContent = '+ Add New Proxy';
  });

  function saveProxies() {
    chrome.storage.local.set({ proxies });
  }

  function setActiveProxy(id) {
    activeProxyId = id;
    chrome.storage.local.set({ activeProxyId });
    renderProxies();

    if (id) {
      const proxy = proxies.find(p => p.id === id);
      chrome.runtime.sendMessage({ action: 'setProxy', proxy });
    } else {
      chrome.runtime.sendMessage({ action: 'clearProxy' });
    }

    // Give proxy a bit of time to apply before testing the connection and fetching the new IP
    setTimeout(fetchCurrentIP, 1000);
  }

  function renderProxies() {
    proxyListEl.innerHTML = '';

    if (proxies.length === 0) {
      proxyListEl.innerHTML = '<div style="font-size: 13px; color: #666;">No proxies saved.</div>';
      return;
    }

    proxies.forEach(proxy => {
      const isActive = proxy.id === activeProxyId;
      const el = document.createElement('div');
      el.className = `proxy-item ${isActive ? 'active' : ''}`;

      const pType = proxy.type || 'HTTP';
      const badgeEl = document.createElement('div');
      badgeEl.className = 'proxy-type-badge';
      badgeEl.textContent = pType;
      el.appendChild(badgeEl);

      const header = document.createElement('div');
      header.className = 'proxy-header';

      const info = document.createElement('div');
      info.style.flexGrow = '1';
      
      const nameContainer = document.createElement('div');
      nameContainer.className = 'proxy-name-container';
      
      const nameEl = document.createElement('div');
      nameEl.className = 'proxy-name';
      nameEl.textContent = proxy.name;
      
      const editBtn = document.createElement('button');
      editBtn.className = 'btn-icon';
      editBtn.innerHTML = '✎';
      editBtn.title = 'Edit Name';
      
      nameContainer.appendChild(nameEl);
      nameContainer.appendChild(editBtn);
      
      const addressEl = document.createElement('div');
      addressEl.className = 'proxy-address';
      addressEl.textContent = `${proxy.host}:${proxy.port}`;
      
      info.appendChild(nameContainer);
      info.appendChild(addressEl);
      header.appendChild(info);
      
      // Edit button logic
      editBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'edit-input';
        input.value = proxy.name;
        
        const saveBtn = document.createElement('button');
        saveBtn.className = 'btn-icon';
        saveBtn.innerHTML = '✓';
        saveBtn.title = 'Save';
        
        nameContainer.innerHTML = '';
        nameContainer.appendChild(input);
        nameContainer.appendChild(saveBtn);
        input.focus();
        
        let isSaving = false;
        const saveName = () => {
          if (isSaving) return;
          isSaving = true;
          const newName = input.value.trim() || proxy.name;
          proxy.name = newName;
          saveProxies();
          renderProxies();
        };
        
        // Use mousedown to prevent input blur event race condition
        saveBtn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          saveName();
        });
        
        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') saveName();
          if (e.key === 'Escape') renderProxies(); // Cancel on escape
        });
      });

      const pingResult = document.createElement('div');
      pingResult.className = 'ping-result';
      pingResult.id = `ping-result-${proxy.id}`;
      header.appendChild(pingResult);

      el.appendChild(header);

      const actions = document.createElement('div');
      actions.className = 'proxy-actions';

      const connectBtn = document.createElement('button');
      if (isActive) {
        connectBtn.textContent = 'Disconnect';
        connectBtn.className = 'btn-disconnect';
        connectBtn.onclick = () => setActiveProxy(null);
      } else {
        connectBtn.textContent = 'Connect';
        connectBtn.className = 'btn-connect';
        connectBtn.onclick = () => setActiveProxy(proxy.id);
      }
      actions.appendChild(connectBtn);

      const pingBtn = document.createElement('button');
      pingBtn.textContent = 'Ping';
      pingBtn.className = 'btn-ping';
      pingBtn.onclick = () => {
        pingResult.textContent = 'Pinging...';
        pingResult.className = 'ping-result ping-loading';

        chrome.runtime.sendMessage({ action: 'pingProxy', proxy }, (response) => {
          if (response && response.success) {
            pingResult.textContent = '● Online';
            pingResult.className = 'ping-result ping-success';
          } else {
            pingResult.textContent = '● Offline';
            pingResult.className = 'ping-result ping-fail';
          }
        });
      };
      actions.appendChild(pingBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'btn-delete';
      deleteBtn.onclick = () => {
        if (isActive) {
          setActiveProxy(null);
        }
        proxies = proxies.filter(p => p.id !== proxy.id);
        saveProxies();
        renderProxies();
      };
      actions.appendChild(deleteBtn);

      el.appendChild(actions);
      proxyListEl.appendChild(el);
    });
  }
});