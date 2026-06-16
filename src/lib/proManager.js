// Phantom VPN — VLESS engine frontend manager (Free + Pro через один движок sing-box).

class ProManager {
  constructor() {
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'no-binary'
    this.tier = null;             // 'free' | 'pro' | null
    this.subscription = null;
    this.hasFree = false;
    this.freeExpiresAt = null;
    this.hasBinary = false;
    this.connectedSince = null;
    this.publicIp = '';
    this.country = null;
    this.error = null;
    this.listeners = new Set();
    this._e = typeof window !== 'undefined' && !!window.pro;
    this._busy = false;
    this._downloading = false;

    if (this._e) {
      window.pro.onLog(() => {});
      window.pro.onStatusUpdate(({ connected, tier }) => {
        if (connected) {
          this.status = 'connected';
          this.tier = tier ?? this.tier;
          if (!this.connectedSince) this.connectedSince = Date.now();
          this._refreshIp();
        } else {
          this.status = 'disconnected';
          this.tier = null;
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
      proTier: this.tier,
      proSubscription: this.subscription,
      proHasFree: this.hasFree,
      proFreeExpiresAt: this.freeExpiresAt,
      proHasBinary: this.hasBinary,
      proConnectedSince: this.connectedSince,
      proPublicIp: this.publicIp,
      proCountry: this.country,
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
    this.hasFree = !!s.hasFreeSubscription;
    this.freeExpiresAt = s.freeExpiresAt;
    this.subscription = await window.pro.getSubscription();
    this.status = s.connected ? 'connected' : (s.binaryAvailable ? 'disconnected' : 'no-binary');
    this.tier = s.tier || null;
    if (s.connected) {
      this.connectedSince = Date.now();
      this._refreshIp();
    }
    // фоном — детектим страну (для решения Free WARP vs Free VLESS)
    window.pro.detectCountry().then((c) => { this.country = c; this._n(); }).catch(() => {});
    this._n();
  }

  async ensureFree() {
    if (!this._e) return null;
    const r = await window.pro.ensureFree();
    if (r && !r.error) {
      this.hasFree = true;
      this.freeExpiresAt = r.expires_at;
      this._n();
    }
    return r;
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

  async connect(arg) {
    if (!this._e || this._busy) return { success: false };
    // arg может быть string (legacy: явный URL) или { tier, url }
    const payload = typeof arg === 'string' ? { url: arg, tier: 'pro' } : (arg || { tier: 'pro' });

    this._busy = true;
    this.status = 'connecting';
    this.error = null;
    this._n();
    try {
      const r = await window.pro.connect(payload);
      if (r.success) {
        if (payload.url && payload.tier === 'pro') this.subscription = payload.url;
        this.status = 'connected';
        this.tier = r.tier || payload.tier;
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
