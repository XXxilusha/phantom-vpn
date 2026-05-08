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

  // Events
  onLog:           (cb) => ipcRenderer.on('warp-log', (_, d) => cb(d)),
  onStatusUpdate:  (cb) => ipcRenderer.on('warp-status-update', (_, d) => cb(d)),
});
