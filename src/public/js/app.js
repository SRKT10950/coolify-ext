/**
 * Coolify Port & Domain Pilot - Frontend Controller
 */

// Application State
const state = {
  apps: [],
  config: {},
  status: {},
  portsOverview: {}
};

// DOM Elements
const elements = {
  connectionPill: document.getElementById('connection-status-pill'),
  connectionText: document.getElementById('connection-status-text'),
  totalApps: document.getElementById('metric-total-apps'),
  nextFreePort: document.getElementById('metric-next-free-port'),
  availablePorts: document.getElementById('metric-available-ports'),
  exposedMetric: document.getElementById('metric-exposed-ports'),
  exposureBanner: document.getElementById('exposure-alert-banner'),
  exposureCount: document.getElementById('exposure-alert-count'),
  appsContainer: document.getElementById('apps-container'),
  btnRefresh: document.getElementById('btn-refresh-apps'),
  btnAutoAssignAll: document.getElementById('btn-auto-assign-all'),
  btnUnexposeAll: document.getElementById('btn-unexpose-all'),
  
  // Settings Dialog
  settingsDialog: document.getElementById('settings-dialog'),
  btnOpenSettings: document.getElementById('btn-open-settings'),
  btnCloseSettings: document.getElementById('btn-close-settings'),
  btnCancelSettings: document.getElementById('btn-cancel-settings'),
  settingsForm: document.getElementById('settings-form'),
  cfgUrl: document.getElementById('cfg-url'),
  cfgToken: document.getElementById('cfg-token'),
  cfgPortStart: document.getElementById('cfg-port-start'),
  cfgPortEnd: document.getElementById('cfg-port-end'),
  cfgAutoRedeploy: document.getElementById('cfg-auto-redeploy'),
  cfgAutoSetPortEnv: document.getElementById('cfg-auto-set-port-env'),

  // Port Matrix Dialog
  portsDialog: document.getElementById('ports-dialog'),
  btnOpenPorts: document.getElementById('btn-open-ports'),
  btnClosePorts: document.getElementById('btn-close-ports'),
  btnClosePortsFooter: document.getElementById('btn-close-ports-footer'),
  portsTableBody: document.getElementById('ports-table-body'),
  matrixAllocated: document.getElementById('matrix-allocated-count'),
  matrixFree: document.getElementById('matrix-free-count'),
  matrixReserved: document.getElementById('matrix-reserved-count'),
  matrixExposed: document.getElementById('matrix-exposed-count'),

  toastContainer: document.getElementById('toast-container')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadAllData();
});

function setupEventListeners() {
  elements.btnRefresh.addEventListener('click', () => {
    showToast('Refreshing application list...', 'info');
    loadAllData();
  });

  elements.btnAutoAssignAll.addEventListener('click', handleAutoAssignAll);
  elements.btnUnexposeAll.addEventListener('click', handleUnexposeAll);

  // Settings Modal
  elements.btnOpenSettings.addEventListener('click', () => {
    populateSettingsForm();
    elements.settingsDialog.showModal();
  });
  elements.btnCloseSettings.addEventListener('click', () => elements.settingsDialog.close());
  elements.btnCancelSettings.addEventListener('click', () => elements.settingsDialog.close());
  elements.settingsForm.addEventListener('submit', handleSaveSettings);

  // Port Matrix Modal
  elements.btnOpenPorts.addEventListener('click', () => {
    renderPortMatrix();
    elements.portsDialog.showModal();
  });
  elements.btnClosePorts.addEventListener('click', () => elements.portsDialog.close());
  elements.btnClosePortsFooter.addEventListener('click', () => elements.portsDialog.close());
}

async function loadAllData() {
  await Promise.all([
    fetchStatus(),
    fetchConfig(),
    fetchApps(),
    fetchPortsOverview()
  ]);
  updateMetrics();
}

async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    state.status = data.status || {};
    renderConnectionStatus();
  } catch (err) {
    console.error('Failed to fetch status:', err);
    renderConnectionError();
  }
}

async function fetchConfig() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    if (data.success) {
      state.config = data.config;
    }
  } catch (err) {
    console.error('Failed to fetch config:', err);
  }
}

async function fetchApps() {
  try {
    const res = await fetch('/api/apps');
    const data = await res.json();
    if (data.success) {
      state.apps = data.apps || [];
      renderApps();
    } else {
      elements.appsContainer.innerHTML = `
        <div class="empty-state">
          <p style="color: var(--danger);">Failed to load applications: ${data.error}</p>
        </div>`;
    }
  } catch (err) {
    elements.appsContainer.innerHTML = `
      <div class="empty-state">
        <p style="color: var(--danger);">Error connecting to backend: ${err.message}</p>
      </div>`;
  }
}

async function fetchPortsOverview() {
  try {
    const res = await fetch('/api/ports/overview');
    const data = await res.json();
    if (data.success) {
      state.portsOverview = data;
    }
  } catch (err) {
    console.error('Failed to fetch ports overview:', err);
  }
}

function renderConnectionStatus() {
  const pill = elements.connectionPill;
  const text = elements.connectionText;
  const s = state.status;

  pill.className = 'status-pill';

  if (!s.connected) {
    pill.classList.add('status-pill-error');
    text.textContent = 'Disconnected';
  } else if (s.mode === 'mock') {
    pill.classList.add('status-pill-mock');
    text.textContent = 'Demo Mode (Coolify Mock)';
  } else {
    pill.classList.add('status-pill-live');
    text.textContent = `Coolify Live (${s.version || 'Connected'})`;
  }
}

function renderConnectionError() {
  elements.connectionPill.className = 'status-pill status-pill-error';
  elements.connectionText.textContent = 'Offline';
}

function updateMetrics() {
  const apps = state.apps || [];
  elements.totalApps.textContent = apps.length;

  const exposedCount = apps.filter(a => a.hasDangerousHostExposure).length;
  if (exposedCount > 0) {
    elements.exposureBanner.style.display = 'flex';
    elements.exposureCount.textContent = exposedCount;
    elements.exposedMetric.textContent = `${exposedCount} Exposed!`;
    elements.exposedMetric.className = 'metric-value';
    elements.exposedMetric.style.color = 'var(--danger)';
  } else {
    elements.exposureBanner.style.display = 'none';
    elements.exposedMetric.textContent = '100% Sealed';
    elements.exposedMetric.className = 'metric-value metric-value-safe';
  }

  if (state.portsOverview && state.portsOverview.freeSlotsCount !== undefined) {
    elements.availablePorts.textContent = state.portsOverview.freeSlotsCount;
  }

  // Next free port
  const nextPort = findClientSuggestedNextFree();
  elements.nextFreePort.textContent = nextPort || 'N/A';
}

function findClientSuggestedNextFree() {
  const config = state.config || {};
  const start = config.portRangeStart || 3100;
  const end = config.portRangeEnd || 9999;
  const used = new Set();

  (state.portsOverview.usedPorts || []).forEach(p => used.add(p.port));
  state.apps.forEach(a => {
    if (a.currentPort) used.add(Number(a.currentPort));
  });

  for (let p = start; p <= end; p++) {
    if (!used.has(p)) return p;
  }
  return null;
}

function renderApps() {
  const apps = state.apps;
  if (!apps || apps.length === 0) {
    elements.appsContainer.innerHTML = `
      <div class="empty-state">
        <p>No applications found in Coolify instance.</p>
      </div>`;
    return;
  }

  elements.appsContainer.innerHTML = '';

  apps.forEach(app => {
    const card = document.createElement('div');
    card.className = `app-card ${app.hasDangerousHostExposure ? 'has-exposure' : ''}`;
    card.id = `card-${app.uuid}`;

    const cleanDomain = (app.fqdn || '').replace(/^https?:\/\//i, '');
    const currentPort = app.currentPort || app.suggestedPort || '';

    card.innerHTML = `
      <!-- App Info -->
      <div class="app-info">
        <div class="app-name-row">
          <span class="badge ${app.status === 'running' ? 'badge-success' : 'badge-muted'}">${app.status}</span>
          <h3 class="app-name" title="${escapeHtml(app.name)}">${escapeHtml(app.name)}</h3>
        </div>
        <div class="app-uuid">${escapeHtml(app.uuid)}</div>
        ${app.git_repository ? `<small class="form-hint" style="margin:0;">${escapeHtml(app.git_repository.split('/').slice(-2).join('/'))}</small>` : ''}
      </div>

      <!-- Domain Input -->
      <div class="app-domain-col">
        <label class="form-label">Domain Routing (FQDN)</label>
        <div class="input-with-icon">
          <span class="input-icon-prefix">https://</span>
          <input 
            type="text" 
            class="domain-input" 
            id="domain-${app.uuid}" 
            value="${escapeHtml(cleanDomain)}" 
            placeholder="subdomain.example.com" 
            autocomplete="off"
            spellcheck="false"
          >
        </div>
        <span class="domain-hint">Routed securely through Coolify Reverse Proxy</span>
      </div>

      <!-- Free Port Allocation -->
      <div class="app-port-col">
        <label class="form-label">Internal Port</label>
        <div class="port-input-group">
          <input 
            type="number" 
            class="port-input" 
            id="port-${app.uuid}" 
            value="${currentPort}" 
            min="1024" 
            max="65535"
            placeholder="Port"
          >
          <button 
            type="button" 
            class="btn-magic-port" 
            title="Auto-assign next free collision-free port" 
            onclick="handleAutoAssignSingle('${app.uuid}')"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </button>
        </div>
        <div>
          ${app.hasDangerousHostExposure 
            ? `<span class="zero-expose-pill danger" title="Port ${escapeHtml(app.ports_mappings)} is exposed on the host!">
                 <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01M12 3a9 9 0 100 18 9 9 0 000-18z" />
                 </svg>
                 Host Exposed (${escapeHtml(app.ports_mappings)})
               </span>`
            : `<span class="zero-expose-pill safe" title="Internal only. No host ports exposed.">
                 <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                   <path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                 </svg>
                 Internal Only (0 Exposed)
               </span>`
          }
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="app-actions-col">
        <button 
          type="button" 
          class="btn btn-primary btn-sm" 
          id="btn-save-${app.uuid}"
          onclick="handleSaveApp('${app.uuid}', false)"
        >
          Save & Apply
        </button>
        <button 
          type="button" 
          class="btn btn-secondary btn-sm" 
          id="btn-deploy-${app.uuid}"
          onclick="handleSaveApp('${app.uuid}', true)"
        >
          Save & Redeploy
        </button>
      </div>
    `;

    elements.appsContainer.appendChild(card);
  });
}

// Handler: Auto-Assign Single App
window.handleAutoAssignSingle = async function(uuid) {
  try {
    const res = await fetch(`/api/apps/${uuid}/allocate-port`, { method: 'POST' });
    const data = await res.json();
    if (data.success && data.freePort) {
      const portInput = document.getElementById(`port-${uuid}`);
      if (portInput) {
        portInput.value = data.freePort;
        portInput.style.borderColor = 'var(--primary)';
        portInput.style.boxShadow = '0 0 8px var(--primary)';
        setTimeout(() => {
          portInput.style.boxShadow = '';
        }, 1000);
      }
      showToast(`Assigned free port ${data.freePort} for app`, 'success');
    } else {
      showToast(data.error || 'Could not find free port', 'error');
    }
  } catch (err) {
    showToast(`Error assigning port: ${err.message}`, 'error');
  }
};

// Handler: Save and Configure App
window.handleSaveApp = async function(uuid, redeploy = false) {
  const domainInput = document.getElementById(`domain-${uuid}`);
  const portInput = document.getElementById(`port-${uuid}`);
  const saveBtn = document.getElementById(`btn-save-${uuid}`);
  const deployBtn = document.getElementById(`btn-deploy-${uuid}`);

  const rawDomain = domainInput ? domainInput.value.trim() : '';
  const port = portInput ? Number(portInput.value) : null;

  if (!port || isNaN(port)) {
    showToast('Please specify or auto-assign an internal port', 'error');
    if (portInput) portInput.focus();
    return;
  }

  // Disable buttons while saving
  if (saveBtn) saveBtn.disabled = true;
  if (deployBtn) deployBtn.disabled = true;

  try {
    showToast(`Configuring app ${uuid}...`, 'info');

    const res = await fetch(`/api/apps/${uuid}/configure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: rawDomain ? `https://${rawDomain.replace(/^https?:\/\//i, '')}` : '',
        port,
        redeploy
      })
    });

    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Saved successfully! Zero host ports exposed.', 'success');
      await loadAllData();
    } else {
      showToast(data.error || 'Failed to save configuration', 'error');
    }
  } catch (err) {
    showToast(`Save error: ${err.message}`, 'error');
  } finally {
    if (saveBtn) saveBtn.disabled = false;
    if (deployBtn) deployBtn.disabled = false;
  }
};

// Handler: Auto-Assign All Free Ports
async function handleAutoAssignAll() {
  const apps = state.apps;
  if (!apps || apps.length === 0) return;

  const confirmMsg = `Auto-assign collision-free internal ports to all ${apps.length} applications?`;
  if (!confirm(confirmMsg)) return;

  showToast('Calculating and assigning collision-free ports for all apps...', 'info');

  const updates = [];
  const assignedSet = new Set();
  const start = state.config.portRangeStart || 3100;
  const end = state.config.portRangeEnd || 9999;

  // Collect reserved ports
  const reserved = new Set((state.portsOverview.usedPorts || []).filter(p => p.source === 'reserved').map(p => p.port));

  let currentCandidate = start;

  for (const app of apps) {
    const domainInput = document.getElementById(`domain-${app.uuid}`);
    const domain = domainInput ? domainInput.value.trim() : (app.fqdn || '');

    // Find next free port
    while (reserved.has(currentCandidate) || assignedSet.has(currentCandidate)) {
      currentCandidate++;
      if (currentCandidate > end) break;
    }

    const assignedPort = currentCandidate;
    assignedSet.add(assignedPort);
    currentCandidate++;

    updates.push({
      uuid: app.uuid,
      domain: domain ? `https://${domain.replace(/^https?:\/\//i, '')}` : '',
      port: assignedPort
    });

    // Update input on UI immediately
    const portInput = document.getElementById(`port-${app.uuid}`);
    if (portInput) {
      portInput.value = assignedPort;
      portInput.style.borderColor = 'var(--primary)';
    }
  }

  try {
    const res = await fetch('/api/apps/batch-configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates, autoAssignAll: false, redeployAll: false })
    });

    const data = await res.json();
    if (data.success) {
      showToast(`Successfully assigned collision-free ports to all ${data.processed} apps!`, 'success');
      await loadAllData();
    } else {
      showToast(data.error || 'Batch configure error', 'error');
    }
  } catch (err) {
    showToast(`Error batch assigning ports: ${err.message}`, 'error');
  }
}

// Handler: Seal and Unexpose All Host Ports
async function handleUnexposeAll() {
  if (!confirm('This will remove all host-to-container port mappings across all applications so only Coolify reverse proxy handles traffic. Proceed?')) {
    return;
  }

  try {
    showToast('Clearing all host port exposures...', 'info');
    const res = await fetch('/api/apps/unexpose-all', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'All exposed ports sealed!', 'success');
      await loadAllData();
    } else {
      showToast(data.error || 'Error clearing exposures', 'error');
    }
  } catch (err) {
    showToast(`Failed: ${err.message}`, 'error');
  }
}

// Settings Form Population & Submit
function populateSettingsForm() {
  const cfg = state.config || {};
  elements.cfgUrl.value = cfg.coolifyApiUrl || '';
  elements.cfgToken.value = '';
  elements.cfgPortStart.value = cfg.portRangeStart || 3100;
  elements.cfgPortEnd.value = cfg.portRangeEnd || 9999;
  elements.cfgAutoRedeploy.checked = Boolean(cfg.autoRedeploy);
  elements.cfgAutoSetPortEnv.checked = cfg.autoSetPortEnv !== false;
}

async function handleSaveSettings(e) {
  e.preventDefault();

  const payload = {
    coolifyApiUrl: elements.cfgUrl.value.trim(),
    portRangeStart: Number(elements.cfgPortStart.value),
    portRangeEnd: Number(elements.cfgPortEnd.value),
    autoRedeploy: elements.cfgAutoRedeploy.checked,
    autoSetPortEnv: elements.cfgAutoSetPortEnv.checked
  };

  const token = elements.cfgToken.value.trim();
  if (token) {
    payload.coolifyApiToken = token;
  }

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      showToast('Settings saved successfully!', 'success');
      elements.settingsDialog.close();
      await loadAllData();
    } else {
      showToast(data.error || 'Failed to save settings', 'error');
    }
  } catch (err) {
    showToast(`Error: ${err.message}`, 'error');
  }
}

// Render Port Matrix Modal
function renderPortMatrix() {
  const overview = state.portsOverview || {};
  const used = overview.usedPorts || [];

  const allocated = used.filter(u => u.source === 'coolify_expose' || u.source === 'registry');
  const reserved = used.filter(u => u.source === 'reserved');
  const exposed = overview.exposedHostViolations || [];

  elements.matrixAllocated.textContent = allocated.length;
  elements.matrixFree.textContent = overview.freeSlotsCount || '...';
  elements.matrixReserved.textContent = reserved.length;
  elements.matrixExposed.textContent = exposed.length;

  elements.portsTableBody.innerHTML = '';

  // Sort by port number
  const sorted = [...used].sort((a, b) => a.port - b.port);

  if (sorted.length === 0) {
    elements.portsTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No ports registered.</td></tr>';
    return;
  }

  sorted.forEach(item => {
    const row = document.createElement('tr');
    let badgeClass = 'badge-primary';
    let statusText = 'Allocated';
    let exposure = 'Internal Only (Safe)';

    if (item.source === 'reserved') {
      badgeClass = 'badge-muted';
      statusText = 'Reserved';
      exposure = 'System Level';
    } else if (item.isDangerousExposure) {
      badgeClass = 'badge-danger';
      statusText = 'Host Exposed';
      exposure = '⚠️ Published to Host';
    }

    row.innerHTML = `
      <td><strong>${item.port}</strong></td>
      <td><span class="badge ${badgeClass}">${statusText}</span></td>
      <td>${escapeHtml(item.appName || item.appUuid || 'Unknown')}</td>
      <td>${exposure}</td>
    `;
    elements.portsTableBody.appendChild(row);
  });
}

// Utilities
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
