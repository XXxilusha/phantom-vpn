// Phantom VPN — PRO mode frontend manager.
// Зеркалит API warpManager, но дергает window.pro вместо window.vpn.

class ProManager {
  constructor() {
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'no-binary'
    this.subscription = null;
    this.hasBinary = false;
    this.connectedSince = null;
    this.publicIp = '';
    this.error = null;
    this.listeners = new Set();
    this._e = typeof window !== 'undefined' && !!window.pro;
    this._busy = false;
    this._downloading = false;

    if (this._e) {
      window.pro.onLog(() => {}); // подписка чтоб не терять события
      window.pro.onStatusUpdate(({ connected }) => {
        if (connected) {
          this.status = 'connected';
          if (!this.connectedSince) this.connectedSince = Date.now();
          this._refreshIp();
        } else {
          this.status = 'disconnected';
          this.connectedSince = null;
          this.publicIp = '';
        }
        this._n();
      });
    }
  }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }

  _n() {
    const snapshot = {
      proStatus: this.status,
      proSubscription: this.subscription,
      proHasBinary: this.hasBinary,
      proConnectedSince: this.connectedSince,
      proPublicIp: this.publicIp,
      proError: this.error,
      proBusy: this._busy,
      proDownloading: this._downloading,
    };
    this.listeners.forEach((fn) => fn(snapshot));
  }

  async init() {
    if (!this._e) return;
    const s = await window.pro.status();
    this.hasBinary = !!s.binaryAvailable;
    this.subscription = await window.pro.getSubscription();
    this.status = s.connected ? 'connected' : (s.binaryAvailable ? 'disconnected' : 'no-binary');
    if (s.connected) {
      this.connectedSince = Date.now();
      this._refreshIp();
    }
    this._n();
  }

  async setSubscription(url) {
    if (!this._e) return { success: false };
    const r = await window.pro.setSubscription(url);
    if (r.success) {
      this.subscription = url;
      this.error = null;
    } else {
      this.error = r.error || 'invalid';
    }
    this._n();
    return r;
  }

  async forgetSubscription() {
    if (!this._e) return;
    await window.pro.forgetSubscription();
    this.subscription = null;
    this._n();
  }

  async connect(vlessUrlOptional) {
    if (!this._e || this._busy) return { success: false };
    this._busy = true;
    this.status = 'connecting';
    this.error = null;
    this._n();
    try {
      const r = await window.pro.connect(vlessUrlOptional);
      if (r.success) {
        if (vlessUrlOptional) this.subscription = vlessUrlOptional;
        this.status = 'connected';
        this.connectedSince = Date.now();
        this._refreshIp();
      } else {
        this.status = r.needsBinary ? 'no-binary' : 'disconnected';
        this.error = r.error || 'connect_failed';
        this.hasBinary = !r.needsBinary;
      }
      return r;
    } catch (e) {
      this.status = 'disconnected';
      this.error = e?.message || String(e);
      return { success: false, error: this.error };
    } finally {
      this._busy = false;
      this._n();
    }
  }

  async disconnect() {
    if (!this._e || this._busy) return;
    this._busy = true;
    this.status = 'disconnecting';
    this._n();
    try {
      await window.pro.disconnect();
      this.status = 'disconnected';
      this.connectedSince = null;
      this.publicIp = '';
    } finally {
      this._busy = false;
      this._n();
    }
  }

  async downloadBinary() {
    if (!this._e || this._downloading) return;
    this._downloading = true;
    this.error = null;
    this._n();
    try {
      const r = await window.pro.downloadBinary();
      if (r.success) {
        this.hasBinary = true;
        if (this.status === 'no-binary') this.status = 'disconnected';
      } else {
        this.error = r.error || 'download_failed';
      }
      return r;
    } finally {
      this._downloading = false;
      this._n();
    }
  }

  async _refreshIp() {
    try {
      if (window.vpn) this.publicIp = await window.vpn.getPublicIp();
    } catch {}
  }
}

export const proManager = new ProManager();
