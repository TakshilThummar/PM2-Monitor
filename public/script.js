const serviceSelect = document.getElementById('service');
const logContent = document.getElementById('logContent');
const logTypeRadios = document.getElementsByName('logType');

// Fetch services when page loads
window.onload = async function() {
  await fetchServices();
};

// Fetch running PM2 services
async function fetchServices() {
  try {
    const response = await fetch('/services');
    const services = await response.json();
    services.forEach(service => {
      const option = document.createElement('option');
      option.value = service.name;
      option.textContent = `${service.name} (ID: ${service.id}) - ${service.status}`;
      serviceSelect.appendChild(option);
    });
  } catch (error) {
    console.error('Error fetching services:', error);
  }
}

document.getElementById('flushButton').addEventListener('click', function() {
  fetch('/pm2/flush', {
    method: 'POST'
  })
  .then(response => response.json())
  .then(data => {
    if (data.success) {
      alert('PM2 logs flushed successfully!');
    } else {
      alert('Failed to flush PM2 logs.');
    }
  })
  .catch(error => {
    console.error('Error:', error);
    alert('An error occurred while flushing PM2 logs.');
  });
});

// Fetch and display logs based on selected service and log type
async function fetchLogs() {
  const selectedService = serviceSelect.value;
  if (!selectedService) {
    logContent.textContent = 'Please select a service.';
    return;
  }

  const logType = Array.from(logTypeRadios).find(radio => radio.checked).value;
  
  try {
    const response = await fetch(`/logs/${selectedService}/${logType}`);
    const data = await response.json();
    logContent.textContent = data.logs;
    logContent.scrollTop = logContent.scrollHeight; // Auto scroll
  } catch (error) {
    console.error(`Error fetching ${logType} logs:`, error);
  }
}

// Fetch logs every 2 seconds
setInterval(fetchLogs, 2000);

// Fetch logs immediately when service or log type changes
serviceSelect.addEventListener('change', fetchLogs);
logTypeRadios.forEach(radio => radio.addEventListener('change', fetchLogs));

// Restart selected service
restartButton.addEventListener('click', async () => {
  const selectedService = serviceSelect.value;
  if (!selectedService) {
    alert('Please select a service to restart.');
    return;
  }

  try {
    const response = await fetch(`/restart/${selectedService}`, {
      method: 'POST',
    });
    const data = await response.json();
    alert(data.message);
  } catch (error) {
    console.error('Error restarting service:', error);
    alert('Failed to restart the service.');
  }
});
