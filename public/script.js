let selectedService = '';
let selectedLogType = 'out';

const logContent = document.getElementById('logContent');
const logTitle = document.getElementById('logTitle');

window.onload = async function() {
  await fetchServices();
  initializeDropdowns();
  setInterval(fetchLogs, 2000);
};

function initializeDropdowns() {
  const serviceDropdown = document.getElementById('serviceDropdown');
  const serviceOptions = document.getElementById('serviceOptions');
  serviceDropdown.addEventListener('click', () => {
    toggleDropdown(serviceOptions);
  });

  const logTypeRadios = document.querySelectorAll('input[name="logType"]');
  logTypeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      selectedLogType = e.target.value;
      updateLogTitle();
      fetchLogs();
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-dropdown')) {
      closeAllDropdowns();
    }
  });

  document.getElementById('flushButton').addEventListener('click', function() {
    if (!selectedService) {
      alert('Please select a service to flush logs.');
      return;
    }
    fetch(`/pm2/flush/${selectedService}`, { method: 'POST' })
    .then(response => response.json())
    .then(data => {
      alert(data.success ? `${selectedService} logs flushed successfully!` : `Failed to flush ${selectedService} logs.`);
    })
    .catch(() => alert('An error occurred while flushing logs.'));
  });

  document.getElementById('restartButton').addEventListener('click', async () => {
    if (!selectedService) {
      alert('Please select a service to restart.');
      return;
    }
    try {
      const response = await fetch(`/restart/${selectedService}`, { method: 'POST' });
      const data = await response.json();
      alert(data.message);
    } catch (error) {
      alert('Failed to restart the service.');
    }
  });

  document.getElementById('downloadLogBtn').addEventListener('click', () => {
    if (!selectedService) {
      alert('Please select a service to download logs.');
      return;
    }
    const logText = logContent.textContent;
    if (logText === 'Select a service to view logs...' || logText === 'Logs cleared...') {
      alert('No logs to download.');
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
  });
}

function toggleDropdown(options) {
  const isOpen = options.classList.contains('show');
  const dropdown = options.closest('.custom-dropdown');
  closeAllDropdowns();
  if (!isOpen) {
    dropdown.classList.add('active');
    options.classList.add('show');
    options.previousElementSibling.classList.add('active');
  }
}

function closeAllDropdowns() {
  document.querySelectorAll('.dropdown-options').forEach(d => d.classList.remove('show'));
  document.querySelectorAll('.dropdown-selected').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.custom-dropdown').forEach(d => d.classList.remove('active'));
}

async function fetchServices() {
  try {
    const response = await fetch('/services');
    const services = await response.json();
    const serviceOptions = document.getElementById('serviceOptions');
    
    serviceOptions.innerHTML = '<div class="dropdown-option" data-value="">Choose a service...</div>';
    
    services.forEach(service => {
      const option = document.createElement('div');
      option.className = 'dropdown-option';
      option.dataset.value = service.name;
      option.innerHTML = `<i class="fas fa-${service.status === 'online' ? 'play-circle' : 'stop-circle'}"></i>${service.name} (ID: ${service.id}) - ${service.status}`;
      
      option.addEventListener('click', () => {
        selectedService = service.name;
        document.getElementById('serviceDropdown').querySelector('.selected-text').textContent = option.textContent;
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
  }
}

async function fetchLogs() {
  if (!selectedService) {
    logContent.textContent = 'Select a service to view logs...';
    return;
  }

  try {
    const response = await fetch(`/logs/${selectedService}/${selectedLogType}`);
    const data = await response.json();
    logContent.textContent = data.logs;
    logContent.scrollTop = logContent.scrollHeight;
  } catch (error) {
    console.error(`Error fetching ${selectedLogType} logs:`, error);
  }
}

function updateLogTitle() {
  if (selectedService) {
    const logTypeText = selectedLogType === 'out' ? 'Access' : 'Error';
    logTitle.textContent = `${selectedService} - ${logTypeText} Logs`;
  } else {
    logTitle.textContent = 'Console Output';
  }
}
