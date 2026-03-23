document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  // Theme initialization
  chrome.storage.local.get(['theme', 'adblockEnabled'], (result) => {
    let savedTheme = result.theme;
    
    // Set AdBlock toggle early
    const adblockToggle = document.getElementById('adblockToggle');
    if (adblockToggle) {
      adblockToggle.checked = !!result.adblockEnabled;

      adblockToggle.addEventListener('change', (e) => {
        chrome.storage.local.set({ adblockEnabled: e.target.checked }, () => {
          // Re-apply proxy settings based on new adblock state
          chrome.storage.local.get(['activeProxyId', 'proxies'], (data) => {
            const activeProxy = (data.proxies && data.activeProxyId) 
              ? data.proxies.find(p => p.id === data.activeProxyId)
              : null;
            chrome.runtime.sendMessage({ action: 'setProxy', proxy: activeProxy });
          });
        });
      });
    }

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
  const settingsBtn = document.getElementById('settingsBtn');
  const overlay = document.getElementById('overlay');
  const settingsMenu = document.getElementById('settings-menu');
  const openBulkImportBtn = document.getElementById('openBulkImportBtn');
  const bulkImportModal = document.getElementById('bulk-import-modal');
  const closeBulkImportModalBtn = document.getElementById('closeBulkImportModalBtn');
  const bulkImportForm = document.getElementById('bulk-import-form');

  const ipText = document.getElementById('ip-text');
  const refreshIpBtn = document.getElementById('refresh-ip-btn');

  async function fetchCurrentIP() {
    if (ipText) ipText.textContent = 'My IP: Fetching...';
    
    try {
      const response = await chrome.runtime.sendMessage({ action: 'fetchIP' });
      
      if (response && response.ip) {
        if (ipText) {
          ipText.textContent = `My IP: ${response.ip}${response.country_name ? ` (${response.country_name})` : ''}`;
        }
      } else {
        if (ipText) ipText.textContent = 'My IP: Click to retry';
      }
    } catch (err) {
      console.error('IP Check failed:', err);
      if (ipText) ipText.textContent = 'My IP: Click to retry';
    }
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
      toggleBtn.textContent = 'Add New Proxy';
    }
  });

  settingsBtn.addEventListener('click', () => {
    overlay.style.display = 'block';
    setTimeout(() => {
      overlay.classList.add('show');
      settingsMenu.classList.add('show');
    }, 10);
  });

  overlay.addEventListener('click', () => {
    settingsMenu.classList.remove('show');
    bulkImportModal.classList.remove('show');
    overlay.classList.remove('show');
    setTimeout(() => {
      bulkImportModal.style.display = 'none';
      overlay.style.display = 'none';
    }, 150);
  });

  openBulkImportBtn.addEventListener('click', () => {
    settingsMenu.classList.remove('show');
    bulkImportModal.style.display = 'flex';
    setTimeout(() => {
      bulkImportModal.classList.add('show');
    }, 10);
  });

  closeBulkImportModalBtn.addEventListener('click', () => {
    bulkImportModal.classList.remove('show');
    overlay.classList.remove('show');
    setTimeout(() => {
      bulkImportModal.style.display = 'none';
      overlay.style.display = 'none';
    }, 150);
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
    toggleBtn.textContent = 'Add New Proxy';
  });

  bulkImportForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('bulk-proxies-input');
    const lines = inputEl.value.trim().split('\n');
    let addedCount = 0;
    
    lines.forEach((line, index) => {
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        const host = parts[0].trim();
        const port = parseInt(parts[1].trim(), 10);
        if (!host || isNaN(port)) return; // Skip invalid
        
        const username = parts[2] ? parts[2].trim() : '';
        const password = parts[3] ? parts[3].trim() : '';
        
        const proxyCount = proxies.length + 1;
        const newProxy = {
          id: (Date.now() + index).toString(),
          type: 'HTTP', // Default type for bulk
          name: `Proxy ${proxyCount}`,
          host,
          port,
          username,
          password
        };
        proxies.push(newProxy);
        addedCount++;
      }
    });
    
    if (addedCount > 0) {
      saveProxies();
      renderProxies();
    }
    
    inputEl.value = '';
    bulkImportModal.classList.remove('show');
    overlay.classList.remove('show');
    setTimeout(() => {
      bulkImportModal.style.display = 'none';
      overlay.style.display = 'none';
    }, 150);
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

  // Get current tab domain
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url) {
        try {
          let url = new URL(tabs[0].url);
          const domainEl = document.getElementById('current-domain');
          if (domainEl) {
            domainEl.textContent = url.hostname;
          }
        } catch(e) {}
      }
    });
  }
});