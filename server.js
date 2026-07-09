'use strict';

const express = require('express');
const pm2 = require('pm2');
const { exec } = require('child_process');
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = 5000;

// ── Input validation ──────────────────────────────────────
// Allowlist: only permit service names that are safe for shell usage.
// Prevents shell injection via crafted service names.
const SAFE_NAME_RE = /^[a-zA-Z0-9_\-\.]+$/;

function isValidServiceName(name) {
  return typeof name === 'string' && SAFE_NAME_RE.test(name);
}

// ── Middleware ────────────────────────────────────────────
app.use(express.static('public'));
app.use(express.json());

app.use(basicAuth({
  users: { 'admin': 'password' }, // Replace with your credentials
  challenge: true,
  unauthorizedResponse: () => 'Unauthorized',
}));

// ── GET /services ─────────────────────────────────────────
app.get('/services', (req, res) => {
  pm2.connect((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not connect to PM2 daemon' });
    }
    pm2.list((listErr, list) => {
      pm2.disconnect();
      if (listErr) {
        return res.status(500).json({ error: 'Could not retrieve services' });
      }
      const services = list.map((proc) => ({
        name: proc.name,
        id: proc.pm_id,
        status: proc.pm2_env.status,
      }));
      res.json(services);
    });
  });
});

// ── GET /logs/:service/:type ──────────────────────────────
// Streams only the last 1000 lines via `tail` to keep memory usage constant,
// regardless of how large the log file grows.
app.get('/logs/:service/:type', (req, res) => {
  const { service, type } = req.params;

  if (!isValidServiceName(service)) {
    return res.status(400).json({ error: 'Invalid service name' });
  }

  const logType = type === 'error' ? 'error' : 'out';
  const logPath = `/home/hlink/.pm2/logs/${service}-${logType}.log`;

  exec(`tail -n 1000 "${logPath}"`, { maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
    if (error) {
      return res.status(500).json({ error: `Could not read ${logType} log for ${service}` });
    }
    res.json({ logs: stdout });
  });
});

// ── POST /pm2/flush/:service ──────────────────────────────
app.post('/pm2/flush/:service', (req, res) => {
  const { service } = req.params;

  if (!isValidServiceName(service)) {
    return res.status(400).json({ error: 'Invalid service name' });
  }

  exec(`pm2 flush "${service}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[flush] Error for "${service}":`, stderr);
      return res.status(500).json({ success: false, error: stderr });
    }
    res.json({ success: true });
  });
});

// ── POST /restart/:service ────────────────────────────────
// Uses the PM2 CLI via exec — more reliable than the programmatic
// API for long-running server processes.
app.post('/restart/:service', (req, res) => {
  const { service } = req.params;

  if (!isValidServiceName(service)) {
    return res.status(400).json({ error: 'Invalid service name' });
  }

  exec(`pm2 restart "${service}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`[restart] Error for "${service}":`, stderr);
      return res.status(500).json({ error: `Failed to restart "${service}". ${stderr}` });
    }
    res.json({ message: `"${service}" restarted successfully.` });
  });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[PM2 Monitor] Running at http://localhost:${PORT}`);
});