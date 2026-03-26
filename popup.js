function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

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
  const overlay = document.getElementById('overlay');
  const bulkImportModal = document.getElementById('bulk-import-modal');
  const bulkImportForm = document.getElementById('bulk-import-form');
  
  const poolModal = document.getElementById('pool-modal');
  const poolSearch = document.getElementById('pool-search');
  const poolListEl = document.getElementById('pool-list');
  const footerBindBtn = document.getElementById('footerBindBtn');

  const ipText = document.getElementById('ip-text');
  const refreshIpBtn = document.getElementById('refresh-ip-btn');

  let isSelectionMode = false;
  let currentDomainToBind = '';

  function updateFooterLinkStatus() {
    if (!footerBindBtn || !currentDomainToBind) return;
    const isLinked = proxies.some(p => p.mappedDomains && p.mappedDomains.includes(currentDomainToBind));
    if (isLinked) {
      footerBindBtn.style.color = 'var(--accent, #007bff)';
      footerBindBtn.title = 'Domain is linked';
    } else {
      footerBindBtn.style.color = 'var(--text-muted)';
      footerBindBtn.title = 'Bind Domain to Proxy';
    }
  }

  function createDomainBadges(proxy, containerElement) {
    if (!proxy.mappedDomains || proxy.mappedDomains.length === 0) return;
    const badgesContainer = document.createElement('div');
    badgesContainer.className = 'domain-badges';
    
    proxy.mappedDomains.forEach(domain => {
      const badge = document.createElement('div');
      badge.className = 'domain-badge';
      const origText = domain.charAt(0).toUpperCase();
      badge.textContent = origText;
      badge.title = domain;
      badge.dataset.action = 'unlink';
      badge.dataset.domain = domain;
      
      badgesContainer.appendChild(badge);
    });
    containerElement.appendChild(badgesContainer);
  }

  function createInlineNameEditor(proxy, containerClass, nameClass) {
    const nameContainer = document.createElement('div');
    nameContainer.className = containerClass;
    nameContainer.style.display = 'flex';
    nameContainer.style.alignItems = 'center';
    nameContainer.style.gap = '6px';
    
    const nameEl = document.createElement('span');
    if (nameClass) nameEl.className = nameClass;
    nameEl.textContent = proxy.name || 'Unnamed';
    nameEl.style.cursor = 'text';
    nameEl.dataset.action = 'edit';

    const editBtn = document.createElement('span');
    editBtn.innerHTML = '✎';
    editBtn.title = 'Edit Name';
    editBtn.style.cursor = 'pointer';
    editBtn.style.fontSize = '12px';
    editBtn.style.color = 'var(--text-muted)';
    editBtn.style.lineHeight = '1';
    editBtn.dataset.action = 'edit';

    nameContainer.appendChild(nameEl);
    nameContainer.appendChild(editBtn);
    createDomainBadges(proxy, nameContainer);
    return nameContainer;
  }

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

  if (poolSearch) {
    poolSearch.addEventListener('input', debounce(renderPool, 200));
  }

  // ── Universal Modal Opener (data-target stacking) ──────────────────────────
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-target]');
    if (trigger) {
      const targetId = trigger.dataset.target;
      const targetModal = document.getElementById(targetId);
      if (targetModal) {
        overlay.style.display = 'block';
        targetModal.style.display = targetModal.classList.contains('bottom-sheet') ? 'block' : 'flex';
        // Trigger pool render when opening pool modal
        if (targetId === 'pool-modal' && typeof renderPool === 'function') renderPool();
        // Small reflow delay for CSS transition
        setTimeout(() => {
          overlay.classList.add('show');
          targetModal.classList.add('show');
        }, 10);
      }
    }
  });

  // ── Universal Modal Closer (.btn-close — closes the nearest modal) ─────────
  document.addEventListener('click', (e) => {
    if (e.target.closest('.btn-close')) {
      const modalToClose = e.target.closest('.modal, .bottom-sheet');
      if (modalToClose) {
        modalToClose.classList.remove('show');
        // If it's the pool modal closing, reset selection mode
        if (modalToClose.id === 'pool-modal') {
          isSelectionMode = false;
          if (typeof renderPool === 'function') renderPool();
        }
        setTimeout(() => {
          modalToClose.style.display = 'none';
          // Check if ANY modals are still visible in the stack. If not, hide overlay.
          if (!document.querySelector('.modal.show, .bottom-sheet.show')) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.style.display = 'none', 150);
          }
        }, 150);
      }
    }
  });

  // ── Universal Overlay Click (closes entire stack) ──────────────────────────
  overlay.addEventListener('click', () => {
    isSelectionMode = false;
    if (typeof renderPool === 'function') renderPool();

    document.querySelectorAll('.modal.show, .bottom-sheet.show').forEach(m => {
      m.classList.remove('show');
      setTimeout(() => m.style.display = 'none', 150);
    });

    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 150);
  });

  // Load proxies and active state
  chrome.storage.local.get(['proxies', 'activeProxyId'], (result) => {
    if (result.proxies) {
      proxies = result.proxies.map(p => ({
        ...p,
        isPinned: p.isPinned === undefined ? true : p.isPinned,
        mappedDomains: Array.isArray(p.mappedDomains) ? p.mappedDomains : []
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
      mappedDomains: []
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
          isPinned: false,
          mappedDomains: []
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
    chrome.runtime.sendMessage({ action: 'refreshConfig' });
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
    const fragment = document.createDocumentFragment();

    const pinnedProxies = proxies.filter(p => p.isPinned);

    if (pinnedProxies.length === 0) {
      proxyListEl.innerHTML = '<div style="font-size: 13px; color: #666;">No pinned proxies. Add one or import to the pool.</div>';
      return;
    }

    pinnedProxies.forEach(proxy => {
      const isActive = proxy.id === activeProxyId;
      const el = document.createElement('div');
      el.className = `proxy-item ${isActive ? 'active' : ''}`;
      el.dataset.id = proxy.id;

      const pType = proxy.type || 'HTTP';
      const badgeEl = document.createElement('div');
      badgeEl.className = 'proxy-type-badge';
      badgeEl.textContent = pType;
      
      const unpinBtn = document.createElement('button');
      unpinBtn.className = 'btn-icon';
      unpinBtn.dataset.action = 'unpin';
      unpinBtn.innerHTML = `
        <svg style="pointer-events:none;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"></path>
        </svg>
      `;
      unpinBtn.style.position = 'absolute';
      unpinBtn.style.top = '4px';
      unpinBtn.style.right = '40px';
      unpinBtn.title = 'Unpin Proxy';
      
      el.appendChild(badgeEl);
      el.appendChild(unpinBtn);

      const header = document.createElement('div');
      header.className = 'proxy-header';

      const info = document.createElement('div');
      info.style.flexGrow = '1';
      const nameContainer = createInlineNameEditor(proxy, 'proxy-name-container', 'proxy-name');

      const addressEl = document.createElement('div');
      addressEl.className = 'proxy-address';
      addressEl.textContent = `${proxy.host}:${proxy.port}`;
      
      info.appendChild(nameContainer);
      info.appendChild(addressEl);
      header.appendChild(info);

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
        connectBtn.dataset.action = 'disconnect';
      } else {
        connectBtn.textContent = 'Connect';
        connectBtn.className = 'btn-connect';
        connectBtn.dataset.action = 'connect';
      }
      actions.appendChild(connectBtn);

      const pingBtn = document.createElement('button');
      pingBtn.textContent = 'Ping';
      pingBtn.className = 'btn-ping';
      pingBtn.dataset.action = 'ping';
      actions.appendChild(pingBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = 'Delete';
      deleteBtn.className = 'btn-delete';
      deleteBtn.dataset.action = 'delete';
      actions.appendChild(deleteBtn);

      el.appendChild(actions);
      fragment.appendChild(el);
    });
    
    proxyListEl.appendChild(fragment);
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
    
    const fragment = document.createDocumentFragment();
    
    filtered.forEach(proxy => {
      const isPinned = proxy.isPinned;
      const el = document.createElement('div');
      el.className = 'pool-item';
      el.dataset.id = proxy.id;
      
      const info = document.createElement('div');
      info.className = 'pool-info';
      
      const status = document.createElement('div');
      status.className = `pool-status ${proxy.id === activeProxyId ? 'online' : ''}`;
      
      const details = document.createElement('div');
      
      const nameContainer = createInlineNameEditor(proxy, 'pool-name');
      
      const addr = document.createElement('div');
      addr.className = 'pool-address';
      addr.textContent = `${proxy.host}:${proxy.port}`;
      
      details.appendChild(nameContainer);
      details.appendChild(addr);
      
      info.appendChild(status);
      info.appendChild(details);
      
      const actions = document.createElement('div');
      actions.className = 'pool-actions';
      
      if (isSelectionMode) {
        const selectBtn = document.createElement('button');
        selectBtn.textContent = '🔗 Select';
        selectBtn.className = 'pool-sel-btn';
        selectBtn.dataset.action = 'select';
        selectBtn.style.background = 'var(--accent, #007bff)';
        selectBtn.style.color = '#fff';
        selectBtn.style.border = 'none';
        selectBtn.style.padding = '4px 8px';
        selectBtn.style.borderRadius = '4px';
        selectBtn.style.cursor = 'pointer';
        actions.appendChild(selectBtn);
      } else {
        const pinBtn = document.createElement('button');
        pinBtn.textContent = '📌';
        pinBtn.dataset.action = 'pin';
        pinBtn.title = isPinned ? 'Unpin from main screen' : 'Pin to main screen';
        pinBtn.style.background = isPinned ? '#007bff' : 'transparent';
        pinBtn.style.color = isPinned ? '#fff' : 'var(--text-muted)';
        pinBtn.style.border = '1px solid ' + (isPinned ? '#007bff' : 'var(--border)');
        pinBtn.style.borderRadius = '4px';
        
        const delBtn = document.createElement('button');
        delBtn.className = 'btn-delete pool-del-btn';
        delBtn.dataset.action = 'delete';
        delBtn.textContent = '🗑️';
        delBtn.title = 'Delete completely';
        delBtn.style.borderRadius = '4px';
        
        actions.appendChild(pinBtn);
        actions.appendChild(delBtn);
      }
      
      el.appendChild(info);
      el.appendChild(actions);
      fragment.appendChild(el);
    });
    
    poolListEl.appendChild(fragment);
  }

  // Get current tab domain
  if (chrome.tabs && chrome.tabs.query) {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0] && tabs[0].url) {
        try {
          let url = new URL(tabs[0].url);
          if (url.protocol.startsWith('http')) {
            const domainEl = document.getElementById('current-domain');
            if (domainEl) {
              let host = url.hostname;
              if (host.startsWith('www.')) host = host.slice(4);
              currentDomainToBind = host;
              domainEl.textContent = host;
              if (footerBindBtn) {
                footerBindBtn.style.display = 'block';
                updateFooterLinkStatus();
              }
            }
          }
        } catch(e) {}
      }
    });
  }

  if (footerBindBtn) {
    footerBindBtn.addEventListener('click', () => {
      isSelectionMode = true;
      if (typeof renderPool === 'function') renderPool();
      const poolModal = document.getElementById('pool-modal');
      if (poolModal) {
        overlay.style.display = 'block';
        poolModal.style.display = 'flex';
        setTimeout(() => {
          overlay.classList.add('show');
          poolModal.classList.add('show');
        }, 10);
      }
    });
  }

  let confirmTimeout;
  if (proxyListEl && !proxyListEl.dataset.delegated) {
    proxyListEl.dataset.delegated = 'true';
    proxyListEl.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !btn.dataset.action) return;
      
      const item = e.target.closest('.proxy-item');
      if (!item) return;
      
      const proxyId = item.dataset.id;
      const proxy = proxies.find(p => p.id === proxyId);
      if (!proxy) return;

            if (btn.dataset.action === 'edit') {
        const nameContainer = btn.closest('.' + (item.classList.contains('proxy-item') ? 'proxy-name-container' : 'pool-name'));
        if (!nameContainer) return;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = proxy.name || '';
        input.style.width = '120px';
        input.style.fontSize = 'inherit';
        input.style.fontFamily = 'inherit';
        input.style.padding = '0';
        input.style.background = 'transparent';
        input.style.border = 'none';
        input.style.borderBottom = '1px solid var(--text-muted)';
        input.style.outline = 'none';
        input.style.color = 'var(--text)';
        
        nameContainer.innerHTML = '';
        nameContainer.appendChild(input);
        
        input.focus();
        input.select();
        
        let isSaving = false;
        const saveName = () => {
          if (isSaving) return;
          isSaving = true;
          const newName = input.value.trim();
          if (newName) {
            proxy.name = newName;
            saveProxies();
          }
          renderProxies();
          if (typeof renderPool === 'function') renderPool();
        };
        
        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') saveName();
          if (evt.key === 'Escape') {
            isSaving = true;
            renderProxies();
            if (typeof renderPool === 'function') renderPool();
          }
        });
      } else if (btn.dataset.action === 'unlink') {
        const domain = btn.dataset.domain;
        if (!domain) return;
        
        if (btn.classList.contains('unlink-confirm')) {
          proxy.mappedDomains = proxy.mappedDomains.filter(d => d !== domain);
          saveProxies();
          renderProxies();
          if (typeof renderPool === 'function') renderPool();
          if (typeof updateFooterLinkStatus === 'function') updateFooterLinkStatus();
          showToast('Site unlinked', 'success');
        } else {
          document.querySelectorAll('.unlink-confirm').forEach(b => {
            b.classList.remove('unlink-confirm');
            b.textContent = b.dataset.domain.charAt(0).toUpperCase();
            b.title = b.dataset.domain;
          });
          
          btn.classList.add('unlink-confirm');
          btn.textContent = 'Unlink?';
          btn.title = '';
          
          btn.addEventListener('mouseleave', function resetUnlink() {
              if (btn.classList.contains('unlink-confirm')) {
                  btn.classList.remove('unlink-confirm');
                  btn.textContent = domain.charAt(0).toUpperCase();
                  btn.title = domain;
              }
              btn.removeEventListener('mouseleave', resetUnlink);
          }, { once: true });
        }
      } else if (btn.dataset.action === 'connect') {
        setActiveProxy(proxyId);
        chrome.runtime.sendMessage({ action: 'setProxy', proxy: proxy });
      } else if (btn.dataset.action === 'disconnect') {
        setActiveProxy(null);
        chrome.runtime.sendMessage({ action: 'clearProxy' });
      } else if (btn.dataset.action === 'ping') {
        btn.textContent = '...';
        const pingResult = document.getElementById(`ping-result-${proxy.id}`);
        if (pingResult) {
          pingResult.textContent = 'Pinging...';
          pingResult.className = 'ping-result ping-loading';
        }
        chrome.runtime.sendMessage({ action: 'pingProxy', proxy }, (response) => {
          if (pingResult) {
            if (response && response.success) {
              pingResult.textContent = '● Online';
              pingResult.className = 'ping-result ping-success';
            } else {
              pingResult.textContent = '● Offline';
              pingResult.className = 'ping-result ping-fail';
            }
          }
          btn.textContent = 'Ping';
        });
      } else if (btn.dataset.action === 'unpin') {
        if (activeProxyId === proxy.id) setActiveProxy(null);
        proxy.isPinned = false;
        saveProxies();
        item.style.height = item.offsetHeight + 'px';
        item.classList.add('removing');
        requestAnimationFrame(() => item.classList.add('removing-active'));
        setTimeout(renderProxies, 300);
      } else if (btn.dataset.action === 'delete') {
        if (btn.classList.contains('delete-confirm')) {
          if (activeProxyId === proxyId) setActiveProxy(null);
          proxies = proxies.filter(p => p.id !== proxyId);
          saveProxies();
          
          item.style.height = item.offsetHeight + 'px';
          item.classList.add('removing');
          requestAnimationFrame(() => item.classList.add('removing-active'));
          setTimeout(() => renderProxies(), 300);
        } else {
          document.querySelectorAll('.delete-confirm').forEach(b => {
            b.classList.remove('delete-confirm');
            b.textContent = 'Delete';
          });
          
          btn.classList.add('delete-confirm');
          btn.textContent = 'Confirm?';
          
          if (confirmTimeout) clearTimeout(confirmTimeout);
          confirmTimeout = setTimeout(() => {
            if (btn.classList.contains('delete-confirm')) {
              btn.classList.remove('delete-confirm');
              btn.textContent = 'Delete';
            }
          }, 3000);
        }
      }
    });
  }

  let poolConfirmTimeout;
  if (poolListEl && !poolListEl.dataset.delegated) {
    poolListEl.dataset.delegated = 'true';
    poolListEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn || !btn.dataset.action) return;
      
      const item = e.target.closest('.pool-item');
      if (!item) return;
      
      const proxyId = item.dataset.id;
      const proxy = proxies.find(p => p.id === proxyId);
      if (!proxy) return;

            if (btn.dataset.action === 'edit') {
        const nameContainer = btn.closest('.' + (item.classList.contains('proxy-item') ? 'proxy-name-container' : 'pool-name'));
        if (!nameContainer) return;
        
        const input = document.createElement('input');
        input.type = 'text';
        input.value = proxy.name || '';
        input.style.width = '120px';
        input.style.fontSize = 'inherit';
        input.style.fontFamily = 'inherit';
        input.style.padding = '0';
        input.style.background = 'transparent';
        input.style.border = 'none';
        input.style.borderBottom = '1px solid var(--text-muted)';
        input.style.outline = 'none';
        input.style.color = 'var(--text)';
        
        nameContainer.innerHTML = '';
        nameContainer.appendChild(input);
        
        input.focus();
        input.select();
        
        let isSaving = false;
        const saveName = () => {
          if (isSaving) return;
          isSaving = true;
          const newName = input.value.trim();
          if (newName) {
            proxy.name = newName;
            saveProxies();
          }
          renderProxies();
          if (typeof renderPool === 'function') renderPool();
        };
        
        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (evt) => {
          if (evt.key === 'Enter') saveName();
          if (evt.key === 'Escape') {
            isSaving = true;
            renderProxies();
            if (typeof renderPool === 'function') renderPool();
          }
        });
      } else if (btn.dataset.action === 'unlink') {
        const domain = btn.dataset.domain;
        if (!domain) return;
        
        if (btn.classList.contains('unlink-confirm')) {
          proxy.mappedDomains = proxy.mappedDomains.filter(d => d !== domain);
          saveProxies();
          renderProxies();
          if (typeof renderPool === 'function') renderPool();
          if (typeof updateFooterLinkStatus === 'function') updateFooterLinkStatus();
          showToast('Site unlinked', 'success');
        } else {
          document.querySelectorAll('.unlink-confirm').forEach(b => {
            b.classList.remove('unlink-confirm');
            b.textContent = b.dataset.domain.charAt(0).toUpperCase();
            b.title = b.dataset.domain;
          });
          
          btn.classList.add('unlink-confirm');
          btn.textContent = 'Unlink?';
          btn.title = '';
          
          btn.addEventListener('mouseleave', function resetUnlink() {
              if (btn.classList.contains('unlink-confirm')) {
                  btn.classList.remove('unlink-confirm');
                  btn.textContent = domain.charAt(0).toUpperCase();
                  btn.title = domain;
              }
              btn.removeEventListener('mouseleave', resetUnlink);
          }, { once: true });
        }
      } else if (btn.dataset.action === 'select') {
        const existingProxy = proxies.find(p => p.mappedDomains && p.mappedDomains.includes(currentDomainToBind));
        if (existingProxy && existingProxy.id !== proxy.id) {
          showToast(`Domain is already linked to ${existingProxy.name}`, 'error');
          return;
        }
        if (!proxy.mappedDomains.includes(currentDomainToBind)) {
          proxy.mappedDomains.push(currentDomainToBind);
          saveProxies();
          renderProxies();
          updateFooterLinkStatus();
          showToast(`Domain linked to ${proxy.name}`, 'success');
        } else {
          showToast(`Domain is already linked to this proxy`, 'info');
        }
        
        isSelectionMode = false;
        renderPool();
        const poolModal = document.getElementById('pool-modal');
        const overlay = document.getElementById('overlay');
        if (poolModal) poolModal.classList.remove('show');
        if (overlay) overlay.classList.remove('show');
        setTimeout(() => {
          if (poolModal) poolModal.style.display = 'none';
          if (overlay) overlay.style.display = 'none';
        }, 150);
      } else if (btn.dataset.action === 'pin') {
        proxy.isPinned = !proxy.isPinned;
        saveProxies();
        renderProxies();
        renderPool();
      } else if (btn.dataset.action === 'delete') {
        if (btn.classList.contains('delete-confirm')) {
          if (proxy.id === activeProxyId) setActiveProxy(null);
          proxies = proxies.filter(p => p.id !== proxyId);
          saveProxies();
          
          item.style.height = item.offsetHeight + 'px';
          item.classList.add('removing');
          requestAnimationFrame(() => item.classList.add('removing-active'));
          setTimeout(() => renderPool(), 300);
        } else {
          document.querySelectorAll('.pool-del-btn.delete-confirm').forEach(b => {
            b.classList.remove('delete-confirm');
            b.textContent = '🗑️';
          });
          
          btn.classList.add('delete-confirm');
          btn.textContent = 'Sure?';
          
          if (poolConfirmTimeout) clearTimeout(poolConfirmTimeout);
          poolConfirmTimeout = setTimeout(() => {
            if (btn.classList.contains('delete-confirm')) {
              btn.classList.remove('delete-confirm');
              btn.textContent = '🗑️';
            }
          }, 3000);
        }
      }
    });
  }

});