let selectedService = '';
let selectedLogType = 'out';

const logContent = document.getElementById('logContent');
const logTitle = document.getElementById('logTitle');

window.onload = async function () {
  await fetchServices();
  initializeControls();
  setInterval(fetchLogs, 3000);
};

function initializeControls() {
  // ----- Service Dropdown -----
  const serviceDropdown = document.getElementById('serviceDropdown');
  const serviceOptions = document.getElementById('serviceOptions');

  serviceDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleDropdown(serviceOptions);
  });

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#serviceDropdownContainer')) {
      closeAllDropdowns();
    }
  });

  // ----- Log Type Segmented Radio -----
  document.querySelectorAll('input[name="logType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectedLogType = e.target.value;
      updateLogTitle();
      fetchLogs();
    });
  });

  // ----- Restart Button -----
  document.getElementById('restartButton').addEventListener('click', async () => {
    if (!selectedService) {
      showToast('Please select a service to restart.', 'warning');
      return;
    }
    const btn = document.getElementById('restartButton');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Restarting...';
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
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-power-off"></i> Restart';
    }
  });

  // ----- Flush Button -----
  document.getElementById('flushButton').addEventListener('click', () => {
    if (!selectedService) {
      showToast('Please select a service to flush logs.', 'warning');
      return;
    }
    fetch(`/pm2/flush/${selectedService}`, { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          showToast(`${selectedService} logs flushed successfully.`, 'success');
          logContent.textContent = '--- Logs flushed ---';
        } else {
          showToast(data.error || `Failed to flush ${selectedService} logs.`, 'error');
        }
      })
      .catch(() => showToast('Network error — could not flush logs.', 'error'));
  });

  // ----- Download Button -----
  document.getElementById('downloadLogBtn').addEventListener('click', () => {
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
  });
}

function toggleDropdown(options) {
  const isOpen = options.classList.contains('show');
  closeAllDropdowns();
  if (!isOpen) {
    document.getElementById('serviceDropdownContainer').classList.add('active');
    options.classList.add('show');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
}

async function fetchServices() {
  try {
    const response = await fetch('/services');
    const services = await response.json();
    const serviceOptions = document.getElementById('serviceOptions');

    serviceOptions.innerHTML = '';

    if (!services || services.length === 0) {
      serviceOptions.innerHTML = '<div class="dropdown-option">No services found</div>';
      return;
    }

    services.forEach(service => {
      const isOnline = service.status === 'online';
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.dataset.value = service.name;
      option.innerHTML = `
        <i class="fas fa-circle" style="color: ${isOnline ? 'var(--success-color)' : 'var(--danger-color)'}; font-size: 0.6rem;"></i>
        <span>${service.name}</span>
        <span style="margin-left: auto; font-size: 0.75rem; color: var(--text-secondary);">${service.status}</span>
      `;

      option.addEventListener('click', () => {
        selectedService = service.name;
        document.getElementById('serviceDropdown').querySelector('.selected-text').textContent = service.name;
        serviceOptions.querySelectorAll('.dropdown-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');
        closeAllDropdowns();
        updateLogTitle();
        fetchLogs();
      });

      serviceOptions.appendChild(option);
    });
  } catch (error) {
    console.error('Error fetching services:', error);
    document.getElementById('serviceOptions').innerHTML = '<div class="dropdown-option">Error loading services</div>';
  }
}

async function fetchLogs() {
  if (!selectedService) {
    return;
  }
  try {
    const response = await fetch(`/logs/${selectedService}/${selectedLogType}`);
    const data = await response.json();
    if (data.logs !== undefined) {
      const wasAtBottom = logContent.scrollHeight - logContent.scrollTop <= logContent.clientHeight + 50;
      logContent.textContent = data.logs || '--- Log file is empty ---';
      if (wasAtBottom) {
        logContent.scrollTop = logContent.scrollHeight;
      }
    }
  } catch (error) {
    console.error(`Error fetching ${selectedLogType} logs:`, error);
  }
}

function updateLogTitle() {
  if (selectedService) {
    const typeLabel = selectedLogType === 'out' ? 'Access Log' : 'Error Log';
    logTitle.textContent = `${selectedService} — ${typeLabel}`;
  } else {
    logTitle.textContent = 'System Console';
  }
}

// ----- Toast Notification System -----
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
  toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i><span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}