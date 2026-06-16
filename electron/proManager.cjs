/**
 * Phantom VPN — PRO mode manager.
 *
 * Запускает sing-box.exe как локальный SOCKS5/HTTP-прокси, конфигурирует Windows
 * системный прокси на этот endpoint. Когда юзер отключается — восстанавливает прокси.
 *
 * Почему НЕ TUN: TUN требует admin-прав + установки Wintun driver. Для MVP идём через
 * системный прокси (без admin, работает в браузерах и большинстве приложений).
 * Когда наберём аудиторию — добавим опциональный TUN-режим с UAC.
 *
 * Бинарь sing-box.exe ожидается в:
 *   • dev:        <projectRoot>/electron/bin/sing-box.exe
 *   • production: process.resourcesPath/bin/sing-box.exe
 *
 * Если бинаря нет — connect() вернёт { success: false, needsBinary: true } и фронт
 * покажет пользователю кнопку «Загрузить sing-box».
 */

const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const https = require('https');
const { app } = require('electron');

// ── пути ────────────────────────────────────────────────────────────────────────

function binDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'bin')
    : path.join(__dirname, 'bin');
}
function singBoxPath() {
  return path.join(binDir(), 'sing-box.exe');
}
function configPath() {
  const dir = path.join(app.getPath('userData'), 'phantom-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'sing-box-config.json');
}
function subscriptionStorePath() {
  const dir = path.join(app.getPath('userData'), 'phantom-data');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, 'pro-subscription.json');
}

// ── состояние ────────────────────────────────────────────────────────────────────

const SOCKS_HOST = '127.0.0.1';
const SOCKS_PORT = 17710;
const HTTP_PORT = 17711;

let proc = null;
let connected = false;
let onLog = () => {};
let onStatusChange = () => {};

// ── VLESS парсинг ────────────────────────────────────────────────────────────────

/**
 * Парсит vless://UUID@HOST:PORT?params#tag
 * Возвращает объект конфига или null если URL невалиден.
 */
function parseVlessUrl(url) {
  if (typeof url !== 'string' || !url.startsWith('vless://')) return null;
  try {
    const u = new URL(url);
    const uuid = decodeURIComponent(u.username);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid)) return null;

    const host = u.hostname;
    const port = parseInt(u.port || '443', 10);
    const q = u.searchParams;

    return {
      uuid,
      host,
      port,
      tag: decodeURIComponent((u.hash || '').replace(/^#/, '')) || 'Phantom VPN',
      encryption: q.get('encryption') || 'none',
      security: q.get('security') || 'tls',
      sni: q.get('sni') || host,
      type: q.get('type') || 'tcp',
      path: q.get('path') || '/',
      wsHost: q.get('host') || host,
      fingerprint: q.get('fp') || 'chrome',
      flow: q.get('flow') || '',
    };
  } catch {
    return null;
  }
}

/**
 * Генерит sing-box конфиг (JSON) из VLESS-параметров.
 * Inbound: SOCKS5 + HTTP на 127.0.0.1, чтобы поставить Windows-прокси.
 * Outbound: VLESS-over-WebSocket-over-TLS.
 */
function buildSingBoxConfig(vless) {
  return {
    log: { level: 'warn' },
    dns: {
      servers: [
        { tag: 'cf-doh', address: 'https://1.1.1.1/dns-query', detour: 'phantom' },
        { tag: 'system', address: 'local' },
      ],
      rules: [
        { domain: [vless.host], server: 'system' },
      ],
      strategy: 'prefer_ipv4',
    },
    inbounds: [
      {
        type: 'mixed',
        tag: 'mixed-in',
        listen: SOCKS_HOST,
        listen_port: SOCKS_PORT,
        sniff: true,
        sniff_override_destination: true,
      },
      {
        type: 'http',
        tag: 'http-in',
        listen: SOCKS_HOST,
        listen_port: HTTP_PORT,
        sniff: true,
      },
    ],
    outbounds: [
      {
        type: 'vless',
        tag: 'phantom',
        server: vless.host,
        server_port: vless.port,
        uuid: vless.uuid,
        flow: vless.flow || undefined,
        tls: vless.security === 'tls' ? {
          enabled: true,
          server_name: vless.sni,
          insecure: false,
          utls: { enabled: true, fingerprint: vless.fingerprint || 'chrome' },
        } : undefined,
        transport: vless.type === 'ws' ? {
          type: 'ws',
          path: vless.path,
          headers: { Host: vless.wsHost },
        } : undefined,
      },
      { type: 'direct', tag: 'direct' },
      { type: 'block', tag: 'block' },
    ],
    route: {
      rules: [
        { protocol: 'dns', outbound: 'dns-out' },
      ],
      final: 'phantom',
      auto_detect_interface: true,
    },
  };
}

// ── управление подпиской ────────────────────────────────────────────────────────

function saveSubscription(url) {
  try {
    fs.writeFileSync(subscriptionStorePath(), JSON.stringify({ url, savedAt: Date.now() }, null, 2));
  } catch (e) {
    onLog(`Failed to save subscription: ${e.message}`, 'error');
  }
}
function loadSubscription() {
  try {
    if (!fs.existsSync(subscriptionStorePath())) return null;
    const j = JSON.parse(fs.readFileSync(subscriptionStorePath(), 'utf8'));
    return j.url || null;
  } catch { return null; }
}
function clearSubscription() {
  try { fs.unlinkSync(subscriptionStorePath()); } catch {}
}

// ── Windows-прокси ──────────────────────────────────────────────────────────────

function setSystemProxy(enabled) {
  return new Promise((resolve) => {
    const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
    if (enabled) {
      const proxy = `${SOCKS_HOST}:${HTTP_PORT}`;
      const cmd = [
        `reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d 1 /f`,
        `reg add "${REG_KEY}" /v ProxyServer /t REG_SZ /d "${proxy}" /f`,
        `reg add "${REG_KEY}" /v ProxyOverride /t REG_SZ /d "<local>" /f`,
      ].join(' && ');
      exec(cmd, { windowsHide: true }, (err) => resolve(!err));
    } else {
      const cmd = `reg add "${REG_KEY}" /v ProxyEnable /t REG_DWORD /d 0 /f`;
      exec(cmd, { windowsHide: true }, (err) => resolve(!err));
    }
  });
}

// ── sing-box процесс ────────────────────────────────────────────────────────────

function singBoxAvailable() {
  return fs.existsSync(singBoxPath());
}

async function startSingBox(vlessUrl) {
  if (!singBoxAvailable()) {
    return { success: false, needsBinary: true, error: 'sing-box.exe не найден' };
  }
  const vless = parseVlessUrl(vlessUrl);
  if (!vless) {
    return { success: false, error: 'Невалидная VLESS-ссылка' };
  }

  const config = buildSingBoxConfig(vless);
  try {
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
  } catch (e) {
    return { success: false, error: `Не удалось сохранить конфиг: ${e.message}` };
  }

  await stopSingBox();

  return new Promise((resolve) => {
    proc = spawn(singBoxPath(), ['run', '-c', configPath()], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;
    const finish = (result) => { if (!resolved) { resolved = true; resolve(result); } };

    proc.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) onLog(`[sb] ${msg}`, 'info');
      if (!resolved && /inbound.*started|server started|started/i.test(msg)) {
        finish({ success: true });
      }
    });
    proc.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) onLog(`[sb] ${msg}`, 'warn');
    });
    proc.on('error', (err) => {
      onLog(`sing-box error: ${err.message}`, 'error');
      finish({ success: false, error: err.message });
    });
    proc.on('exit', (code) => {
      onLog(`sing-box exited (${code})`, code === 0 ? 'info' : 'error');
      if (connected) {
        connected = false;
        onStatusChange({ connected: false });
        setSystemProxy(false);
      }
      proc = null;
    });

    // безопасный таймаут — sing-box стартует за ~500мс, даём 5 сек
    setTimeout(() => finish({ success: true }), 3000);
  });
}

async function stopSingBox() {
  return new Promise((resolve) => {
    if (!proc) return resolve();
    const p = proc;
    proc = null;
    try { p.kill('SIGTERM'); } catch {}
    setTimeout(() => {
      try { p.kill('SIGKILL'); } catch {}
      resolve();
    }, 1500);
  });
}

// ── публичный API ───────────────────────────────────────────────────────────────

async function connect(vlessUrlOptional) {
  const url = vlessUrlOptional || loadSubscription();
  if (!url) return { success: false, error: 'Нет VLESS-ссылки. Вставь её из бота.' };

  if (vlessUrlOptional) saveSubscription(vlessUrlOptional);

  const r = await startSingBox(url);
  if (!r.success) return r;

  const proxyOk = await setSystemProxy(true);
  if (!proxyOk) {
    await stopSingBox();
    return { success: false, error: 'Не удалось включить системный прокси Windows' };
  }

  connected = true;
  onStatusChange({ connected: true });
  onLog('PRO connected', 'success');
  return { success: true };
}

async function disconnect() {
  await setSystemProxy(false);
  await stopSingBox();
  connected = false;
  onStatusChange({ connected: false });
  onLog('PRO disconnected', 'info');
  return { success: true };
}

function status() {
  return {
    connected,
    hasSubscription: !!loadSubscription(),
    binaryAvailable: singBoxAvailable(),
    socks: { host: SOCKS_HOST, port: SOCKS_PORT },
    http: { host: SOCKS_HOST, port: HTTP_PORT },
  };
}

function setSubscription(url) {
  const v = parseVlessUrl(url);
  if (!v) return { success: false, error: 'Невалидная VLESS-ссылка' };
  saveSubscription(url);
  return { success: true, host: v.host };
}

function getSubscription() {
  return loadSubscription();
}

function forgetSubscription() {
  clearSubscription();
  return { success: true };
}

/**
 * Качает последний релиз sing-box для windows-amd64 в electron/bin/sing-box.exe.
 * Используется кнопкой «Загрузить sing-box» в UI.
 */
async function downloadSingBox() {
  return new Promise((resolve) => {
    const apiUrl = 'https://api.github.com/repos/SagerNet/sing-box/releases/latest';

    const fetchJson = (url, cb) => {
      https.get(url, { headers: { 'User-Agent': 'phantom-vpn' } }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => { try { cb(null, JSON.parse(body)); } catch (e) { cb(e); } });
      }).on('error', cb);
    };

    const downloadBinary = (assetUrl, cb) => {
      const target = singBoxPath();
      if (!fs.existsSync(binDir())) fs.mkdirSync(binDir(), { recursive: true });
      const tempZip = path.join(binDir(), 'sing-box-download.zip');
      const f = fs.createWriteStream(tempZip);

      const follow = (url) => {
        https.get(url, { headers: { 'User-Agent': 'phantom-vpn' } }, (res) => {
          if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            return follow(res.headers.location);
          }
          if (res.statusCode !== 200) return cb(new Error(`HTTP ${res.statusCode}`));
          res.pipe(f);
          f.on('finish', () => f.close(() => {
            // распаковываем zip: используем powershell Expand-Archive
            const ext = path.join(binDir(), 'extract');
            if (fs.existsSync(ext)) fs.rmSync(ext, { recursive: true, force: true });
            exec(`powershell -NoProfile -Command "Expand-Archive -LiteralPath '${tempZip}' -DestinationPath '${ext}' -Force"`,
              { windowsHide: true },
              (err) => {
                if (err) return cb(err);
                // находим sing-box.exe в распакованной папке
                const found = findFile(ext, 'sing-box.exe');
                if (!found) return cb(new Error('sing-box.exe не найден в архиве'));
                fs.copyFileSync(found, target);
                try { fs.rmSync(ext, { recursive: true, force: true }); } catch {}
                try { fs.unlinkSync(tempZip); } catch {}
                cb(null);
              });
          }));
        }).on('error', cb);
      };
      follow(assetUrl);
    };

    fetchJson(apiUrl, (err, release) => {
      if (err) return resolve({ success: false, error: `GitHub API: ${err.message}` });
      const asset = (release.assets || []).find((a) =>
        /sing-box-.*-windows-amd64\.zip$/.test(a.name),
      );
      if (!asset) return resolve({ success: false, error: 'Релиз для windows-amd64 не найден' });

      onLog(`Качаем sing-box ${release.tag_name} (${(asset.size / 1024 / 1024).toFixed(1)} МБ)…`, 'info');
      downloadBinary(asset.browser_download_url, (e) => {
        if (e) return resolve({ success: false, error: e.message });
        onLog(`sing-box ${release.tag_name} установлен`, 'success');
        resolve({ success: true, version: release.tag_name });
      });
    });
  });
}

function findFile(dir, name) {
  if (!fs.existsSync(dir)) return null;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const r = findFile(full, name);
      if (r) return r;
    } else if (entry.name === name) {
      return full;
    }
  }
  return null;
}

// ── события ────────────────────────────────────────────────────────────────────

function setLogger(fn) { onLog = fn || (() => {}); }
function setStatusListener(fn) { onStatusChange = fn || (() => {}); }

module.exports = {
  connect,
  disconnect,
  status,
  setSubscription,
  getSubscription,
  forgetSubscription,
  downloadSingBox,
  parseVlessUrl,
  setLogger,
  setStatusListener,
};
