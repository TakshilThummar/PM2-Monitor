'use strict';

// ── State ─────────────────────────────────────────────────
let selectedService = '';
let selectedLogType = 'out';
let pollInterval = null;
let logFetchController = null; // AbortController for in-flight log requests

// ── DOM refs (cached once, not queried on every event) ────
const logContent = document.getElementById('logContent');
const logTitle = document.getElementById('logTitle');
const serviceDropdown = document.getElementById('serviceDropdown');
const serviceOptions = document.getElementById('serviceOptions');
const serviceDropdownContainer = document.getElementById('serviceDropdownContainer');
const restartBtn = document.getElementById('restartButton');

// ── Toast icon map ────────────────────────────────────────
const TOAST_ICONS = {
  success: 'check-circle',
  error: 'times-circle',
  warning: 'exclamation-triangle',
  info: 'info-circle',
};

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await fetchServices();
  initializeControls();
  startPolling();

  // Pause polling when tab is hidden to avoid unnecessary server load
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopPolling();
    } else {
      fetchLogs(); // immediate refresh on tab focus
      startPolling();
    }
  });
});

// ── Polling ───────────────────────────────────────────────
function startPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(fetchLogs, 3000);
}

function stopPolling() {
  clearInterval(pollInterval);
  pollInterval = null;
}

// ── Controls ──────────────────────────────────────────────
function initializeControls() {
  // Service dropdown
  serviceDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown();
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#serviceDropdownContainer')) {
      closeDropdown();
    }
  });

  // Log type radio buttons
  document.querySelectorAll('input[name="logType"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      selectedLogType = e.target.value;
      updateLogTitle();
      fetchLogs();
    });
  });

  // Restart button
  restartBtn.addEventListener('click', handleRestart);

  // Flush button
  document.getElementById('flushButton').addEventListener('click', handleFlush);

  // Download button
  document.getElementById('downloadLogBtn').addEventListener('click', handleDownload);
}

// ── Handlers ──────────────────────────────────────────────
async function handleRestart() {
  if (!selectedService) {
    showToast('Please select a service to restart.', 'warning');
    return;
  }

  restartBtn.disabled = true;
  restartBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';

  try {
    const response = await fetch(`/restart/${selectedService}`, { method: 'POST' });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || 'Failed to restart the service.', 'error');
    } else {
      showToast(data.message || `${selectedService} restarted successfully.`, 'success');
    }
  } catch {
    showToast('Network error — could not reach the server.', 'error');
  } finally {
    restartBtn.disabled = false;
    restartBtn.innerHTML = '<i class="fas fa-power-off"></i> Restart';
  }
}

function handleFlush() {
  if (!selectedService) {
    showToast('Please select a service to flush logs.', 'warning');
    return;
  }

  fetch(`/pm2/flush/${selectedService}`, { method: 'POST' })
    .then((res) => res.json())
    .then((data) => {
      if (data.success) {
        showToast(`${selectedService} logs flushed successfully.`, 'success');
        logContent.textContent = '--- Logs flushed ---';
      } else {
        showToast(data.error || `Failed to flush ${selectedService} logs.`, 'error');
      }
    })
    .catch(() => showToast('Network error — could not flush logs.', 'error'));
}

function handleDownload() {
  if (!selectedService) {
    showToast('Please select a service to download logs.', 'warning');
    return;
  }

  const logText = logContent.textContent;
  if (!logText || logText.startsWith('Initializing') || logText === '--- Logs flushed ---') {
    showToast('No logs available to download.', 'warning');
    return;
  }

  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${selectedService}-${selectedLogType}.log`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Download started.', 'success');
}

// ── Dropdown ──────────────────────────────────────────────
function toggleDropdown() {
  const isOpen = serviceOptions.classList.contains('show');
  closeDropdown();
  if (!isOpen) {
    serviceDropdownContainer.classList.add('active');
    serviceOptions.classList.add('show');
  }
}

function closeDropdown() {
  serviceOptions.classList.remove('show');
  serviceDropdownContainer.classList.remove('active');
}

// ── Fetch: services ───────────────────────────────────────
async function fetchServices() {
  try {
    const response = await fetch('/services');
    if (!response.ok) throw new Error('Server error');
    const services = await response.json();

    serviceOptions.innerHTML = '';

    if (!Array.isArray(services) || services.length === 0) {
      serviceOptions.innerHTML = '<div class="dropdown-option">No services found</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    services.forEach((service) => {
      const isOnline = service.status === 'online';
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.dataset.value = service.name;
      option.innerHTML = `
        <i class="fas fa-circle" style="color:${isOnline ? 'var(--success-color)' : 'var(--danger-color)'};font-size:0.6rem;"></i>
        <span>${service.name}</span>
        <span style="margin-left:auto;font-size:0.75rem;color:var(--text-secondary);">${service.status}</span>
      `;

      option.addEventListener('click', () => {
        selectedService = service.name;
        serviceDropdown.querySelector('.selected-text').textContent = service.name;
        serviceOptions.querySelectorAll('.dropdown-option').forEach((opt) => opt.classList.remove('active'));
        option.classList.add('active');
        closeDropdown();
        updateLogTitle();
        fetchLogs();
      });

      fragment.appendChild(option);
    });

    serviceOptions.appendChild(fragment);
  } catch (err) {
    console.error('[fetchServices]', err);
    serviceOptions.innerHTML = '<div class="dropdown-option">Error loading services</div>';
  }
}

// ── Fetch: logs ───────────────────────────────────────────
async function fetchLogs() {
  if (!selectedService) return;

  // Cancel any previous in-flight request before starting a new one
  if (logFetchController) {
    logFetchController.abort();
  }
  logFetchController = new AbortController();

  try {
    const response = await fetch(
      `/logs/${selectedService}/${selectedLogType}`,
      { signal: logFetchController.signal }
    );
    const data = await response.json();

    if (data.logs !== undefined) {
      const wasAtBottom = logContent.scrollHeight - logContent.scrollTop <= logContent.clientHeight + 50;
      logContent.textContent = data.logs || '--- Log file is empty ---';
      if (wasAtBottom) {
        logContent.scrollTop = logContent.scrollHeight;
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(`[fetchLogs] ${selectedLogType}:`, err);
    }
  }
}

// ── UI helpers ────────────────────────────────────────────
function updateLogTitle() {
  logTitle.textContent = selectedService
    ? `${selectedService} — ${selectedLogType === 'out' ? 'Access Log' : 'Error Log'}`
    : 'System Console';
}

// ── Toast ─────────────────────────────────────────────────
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const icon = TOAST_ICONS[type] || 'info-circle';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas fa-${icon}"></i><span>${message}</span>`;

  container.appendChild(toast);

  // Trigger animation on next frame
  requestAnimationFrame(() => toast.classList.add('show'));

  setTimeout(() => {
    toast.classList.remove('show');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 3500);
}