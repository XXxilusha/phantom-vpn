const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('vpn', {
  // Core
  checkWarp:       () => ipcRenderer.invoke('check-warp'),
  installWarp:     () => ipcRenderer.invoke('install-warp'),
  connect:         () => ipcRenderer.invoke('warp-connect'),
  disconnect:      () => ipcRenderer.invoke('warp-disconnect'),
  getStatus:       () => ipcRenderer.invoke('warp-status'),
  getPublicIp:     () => ipcRenderer.invoke('get-public-ip'),
  getIpInfo:       () => ipcRenderer.invoke('get-ip-info'),

  // Stats (now uses warp-cli tunnel stats)
  realStats:       () => ipcRenderer.invoke('warp-real-stats'),

  // Lock endpoint (formerly "static IP")
  staticIpEnable:  () => ipcRenderer.invoke('static-ip-enable'),
  staticIpDisable: () => ipcRenderer.invoke('static-ip-disable'),
  staticIpStatus:  () => ipcRenderer.invoke('static-ip-status'),

  // Settings (kill switch, auto-connect)
  settingsGet:     () => ipcRenderer.invoke('settings-get'),
  settingsSet:     (patch) => ipcRenderer.invoke('settings-set', patch),

  // Auto-start with Windows
  autostartEnable:  () => ipcRenderer.invoke('autostart-enable'),
  autostartDisable: () => ipcRenderer.invoke('autostart-disable'),
  autostartStatus:  () => ipcRenderer.invoke('autostart-status'),

  // Suppress WARP notifications
  suppressNotifs:  () => ipcRenderer.invoke('suppress-notifications'),

  // DNS Family Mode (block ads/malware/adult content at DNS level)
  dnsFamiliesGet:  () => ipcRenderer.invoke('dns-families-get'),
  dnsFamiliesSet:  (mode) => ipcRenderer.invoke('dns-families-set', mode),

  // Split Tunneling (per-host bypass list)
  splitList:       () => ipcRenderer.invoke('split-list'),
  splitAdd:        (host) => ipcRenderer.invoke('split-add', host),
  splitRemove:     (host) => ipcRenderer.invoke('split-remove', host),

  // Update checker
  checkUpdate:     () => ipcRenderer.invoke('check-update'),
  openExternal:    (url) => ipcRenderer.invoke('open-external', url),

  // Events
  onLog:           (cb) => ipcRenderer.on('warp-log', (_, d) => cb(d)),
  onStatusUpdate:  (cb) => ipcRenderer.on('warp-status-update', (_, d) => cb(d)),
});

// PRO mode (sing-box / VLESS канал)
contextBridge.exposeInMainWorld('pro', {
  status:            () => ipcRenderer.invoke('pro-status'),
  connect:           (vlessUrl) => ipcRenderer.invoke('pro-connect', vlessUrl),
  disconnect:        () => ipcRenderer.invoke('pro-disconnect'),
  setSubscription:   (url) => ipcRenderer.invoke('pro-set-subscription', url),
  getSubscription:   () => ipcRenderer.invoke('pro-get-subscription'),
  forgetSubscription:() => ipcRenderer.invoke('pro-forget-subscription'),
  downloadBinary:    () => ipcRenderer.invoke('pro-download-binary'),
  onLog:             (cb) => ipcRenderer.on('pro-log', (_, d) => cb(d)),
  onStatusUpdate:    (cb) => ipcRenderer.on('pro-status-update', (_, d) => cb(d)),
});
