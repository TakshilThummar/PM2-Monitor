const express = require('express');
const pm2 = require('pm2');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process'); // Import the exec function
const app = express();
const basicAuth = require('express-basic-auth');

// Serve static HTML, CSS, and JS files
app.use(express.static('public'));

// Basic Authentication Middleware
app.use(basicAuth({
    users: { 'admin': 'password' }, // Replace with your username and password
    challenge: true,
    unauthorizedResponse: (req) => 'Unauthorized'
}));

// Get the list of all running PM2 services
app.get('/services', (req, res) => {
  pm2.connect((err) => {
    if (err) {
      res.status(500).json({ error: 'Failed to connect to PM2' });
      return;
    }
    pm2.list((err, list) => {
      if (err) {
        return res.status(500).json({ error: 'Could not retrieve services' });
      }
      const services = list.map(proc => ({
        name: proc.name,
        id: proc.pm_id,
        status: proc.pm2_env.status,
      }));
      res.json(services);
    });
  });
});

// Get logs (error or out) for a selected service
app.get('/logs/:service/:type', (req, res) => {
  const { service, type } = req.params;
  const logType = type === 'error' ? 'error' : 'out';
  const logPath = `/home/hlink/.pm2/logs/${service}-${logType}.log`; // Adjust the log path if needed

  fs.readFile(logPath, 'utf8', (err, data) => {
    if (err) {
      return res.status(500).json({ error: `Could not read ${type} log for ${service}` });
    }
    res.json({ logs: data });
  });
});

app.post('/pm2/flush/:service', (req, res) => {
  const { service } = req.params;
  exec(`pm2 flush ${service}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${stderr}`);
      return res.json({ success: false });
    }
    res.json({ success: true });
  });
});

// Restart the selected PM2 service
app.post('/restart/:service', (req, res) => {
  const { service } = req.params;

  pm2.connect((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to connect to PM2' });
    }
    pm2.restart(service, (err) => {
      if (err) {
        return res.status(500).json({ error: `Failed to restart service ${service}` });
      }
      res.json({ message: `${service} restarted successfully` });
    });
  });
}); 
const port = 5000;
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
