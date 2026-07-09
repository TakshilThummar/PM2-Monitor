const express = require('express');
const pm2 = require('pm2');
const fs = require('fs');
const { exec } = require('child_process');
const app = express();
const basicAuth = require('express-basic-auth');

// ── Static files ──────────────────────────────────────────
app.use(express.static('public'));

// ── Basic Auth ────────────────────────────────────────────
app.use(basicAuth({
  users: { 'admin': 'password' }, // Replace with your credentials
  challenge: true,
  unauthorizedResponse: () => 'Unauthorized'
}));

// ── Helper: connect, run a PM2 API call, then disconnect ──
// Using a per-request connect/disconnect pattern prevents
// the daemon from getting into a bad state on long-running servers.
function withPM2(callback) {
  pm2.connect((err) => {
    if (err) {
      return callback(new Error('Could not connect to PM2 daemon'), null);
    }
    callback(null);
  });
}

// ── GET /services ─────────────────────────────────────────
app.get('/services', (req, res) => {
  pm2.connect((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not connect to PM2 daemon' });
    }
    pm2.list((err, list) => {
      pm2.disconnect();
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

// ── GET /logs/:service/:type ──────────────────────────────
// Uses `tail` to avoid loading the entire file into memory.
app.get('/logs/:service/:type', (req, res) => {
  const { service, type } = req.params;
  const logType = type === 'error' ? 'error' : 'out';
  const logPath = `/home/hlink/.pm2/logs/${service}-${logType}.log`;

  exec(`tail -n 1000 "${logPath}"`, { maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
    if (error) {
      return res.status(500).json({ error: `Could not read ${type} log for ${service}` });
    }
    res.json({ logs: stdout });
  });
});

// ── POST /pm2/flush/:service ──────────────────────────────
app.post('/pm2/flush/:service', (req, res) => {
  const { service } = req.params;
  exec(`pm2 flush ${service}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Flush error: ${stderr}`);
      return res.status(500).json({ success: false, error: stderr });
    }
    res.json({ success: true });
  });
});

// ── POST /restart/:service ────────────────────────────────
// Using exec('pm2 restart') is more reliable than the
// programmatic API — it avoids daemon state issues entirely.
app.post('/restart/:service', (req, res) => {
  const { service } = req.params;
  exec(`pm2 restart "${service}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Restart error for ${service}:`, stderr);
      return res.status(500).json({ error: `Failed to restart "${service}". ${stderr}` });
    }
    res.json({ message: `"${service}" restarted successfully.` });
  });
});

// ── Start server ──────────────────────────────────────────
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`PM2 Monitor running at http://localhost:${PORT}`);
});