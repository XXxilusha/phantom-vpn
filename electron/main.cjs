const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');
const proManager = require('./proManager.cjs');

const WARP_CLI = 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe';
const WARP_MSI_URL = 'https://1111-releases.cloudflareclient.com/windows/Cloudflare_WARP_Release-x64.msi';
const DOWNLOAD_DIR = path.join(app.getPath('temp'), 'phantom-vpn');
const MSI_PATH = path.join(DOWNLOAD_DIR, 'CloudflareWARP.msi');
const DATA_DIR = path.join(app.getPath('userData'), 'phantom-data');
const STATIC_IP_FILE = path.join(DATA_DIR, 'static-ip.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

let mainWindow;
let statusInterval = null;
let prevBytes = null;
let prevBytesTime = null;

// ==========================================
// WINDOW
// ==========================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 900,
    minWidth: 440,
    minHeight: 700,
    resizable: true,
    backgroundColor: '#030304',
    icon: path.join(__dirname, '../public/icon.ico'),
    acceptFirstMouse: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#030304', symbolColor: '#ffffff18', height: 32 },
  });

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(() => {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  createWindow();
  suppressWarpNotifications(); // fire-and-forget on startup
  ensureWarpDaemon();          // make sure the CloudflareWARP service is up
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });

function sendLog(msg, type = 'info') {
  if (mainWindow && !mainWindow.isDestroyed())
    mainWindow.webContents.send('warp-log', { msg, type });
}

// All commands are async — never block the event loop
function run(cmd, timeout = 15000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { encoding: 'utf8', windowsHide: true, timeout }, (err, stdout, stderr) => {
      if (err) reject(new Error((stderr || err.message).trim()));
      else resolve(stdout.trim());
    });
  });
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ==========================================
// SETTINGS
// ==========================================

function loadSettings() {
  try { if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch {}
  return { killSwitch: false, autoConnect: false, familiesMode: 'off' };
}
function saveSettings(data) {
  try { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2)); } catch {}
}

ipcMain.handle('settings-get', async () => loadSettings());
ipcMain.handle('settings-set', async (_, patch) => {
  saveSettings({ ...loadSettings(), ...patch });
  return { success: true };
});

// ==========================================
// DNS FAMILY MODE (block ads / malware / adult)
// ==========================================
// Modes: 'off' (none), 'malware' (1.1.1.2 — blocks malware),
//        'full' (1.1.1.3 — blocks malware + adult content)

const VALID_FAMILIES = new Set(['off', 'malware', 'full']);

ipcMain.handle('dns-families-get', async () => {
  const s = loadSettings();
  return { mode: VALID_FAMILIES.has(s.familiesMode) ? s.familiesMode : 'off' };
});

ipcMain.handle('dns-families-set', async (_, mode) => {
  if (!VALID_FAMILIES.has(mode)) return { success: false, error: 'invalid mode' };
  try {
    // New warp-cli syntax: `warp-cli dns families <mode>`.
    // Fall back to legacy `set-families-mode` if first form fails.
    try { await run(`"${WARP_CLI}" dns families ${mode}`, 5000); }
    catch { await run(`"${WARP_CLI}" set-families-mode ${mode}`, 5000); }

    saveSettings({ ...loadSettings(), familiesMode: mode });
    const label = mode === 'off' ? 'disabled' : mode === 'malware' ? 'Malware block' : 'Malware + Adult block';
    sendLog(`DNS filter: ${label}`, mode === 'off' ? 'info' : 'success');
    return { success: true, mode };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==========================================
// SPLIT TUNNELING (per-host bypass list)
// ==========================================
// Hosts in the list bypass the VPN — useful for banking sites,
// local IoT, region-locked services that block VPN, etc.

// Strict host validator: DNS name or IPv4. Prevents shell injection.
const HOST_RX = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+|(?:\d{1,3}\.){3}\d{1,3})$/i;

function sanitizeHost(host) {
  if (typeof host !== 'string') return null;
  const h = host.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return HOST_RX.test(h) ? h : null;
}

ipcMain.handle('split-list', async () => {
  try {
    const raw = await run(`"${WARP_CLI}" tunnel host list`, 5000);
    const hosts = raw.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !/^-+$/.test(l) && !/host\s*list/i.test(l) && !/^no\s/i.test(l))
      .map(l => l.replace(/^[-*•]\s*/, ''))
      .filter(l => HOST_RX.test(l));
    return { hosts: [...new Set(hosts)] };
  } catch {
    return { hosts: [] };
  }
});

ipcMain.handle('split-add', async (_, host) => {
  const h = sanitizeHost(host);
  if (!h) return { success: false, error: 'invalid host' };
  try {
    await run(`"${WARP_CLI}" tunnel host add ${h}`, 5000);
    sendLog(`Bypass: ${h}`, 'success');
    return { success: true, host: h };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('split-remove', async (_, host) => {
  const h = sanitizeHost(host);
  if (!h) return { success: false, error: 'invalid host' };
  try {
    await run(`"${WARP_CLI}" tunnel host remove ${h}`, 5000);
    sendLog(`Bypass removed: ${h}`, 'info');
    return { success: true, host: h };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==========================================
// AUTO-START
// ==========================================

ipcMain.handle('autostart-enable', async () => {
  try {
    if (!app.isPackaged) return { success: false, devMode: true };
    await run(`reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PhantomVPN" /t REG_SZ /d "${process.execPath}" /f`, 5000);
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('autostart-disable', async () => {
  try {
    await run(`reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PhantomVPN" /f`, 5000);
    return { success: true };
  } catch { return { success: false }; }
});

ipcMain.handle('autostart-status', async () => {
  try {
    const r = await run(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PhantomVPN"`, 3000);
    return { enabled: r.toLowerCase().includes('phantomvpn') };
  } catch { return { enabled: false }; }
});

// ==========================================
// SUPPRESS WARP NOTIFICATIONS
// ==========================================

// ==========================================
// WARP DAEMON (Windows service) — must be running for warp-cli to work.
// If the service is stopped, warp-cli fails with
// "Unable to connect to the CloudflareWARP daemon ... (os error 2)".
// ==========================================

async function isWarpDaemonRunning() {
  try {
    const r = await run(`sc query CloudflareWARP`, 4000);
    return /STATE\s*:\s*4\s*RUNNING/i.test(r);
  } catch { return false; }
}

async function ensureWarpDaemon() {
  if (await isWarpDaemonRunning()) return true;
  sendLog('Starting WARP service...', 'warn');

  // Try without elevation first (works if Electron itself was launched as admin)
  try { await run(`sc start CloudflareWARP`, 5000); } catch {}

  if (!(await isWarpDaemonRunning())) {
    // Fall back to UAC-elevated start
    try {
      await run(
        `powershell -NoProfile -Command "Start-Process powershell -Verb RunAs -ArgumentList '-NoProfile','-WindowStyle','Hidden','-Command','Start-Service CloudflareWARP' -Wait"`,
        30000
      );
    } catch (e) {
      sendLog(`Failed to start WARP service: ${e.message}`, 'error');
      return false;
    }
  }

  // Wait up to 10s for the daemon to become ready
  for (let i = 0; i < 10; i++) {
    if (await isWarpDaemonRunning()) {
      // Daemon process is up, but the named pipe may take a moment
      await delay(800);
      sendLog('WARP service is running', 'success');
      return true;
    }
    await delay(1000);
  }
  sendLog('WARP service did not start in time', 'error');
  return false;
}

async function suppressWarpNotifications() {
  try { await run(`"${WARP_CLI}" registration notifications disable`, 3000); } catch {}
  try {
    await run(
      `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Notifications\\Settings\\Cloudflare.WARP" /v Enabled /t REG_DWORD /d 0 /f`,
      3000
    );
  } catch {}
}

ipcMain.handle('suppress-notifications', async () => {
  suppressWarpNotifications(); // fire-and-forget
  return { success: true };
});

// ==========================================
// UPDATE CHECK (lightweight, no auto-install)
// ==========================================
// Polls GitHub Releases API; if a newer tag exists, returns it.
// UI shows a non-blocking banner; user clicks to open the release page.

function cmpSemver(a, b) {
  const pa = a.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

ipcMain.handle('open-external', async (_, url) => {
  // Only open https GitHub URLs to prevent abuse
  if (typeof url === 'string' && /^https:\/\/github\.com\/XXxilusha\/phantom-vpn(\/|$)/i.test(url)) {
    shell.openExternal(url);
    return { success: true };
  }
  return { success: false, error: 'blocked url' };
});

ipcMain.handle('check-update', async () => {
  try {
    const raw = await fetchText('https://api.github.com/repos/XXxilusha/phantom-vpn/releases/latest');
    const data = JSON.parse(raw);
    const latest = data.tag_name || '';
    const current = app.getVersion();
    if (!latest) return { available: false, current };
    const newer = cmpSemver(latest, current) > 0;
    return {
      available: newer,
      current,
      latest,
      url: data.html_url || `https://github.com/XXxilusha/phantom-vpn/releases/tag/${latest}`,
      name: data.name || latest,
      notes: data.body || '',
    };
  } catch (err) {
    return { available: false, error: err.message };
  }
});

// ==========================================
// WARP CHECK / INSTALL
// ==========================================

ipcMain.handle('check-warp', async () => {
  const installed = fs.existsSync(WARP_CLI);
  let connected = false, registered = false;

  if (installed) {
    await ensureWarpDaemon();
    try {
      const st = await run(`"${WARP_CLI}" status`, 5000);
      connected   = st.toLowerCase().includes('connected') && !st.toLowerCase().includes('disconnected');
      registered  = !st.toLowerCase().includes('registration missing');
    } catch {}
  }

  return {
    installed,
    connected,
    registered,
    staticIp: loadStaticIp(),
    settings: loadSettings(),
  };
});

ipcMain.handle('install-warp', async () => {
  if (fs.existsSync(WARP_CLI)) {
    sendLog('WARP already installed', 'success');
    return { success: true, alreadyInstalled: true };
  }
  try {
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
    sendLog('Downloading Cloudflare WARP (~110MB)...');
    await downloadFile(WARP_MSI_URL, MSI_PATH);
    sendLog('Download complete', 'success');
    sendLog('Installing... (accept the admin prompt)');
    await run(`powershell -Command "Start-Process msiexec -ArgumentList '/i','${MSI_PATH}','/quiet','/norestart' -Verb RunAs -Wait"`, 120000);
    sendLog('Waiting for WARP service...');
    let attempts = 0;
    while (!fs.existsSync(WARP_CLI) && attempts < 30) { await delay(1000); attempts++; }
    if (!fs.existsSync(WARP_CLI)) throw new Error('Installation timed out');
    await delay(3000);
    sendLog('WARP installed!', 'success');
    try { fs.unlinkSync(MSI_PATH); } catch {}
    return { success: true };
  } catch (err) {
    sendLog(`Install failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
});

// ==========================================
// CONNECT / DISCONNECT
// ==========================================

ipcMain.handle('warp-connect', async () => {
  try {
    sendLog('Connecting...');

    // Make sure the WARP service is running, otherwise every warp-cli call below
    // fails with "Unable to connect to the CloudflareWARP daemon (os error 2)".
    if (!(await ensureWarpDaemon())) {
      return { success: false, error: 'WARP service not running' };
    }

    // Check registration
    try {
      const st = await run(`"${WARP_CLI}" status`, 5000);
      if (st.toLowerCase().includes('registration missing')) {
        sendLog('Registering device...');
        try { await run(`"${WARP_CLI}" registration new`, 25000); } catch {}
        await delay(2000);
      }
    } catch {}

    // Apply static endpoint if set, else auto
    const staticData = loadStaticIp();
    if (staticData?.enabled && staticData?.endpoint) {
      try { await run(`"${WARP_CLI}" tunnel endpoint set ${staticData.endpoint}`, 5000); } catch {}
    } else {
      try { await run(`"${WARP_CLI}" tunnel endpoint reset`, 3000); } catch {}
    }

    // WARP+DoH for best performance
    try { await run(`"${WARP_CLI}" mode warp+doh`, 5000); } catch {}

    // Re-apply DNS Families mode (survives WARP restarts)
    const familiesMode = loadSettings().familiesMode;
    if (familiesMode && VALID_FAMILIES.has(familiesMode) && familiesMode !== 'off') {
      try { await run(`"${WARP_CLI}" dns families ${familiesMode}`, 4000); }
      catch { try { await run(`"${WARP_CLI}" set-families-mode ${familiesMode}`, 4000); } catch {} }
    }

    // Connect
    try { await run(`"${WARP_CLI}" connect`, 20000); } catch {}
    await delay(1500);

    const statusRaw = await run(`"${WARP_CLI}" status`, 5000);
    const isConnected = statusRaw.toLowerCase().includes('connected') && !statusRaw.toLowerCase().includes('disconnected');

    if (isConnected) {
      sendLog('Connected', 'success');
      startStatusPolling();
      prevBytes = null;
      prevBytesTime = null;
    } else {
      sendLog('Connecting...', 'warn');
      startStatusPolling();
    }

    return { success: true };
  } catch (err) {
    sendLog(`Connect failed: ${err.message}`, 'error');
    return { success: false, error: err.message };
  }
});

ipcMain.handle('warp-disconnect', async () => {
  try {
    stopStatusPolling();
    try { await run(`"${WARP_CLI}" disconnect`, 10000); } catch {}
    prevBytes = null;
    prevBytesTime = null;
    sendLog('Disconnected', 'info');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==========================================
// STATUS / IP
// ==========================================

ipcMain.handle('warp-status', async () => {
  try {
    const raw = await run(`"${WARP_CLI}" status`, 5000);
    return parseWarpStatus(raw);
  } catch { return { connected: false }; }
});

ipcMain.handle('get-public-ip', async () => getPublicIp());

// ==========================================
// REAL TUNNEL STATS — async, non-blocking
// ==========================================

function parseTunnelStats(raw) {
  function toMB(val, unit) {
    const n = parseFloat(val);
    const u = (unit || '').toUpperCase();
    if (u === 'TB') return n * 1024 * 1024;
    if (u === 'GB') return n * 1024;
    if (u === 'MB') return n;
    if (u === 'KB') return n / 1024;
    return n / (1024 * 1024);
  }
  const sentM  = raw.match(/Sent:\s*([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  const recvM  = raw.match(/Received:\s*([\d.]+)\s*(B|KB|MB|GB|TB)/i);
  const latM   = raw.match(/Estimated latency:\s*(\d+)\s*ms/i);
  const lossM  = raw.match(/Estimated loss:\s*([\d.]+)\s*%/i);
  const coloM  = raw.match(/Colo:\s*([A-Z]{2,4})/);
  const protoM = raw.match(/Tunnel Protocol:\s*(.+)/);
  const pqM    = raw.match(/Post-Quantum enabled:\s*(true|false)/i);
  return {
    rxMB:        recvM  ? toMB(recvM[1], recvM[2])               : 0,
    txMB:        sentM  ? toMB(sentM[1], sentM[2])               : 0,
    ping:        latM   ? parseInt(latM[1])                       : 0,
    loss:        lossM  ? parseFloat(lossM[1])                    : 0,
    colo:        coloM  ? coloM[1]                                : '',
    protocol:    protoM ? protoM[1].trim().split(' ')[0]          : 'WARP',
    postQuantum: pqM    ? pqM[1].toLowerCase() === 'true'         : false,
  };
}

ipcMain.handle('warp-real-stats', async () => {
  try {
    const raw = await run(`"${WARP_CLI}" tunnel stats`, 4000);
    const p = parseTunnelStats(raw);

    const isFirst = (prevBytes === null);
    const now = Date.now();
    let downloadSpeed = -1, uploadSpeed = -1;

    if (!isFirst && prevBytesTime) {
      const dt = (now - prevBytesTime) / 1000;
      if (dt > 0.5 && dt < 20) {
        const dRx = (p.rxMB - prevBytes.rx) * 1024 * 1024;
        const dTx = (p.txMB - prevBytes.tx) * 1024 * 1024;
        downloadSpeed = Math.min(1000, Math.max(0, dRx / dt / 1024 / 1024));
        uploadSpeed   = Math.min(1000, Math.max(0, dTx / dt / 1024 / 1024));
        downloadSpeed = Math.round(downloadSpeed * 100) / 100;
        uploadSpeed   = Math.round(uploadSpeed   * 100) / 100;
      }
    }

    prevBytes     = { rx: p.rxMB, tx: p.txMB };
    prevBytesTime = now;

    return {
      downloadSpeed, uploadSpeed,
      totalDownload: Math.round(p.rxMB * 100) / 100,
      totalUpload:   Math.round(p.txMB * 100) / 100,
      ping:          p.ping,
      loss:          p.loss,
      colo:          p.colo,
      protocol:      p.protocol,
      postQuantum:   p.postQuantum,
    };
  } catch { return null; }
});

// ==========================================
// IP INFO
// ==========================================

ipcMain.handle('get-ip-info', async () => {
  try {
    const raw = await fetchText('http://ip-api.com/json/?fields=query,country,countryCode,city');
    return JSON.parse(raw);
  } catch {
    const ip = await getPublicIp();
    return { query: ip, country: '', countryCode: '', city: '' };
  }
});

// ==========================================
// STATIC IP (lock endpoint)
// ==========================================

ipcMain.handle('static-ip-enable', async () => {
  try {
    sendLog('Locking endpoint...');
    let endpoint = '';
    try {
      const s = await run(`"${WARP_CLI}" tunnel endpoint`, 5000);
      const m = s.match(/(\d+\.\d+\.\d+\.\d+:\d+)/);
      if (m) endpoint = m[1];
    } catch {}
    if (!endpoint) {
      try {
        const s = await run(`"${WARP_CLI}" settings list`, 5000);
        const m = s.match(/Endpoint[:\s]+(\d+\.\d+\.\d+\.\d+:\d+)/i);
        if (m) endpoint = m[1];
      } catch {}
    }

    const currentIp = await getPublicIp();
    if (endpoint) {
      try { await run(`"${WARP_CLI}" tunnel endpoint set ${endpoint}`, 5000); } catch {}
      sendLog(`Endpoint locked: ${endpoint}`, 'success');
    }

    const data = { enabled: true, ip: currentIp, endpoint: endpoint || null };
    saveStaticIp(data);
    return { success: true, ip: currentIp, endpoint };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('static-ip-disable', async () => {
  try {
    try { await run(`"${WARP_CLI}" tunnel endpoint reset`, 5000); } catch {}
    saveStaticIp({ enabled: false });
    sendLog('Endpoint unlocked', 'info');
    return { success: true };
  } catch (err) { return { success: false, error: err.message }; }
});

ipcMain.handle('static-ip-status', async () => loadStaticIp());

// ==========================================
// HELPERS
// ==========================================

function parseWarpStatus(raw) {
  const s = raw.toLowerCase();
  return {
    connected: s.includes('connected') && !s.includes('disconnected'),
    mode: s.includes('warp+doh') ? 'WARP+DoH' : s.includes('warp') ? 'WARP' : 'DoH',
  };
}

function loadStaticIp() {
  try { if (fs.existsSync(STATIC_IP_FILE)) return JSON.parse(fs.readFileSync(STATIC_IP_FILE, 'utf8')); } catch {}
  return { enabled: false };
}
function saveStaticIp(data) {
  try { fs.writeFileSync(STATIC_IP_FILE, JSON.stringify(data, null, 2)); } catch {}
}

async function getPublicIp() {
  for (const url of ['https://ifconfig.me/ip', 'https://api.ipify.org', 'https://icanhazip.com']) {
    try { const r = (await fetchText(url)).trim(); if (r && r.length < 50) return r; } catch {}
  }
  return 'Unknown';
}

function startStatusPolling() {
  stopStatusPolling();
  statusInterval = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      const raw = await run(`"${WARP_CLI}" status`, 5000);
      mainWindow.webContents.send('warp-status-update', parseWarpStatus(raw));
    } catch {}
  }, 10000);
}
function stopStatusPolling() {
  if (statusInterval) { clearInterval(statusInterval); statusInterval = null; }
}

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    const req = mod.get(url, { timeout: 6000, headers: { 'User-Agent': 'curl/7.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location)
        return fetchText(res.headers.location).then(resolve, reject);
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let totalBytes = 0, downloaded = 0, lastReport = 0;
    const doRequest = (reqUrl) => {
      const mod = reqUrl.startsWith('https') ? https : http;
      mod.get(reqUrl, { headers: { 'User-Agent': 'PhantomVPN/2.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return doRequest(res.headers.location);
        if (res.statusCode !== 200) { file.close(); fs.unlinkSync(dest); return reject(new Error(`HTTP ${res.statusCode}`)); }
        totalBytes = parseInt(res.headers['content-length'] || '0', 10);
        res.on('data', (chunk) => {
          downloaded += chunk.length; file.write(chunk);
          const pct = totalBytes ? Math.round((downloaded / totalBytes) * 100) : 0;
          if (pct - lastReport >= 10) { lastReport = pct; sendLog(`Downloading... ${pct}%`); }
        });
        res.on('end', () => { file.end(); resolve(); });
        res.on('error', reject);
      }).on('error', reject);
    };
    doRequest(url);
  });
}

// ==========================================
// PRO MODE (sing-box / VLESS)
// ==========================================

proManager.setLogger((msg, type) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pro-log', { msg, type });
  }
});
proManager.setStatusListener((s) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pro-status-update', s);
  }
});

ipcMain.handle('pro-status',             async () => proManager.status());
ipcMain.handle('pro-connect',            async (_, payload) => proManager.connect(payload));
ipcMain.handle('pro-disconnect',         async () => proManager.disconnect());
ipcMain.handle('pro-set-subscription',   async (_, url) => proManager.setSubscription(url));
ipcMain.handle('pro-get-subscription',   async () => proManager.getSubscription());
ipcMain.handle('pro-forget-subscription',async () => proManager.forgetSubscription());
ipcMain.handle('pro-download-binary',    async () => proManager.downloadSingBox());
ipcMain.handle('pro-detect-country',     async () => proManager.detectCountry());
ipcMain.handle('pro-ensure-free',        async () => {
  try { return await proManager.ensureFreeSubscription(); }
  catch (e) { return { error: e.message }; }
});

app.on('before-quit', async () => {
  try { await proManager.disconnect(); } catch {}
});
