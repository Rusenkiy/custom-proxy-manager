document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('themeToggleBtn');

  // Reset confirming delete buttons when clicking elsewhere
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('btn-delete')) {
      document.querySelectorAll('.delete-confirm').forEach(btn => {
        btn.classList.remove('delete-confirm');
        btn.textContent = 'Delete';
      });
    }
  });

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
  
  const openPoolModalBtn = document.getElementById('openPoolModalBtn');
  const poolModal = document.getElementById('pool-modal');
  const closePoolModalBtn = document.getElementById('closePoolModalBtn');
  const poolSearch = document.getElementById('pool-search');
  const poolListEl = document.getElementById('pool-list');

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

  if (poolSearch) {
    poolSearch.addEventListener('input', renderPool);
  }
  
  if (openPoolModalBtn) {
    openPoolModalBtn.addEventListener('click', () => {
      if (typeof renderPool === 'function') renderPool();
      settingsMenu.classList.remove('show');
      poolModal.style.display = 'flex';
      setTimeout(() => {
        poolModal.classList.add('show');
      }, 10);
    });
  }

  if (closePoolModalBtn) {
    closePoolModalBtn.addEventListener('click', () => {
      poolModal.classList.remove('show');
      overlay.classList.remove('show');
      setTimeout(() => {
        poolModal.style.display = 'none';
        overlay.style.display = 'none';
      }, 150);
    });
  }

  if (poolSearch) {
    poolSearch.addEventListener('input', renderPool);
  }

  overlay.addEventListener('click', () => {
    settingsMenu.classList.remove('show');
    bulkImportModal.classList.remove('show');
    if (poolModal) poolModal.classList.remove('show');
    overlay.classList.remove('show');
    setTimeout(() => {
      bulkImportModal.style.display = 'none';
      if (poolModal) poolModal.style.display = 'none';
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
    if (result.proxies) {
      proxies = result.proxies.map(p => ({
        ...p,
        isPinned: p.isPinned === undefined ? true : p.isPinned
      }));
      chrome.storage.local.set({ proxies });
    }
    if (result.activeProxyId) activeProxyId = result.activeProxyId;
    renderProxies();
  });

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 200);
    }, 3000);
  }

  function isValidProxy(ip, port) {
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return false;
    const parts = ip.split('.');
    if (parts.length !== 4) return false;
    for (let p of parts) {
      if (!/^\d+$/.test(p)) return false;
      const num = parseInt(p, 10);
      if (num < 0 || num > 255) return false;
    }
    return true;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const host = document.getElementById('host').value.trim();
    const portString = document.getElementById('port').value.trim();
    
    if (!isValidProxy(host, portString)) {
      showToast('Invalid IP or Port format.', 'error');
      return;
    }

    const newProxy = {
      id: Date.now().toString(),
      type: selectedProxyType,
      name: document.getElementById('name').value,
      host: host,
      port: parseInt(portString, 10),
      username: document.getElementById('username').value,
      password: document.getElementById('password').value,
      isPinned: true,
    };

    proxies.push(newProxy);
    saveProxies();
    renderProxies();
    form.reset();

    proxyTypeBtns.forEach(b => b.classList.remove('active'));
    document.querySelector('.segment-btn[data-type="HTTP"]').classList.add('active');
    selectedProxyType = 'HTTP';

    formContainer.style.display = 'none';
    toggleBtn.textContent = 'Add New Proxy';
    showToast('Proxy added successfully!', 'success');
  });

  bulkImportForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const inputEl = document.getElementById('bulk-proxies-input');
    const lines = inputEl.value.trim().split('\n');
    let addedCount = 0;
    let skippedCount = 0;
    
    lines.forEach((line, index) => {
      if (!line.trim()) return;
      const parts = line.trim().split(':');
      if (parts.length >= 2) {
        const host = parts[0].trim();
        const portString = parts[1].trim();
        
        if (!isValidProxy(host, portString)) {
          skippedCount++;
          return;
        }
        
        const port = parseInt(portString, 10);
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
          password,
          isPinned: false
        };
        proxies.push(newProxy);
        addedCount++;
      }
    });
    
    if (addedCount > 0) {
      saveProxies();
      renderProxies();
      if (typeof renderPool === 'function') renderPool();
    }
    
    inputEl.value = '';
    bulkImportModal.classList.remove('show');
    overlay.classList.remove('show');
    setTimeout(() => {
      bulkImportModal.style.display = 'none';
      overlay.style.display = 'none';
      
      if (addedCount > 0 || skippedCount > 0) {
        showToast(`Imported ${addedCount} proxies. Skipped ${skippedCount} errors.`, skippedCount > 0 ? 'info' : 'success');
      }
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

    const pinnedProxies = proxies.filter(p => p.isPinned);

    if (pinnedProxies.length === 0) {
      proxyListEl.innerHTML = '<div style="font-size: 13px; color: #666;">No pinned proxies. Add one or import to the pool.</div>';
      return;
    }

    pinnedProxies.forEach(proxy => {
      const isActive = proxy.id === activeProxyId;
      const el = document.createElement('div');
      el.className = `proxy-item ${isActive ? 'active' : ''}`;

      const pType = proxy.type || 'HTTP';
      const badgeEl = document.createElement('div');
      badgeEl.className = 'proxy-type-badge';
      badgeEl.textContent = pType;
      
      const unpinBtn = document.createElement('button');
      unpinBtn.className = 'btn-icon';
      unpinBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path>
        </svg>
      `;
      unpinBtn.style.position = 'absolute';
      unpinBtn.style.top = '4px';
      unpinBtn.style.right = '40px';
      unpinBtn.title = 'Unpin Proxy';
      unpinBtn.onclick = () => {
        if (isActive) setActiveProxy(null);
        proxy.isPinned = false;
        saveProxies();
        
        el.style.height = el.offsetHeight + 'px';
        el.classList.add('removing');
        requestAnimationFrame(() => el.classList.add('removing-active'));
        setTimeout(renderProxies, 300);
      };
      
      el.appendChild(badgeEl);
      el.appendChild(unpinBtn);

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
      let confirmTimeout;
      
      deleteBtn.onclick = () => {
        if (deleteBtn.classList.contains('delete-confirm')) {
          if (isActive) setActiveProxy(null);
          proxies = proxies.filter(p => p.id !== proxy.id);
          saveProxies();
          
          el.style.height = el.offsetHeight + 'px'; // Fix initial height for transition
          el.classList.add('removing');
          
          requestAnimationFrame(() => {
            el.classList.add('removing-active');
          });
          
          setTimeout(() => {
            renderProxies();
          }, 300);
        } else {
          // Reset others
          document.querySelectorAll('.delete-confirm').forEach(b => {
            b.classList.remove('delete-confirm');
            b.textContent = 'Delete';
          });
          
          deleteBtn.classList.add('delete-confirm');
          deleteBtn.textContent = 'Confirm?';
          
          if (confirmTimeout) clearTimeout(confirmTimeout);
          confirmTimeout = setTimeout(() => {
            if (deleteBtn.classList.contains('delete-confirm')) {
              deleteBtn.classList.remove('delete-confirm');
              deleteBtn.textContent = 'Delete';
            }
          }, 3000); // 3 seconds timeout
        }
      };
      actions.appendChild(deleteBtn);

      el.appendChild(actions);
      proxyListEl.appendChild(el);
    });
  }

  function renderPool() {
    if (!poolListEl) return;
    poolListEl.innerHTML = '';
    
    const query = poolSearch ? poolSearch.value.trim().toLowerCase() : '';
    
    let filtered = proxies;
    if (query) {
      filtered = proxies.filter(p => 
        (p.name && p.name.toLowerCase().includes(query)) || 
        (p.host && p.host.toLowerCase().includes(query))
      );
    }
    
    if (filtered.length === 0) {
      poolListEl.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); text-align: center; padding: 10px;">No proxies found in pool.</div>';
      return;
    }
    
    filtered.forEach(proxy => {
      const isPinned = proxy.isPinned;
      const el = document.createElement('div');
      el.className = 'pool-item';
      
      const info = document.createElement('div');
      info.className = 'pool-info';
      
      const status = document.createElement('div');
      status.className = `pool-status ${proxy.id === activeProxyId ? 'online' : ''}`;
      
      const details = document.createElement('div');
      
      const name = document.createElement('div');
      name.className = 'pool-name';
      name.textContent = proxy.name || 'Unnamed';
      
      const addr = document.createElement('div');
      addr.className = 'pool-address';
      addr.textContent = `${proxy.host}:${proxy.port}`;
      
      details.appendChild(name);
      details.appendChild(addr);
      
      info.appendChild(status);
      info.appendChild(details);
      
      const actions = document.createElement('div');
      actions.className = 'pool-actions';
      
      const pinBtn = document.createElement('button');
      pinBtn.textContent = '📌';
      pinBtn.title = isPinned ? 'Unpin from main screen' : 'Pin to main screen';
      pinBtn.style.background = isPinned ? '#007bff' : 'transparent';
      pinBtn.style.color = isPinned ? '#fff' : 'var(--text-muted)';
      pinBtn.style.border = '1px solid ' + (isPinned ? '#007bff' : 'var(--border)');
      pinBtn.style.borderRadius = '4px';
      pinBtn.onclick = () => {
        proxy.isPinned = !proxy.isPinned;
        saveProxies();
        renderProxies();
        renderPool();
      };
      
      const delBtn = document.createElement('button');
      delBtn.className = 'btn-delete pool-del-btn';
      delBtn.textContent = '🗑️';
      delBtn.title = 'Delete completely';
      delBtn.style.borderRadius = '4px';
      let poolConfirmTimeout;
      delBtn.onclick = (e) => {
        if (delBtn.classList.contains('delete-confirm')) {
          if (proxy.id === activeProxyId) setActiveProxy(null);
          proxies = proxies.filter(p => p.id !== proxy.id);
          saveProxies();
          renderProxies();
          renderPool();
        } else {
          document.querySelectorAll('.pool-del-btn.delete-confirm').forEach(b => {
            b.classList.remove('delete-confirm');
            b.textContent = '🗑️';
          });
          
          delBtn.classList.add('delete-confirm');
          delBtn.textContent = 'Sure?';
          
          if (poolConfirmTimeout) clearTimeout(poolConfirmTimeout);
          poolConfirmTimeout = setTimeout(() => {
            if (delBtn.classList.contains('delete-confirm')) {
              delBtn.classList.remove('delete-confirm');
              delBtn.textContent = '🗑️';
            }
          }, 3000);
        }
      };
      
      actions.appendChild(pinBtn);
      actions.appendChild(delBtn);
      
      el.appendChild(info);
      el.appendChild(actions);
      poolListEl.appendChild(el);
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