class WarpManager {
  constructor() {
    this.status = 'initializing';
    this.warpInstalled = false;
    this.listeners = new Set();
    this.logs = [];
    this.staticIp = { enabled: false, ip: '' };
    this.ipInfo = {};
    this.killSwitch = false;
    this.autoConnect = false;
    this.autoStart = false;
    this.familiesMode = 'off'; // 'off' | 'malware' | 'full'
    this.splitHosts = [];
    this.update = null; // { available, latest, url } | null
    this.stats = {
      ping: 0, downloadSpeed: -1, uploadSpeed: -1,
      totalDownload: 0, totalUpload: 0,
      connectedSince: null, publicIp: '',
      loss: 0, colo: '', protocol: '', postQuantum: false,
    };
    this._si = null;
    this._ii = null;
    this._e = typeof window !== 'undefined' && !!window.vpn;
    this._busy = false;
    this._intentionalDisconnect = false;

    if (this._e) {
      window.vpn.onLog(({ msg, type }) => this._log(msg, type));
      window.vpn.onStatusUpdate((p) => {
        if (p.connected && this.status !== 'connected') {
          this.status = 'connected';
          this._n();
        } else if (!p.connected && this.status === 'connected') {
          // VPN dropped unexpectedly
          if (this.killSwitch && !this._intentionalDisconnect) {
            this._log('VPN dropped — Kill Switch: reconnecting...', 'warn');
            this.status = 'connecting';
            this._n();
            setTimeout(() => this._autoReconnect(), 1000);
          } else {
            this.status = 'disconnected';
            this._stopStats();
            this.stats = { ...this.stats, ping: 0, downloadSpeed: -1, uploadSpeed: -1, connectedSince: null, publicIp: '', loss: 0, colo: '', protocol: '', postQuantum: false };
            this._n();
          }
        }
      });
    }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _n() {
    const d = {
      status: this.status,
      stats: { ...this.stats },
      logs: [...this.logs],
      isElectron: this._e,
      warpInstalled: this.warpInstalled,
      staticIp: { ...this.staticIp },
      ipInfo: { ...this.ipInfo },
      killSwitch: this.killSwitch,
      autoConnect: this.autoConnect,
      autoStart: this.autoStart,
      familiesMode: this.familiesMode,
      splitHosts: [...this.splitHosts],
      update: this.update,
    };
    this.listeners.forEach(fn => fn(d));
  }

  _log(msg, type = 'info') {
    this.logs.unshift({ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString(), msg, type });
    if (this.logs.length > 100) this.logs.pop();
    this._n();
  }

  async init() {
    if (!this._e) { this.status = 'no-electron'; this._log('Desktop app required', 'warn'); this._n(); return; }

    // Если доступен VLESS-движок (window.pro) — Free и Pro работают через него.
    // WARP инициализировать НЕ надо: пользователь не получит ошибок про "WARP service did not start in time".
    // Settings page по-прежнему работает (state.killSwitch и т.д. инициализированы в конструкторе).
    if (typeof window !== 'undefined' && window.pro) {
      this.status = 'disconnected';
      try { const as = await window.vpn.autostartStatus(); this.autoStart = as.enabled || false; } catch {}
      this._n();
      return;
    }

    this._log('Checking WARP...');
    const r = await window.vpn.checkWarp();
    this.warpInstalled = r.installed;
    if (r.staticIp) this.staticIp = r.staticIp;
    if (r.settings) {
      this.killSwitch = r.settings.killSwitch || false;
      this.autoConnect = r.settings.autoConnect || false;
      this.familiesMode = r.settings.familiesMode || 'off';
    }

    // Load split-tunnel hosts (best-effort; empty when WARP not running)
    try { const s = await window.vpn.splitList(); if (s?.hosts) this.splitHosts = s.hosts; } catch {}

    // Check for updates in background — non-blocking
    setTimeout(() => this._checkUpdate(), 8000);

    // Load autostart status
    try { const as = await window.vpn.autostartStatus(); this.autoStart = as.enabled || false; } catch {}

    // Suppress WARP notifications
    try { await window.vpn.suppressNotifs(); } catch {}

    if (!r.installed) {
      this.status = 'not-installed';
      this._log('WARP not found', 'warn');
    } else if (r.connected) {
      this.status = 'connected';
      this.stats.connectedSince = Date.now();
      await this._ip();
      await this._ipInfo();
      this._startStats();
      this._log('Connected', 'success');
    } else if (this.autoConnect) {
      // Auto-connect on startup
      this._log('Auto-connecting...', 'info');
      this._n();
      await this.connect();
      return;
    } else {
      this.status = 'disconnected';
      this._log('Ready', 'success');
    }
    this._n();
  }

  async install() {
    if (!this._e) return;
    this.status = 'installing'; this._n();
    const r = await window.vpn.installWarp();
    this.warpInstalled = r.success;
    this.status = r.success ? 'disconnected' : 'not-installed';
    this._n();
  }

  async connect() {
    if (!this._e || this._busy) return;
    this._busy = true;
    this._intentionalDisconnect = false;
    try {
      this.status = 'connecting'; this._n();
      const r = await window.vpn.connect();
      if (r.success) {
        this.status = 'connected';
        this.stats.connectedSince = Date.now();
        this.stats.downloadSpeed = -1;
        this.stats.uploadSpeed = -1;
        await this._ip();
        await this._ipInfo();
        this._startStats();
      } else {
        this.status = 'disconnected';
      }
    } catch {
      this.status = 'disconnected';
    } finally {
      this._busy = false;
      this._n();
    }
  }

  async disconnect() {
    if (!this._e || this._busy) return;
    this._busy = true;
    this._intentionalDisconnect = true;
    try {
      this.status = 'disconnecting'; this._n();
      await window.vpn.disconnect();
      this._stopStats();
      this.status = 'disconnected';
      this.stats = { ping: 0, downloadSpeed: -1, uploadSpeed: -1, totalDownload: 0, totalUpload: 0, connectedSince: null, publicIp: '', loss: 0, colo: '', protocol: '', postQuantum: false };
      this.ipInfo = {};
    } catch {
      this.status = 'disconnected';
    } finally {
      this._busy = false;
      this._n();
    }
  }

  async _autoReconnect() {
    if (this._busy) return;
    this._busy = true;
    try {
      const r = await window.vpn.connect();
      if (r.success) {
        this.status = 'connected';
        this.stats.connectedSince = Date.now();
        this.stats.downloadSpeed = -1;
        this.stats.uploadSpeed = -1;
        await this._ip();
        await this._ipInfo();
        this._startStats();
        this._log('Reconnected', 'success');
      } else {
        this.status = 'disconnected';
        this._log('Reconnect failed', 'error');
      }
    } catch {
      this.status = 'disconnected';
    } finally {
      this._busy = false;
      this._n();
    }
  }

  async toggleStaticIp() {
    if (!this._e) return;
    if (this.staticIp.enabled) {
      const r = await window.vpn.staticIpDisable();
      if (r.success) this.staticIp = { enabled: false, ip: '' };
    } else {
      const r = await window.vpn.staticIpEnable();
      if (r.success) this.staticIp = { enabled: true, ip: r.ip, endpoint: r.endpoint };
    }
    this._n();
  }

  async setKillSwitch(enabled) {
    if (!this._e) return;
    this.killSwitch = enabled;
    await window.vpn.settingsSet({ killSwitch: enabled });
    this._log(enabled ? 'Kill Switch enabled' : 'Kill Switch disabled', enabled ? 'success' : 'info');
    this._n();
  }

  async setAutoConnect(enabled) {
    if (!this._e) return;
    this.autoConnect = enabled;
    await window.vpn.settingsSet({ autoConnect: enabled });
    this._n();
  }

  async setAutoStart(enabled) {
    if (!this._e) return;
    try {
      if (enabled) {
        const r = await window.vpn.autostartEnable();
        this.autoStart = r.success || r.devMode;
        if (r.devMode) this._log('Auto-start: not available in dev mode', 'warn');
        else if (r.success) this._log('Auto-start enabled', 'success');
      } else {
        await window.vpn.autostartDisable();
        this.autoStart = false;
        this._log('Auto-start disabled', 'info');
      }
    } catch { this.autoStart = false; }
    this._n();
  }

  async setFamiliesMode(mode) {
    if (!this._e) return;
    const prev = this.familiesMode;
    this.familiesMode = mode;
    this._n();
    try {
      const r = await window.vpn.dnsFamiliesSet(mode);
      if (!r?.success) {
        this.familiesMode = prev;
        this._log(`DNS filter failed: ${r?.error || 'unknown'}`, 'error');
        this._n();
      }
    } catch (e) {
      this.familiesMode = prev;
      this._n();
    }
  }

  async addSplitHost(host) {
    if (!this._e || !host) return { success: false };
    const r = await window.vpn.splitAdd(host);
    if (r?.success) {
      if (!this.splitHosts.includes(r.host)) this.splitHosts = [...this.splitHosts, r.host];
      this._n();
    } else {
      this._log(`Bypass failed: ${r?.error || 'invalid host'}`, 'error');
    }
    return r;
  }

  async removeSplitHost(host) {
    if (!this._e || !host) return;
    const r = await window.vpn.splitRemove(host);
    if (r?.success) {
      this.splitHosts = this.splitHosts.filter(h => h !== r.host);
      this._n();
    }
    return r;
  }

  async _checkUpdate() {
    if (!this._e) return;
    try {
      const r = await window.vpn.checkUpdate();
      if (r?.available) {
        this.update = { latest: r.latest, current: r.current, url: r.url };
        this._log(`Update available: ${r.latest}`, 'success');
        this._n();
      }
    } catch {}
  }

  openUpdate() {
    if (this.update?.url && this._e) {
      window.vpn.openExternal(this.update.url);
    }
  }

  dismissUpdate() {
    this.update = null;
    this._n();
  }

  async _ip() { if (!this._e) return; try { this.stats.publicIp = await window.vpn.getPublicIp(); } catch {} }

  async _ipInfo() {
    if (!this._e) return;
    try { const info = await window.vpn.getIpInfo(); if (info) this.ipInfo = info; } catch {}
  }

  _startStats() {
    this._stopStats();
    this._si = setInterval(async () => {
      if (this.status !== 'connected') return;
      let changed = false;
      const set = (key, val) => { if (val !== undefined && this.stats[key] !== val) { this.stats[key] = val; changed = true; } };
      try {
        const real = await window.vpn.realStats();
        if (real) {
          set('downloadSpeed', real.downloadSpeed);
          set('uploadSpeed',   real.uploadSpeed);
          set('totalDownload', real.totalDownload);
          set('totalUpload',   real.totalUpload);
          if (real.ping > 0) set('ping', real.ping);
          set('loss', real.loss);
          if (real.colo)     set('colo', real.colo);
          if (real.protocol) set('protocol', real.protocol);
          set('postQuantum', real.postQuantum);
        }
      } catch {}
      if (changed) this._n();
    }, 5000);
    this._ii = setInterval(async () => {
      const prevIp = this.stats.publicIp;
      const prevCity = this.ipInfo.city;
      const prevCountry = this.ipInfo.country;
      await this._ip();
      await this._ipInfo();
      if (this.stats.publicIp !== prevIp || this.ipInfo.city !== prevCity || this.ipInfo.country !== prevCountry)
        this._n();
    }, 60000);
  }

  _stopStats() {
    if (this._si) { clearInterval(this._si); this._si = null; }
    if (this._ii) { clearInterval(this._ii); this._ii = null; }
  }
}

export const warpManager = new WarpManager();
