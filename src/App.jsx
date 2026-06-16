import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Power, ArrowDown, ArrowUp, Zap, Clock,
  Download, Upload, MapPin, Loader, Lock, Unlock,
  Globe, Settings, ArrowLeft, Atom, AlertTriangle,
  RefreshCw, Wifi, MonitorCheck, Filter, GitBranch, X, Plus,
} from 'lucide-react';
import { warpManager } from './lib/warpManager';
import ProMode from './components/ProMode';

/* ---- i18n ---- */
const i18n = {
  en: {
    title: 'Phantom', titleSuffix: 'VPN',
    subtitle: 'Through the mist, unseen',
    connect: 'Connect', disconnect: 'Disconnect', connecting: 'Connecting', stopping: 'Stopping',
    tapToEncrypt: 'Tap to encrypt all traffic',
    protected: 'Protected', disconnected: 'Disconnected', initializing: 'Initializing',
    notInstalled: 'Not Installed', installing: 'Installing', desktopRequired: 'Desktop Required',
    warpRequired: 'Cloudflare WARP required', install: 'Install', installingDots: 'Installing...',
    desktopApp: 'Desktop app required',
    ip: 'IP', latency: 'Latency', session: 'Session', location: 'Location',
    download: 'Download', upload: 'Upload', received: 'Received', sent: 'Sent', uptime: 'Uptime',
    loss: 'Packet Loss', datacenter: 'Datacenter', protocol: 'Protocol',
    lockEndpoint: 'Lock Endpoint', lockEndpointDesc: 'Pin to current server',
    quantumShield: 'Post-Quantum', quantumOn: 'Active', quantumOff: 'Off',
    settings: 'Settings', back: 'Back', language: 'Language',
    killSwitch: 'Kill Switch', killSwitchDesc: 'Reconnect instantly if VPN drops',
    autoConnect: 'Auto-Connect', autoConnectDesc: 'Connect on app start',
    autoStart: 'Start with Windows', autoStartDesc: 'Launch app at startup',
    log: 'Activity Log', noActivity: 'No activity',
    dnsFilter: 'DNS Filter', dnsFilterDesc: 'Block threats at DNS level',
    dnsOff: 'Off', dnsMalware: 'Malware', dnsFull: 'Malware + Adult',
    dnsOffDesc: 'No filtering', dnsMalwareDesc: 'Block malware & phishing', dnsFullDesc: 'Block malware, phishing & adult sites',
    splitTunnel: 'Split Tunneling', splitTunnelDesc: 'Domains that bypass the VPN',
    addDomain: 'Add domain (e.g. bank.com)', add: 'Add', emptyHosts: 'No bypass rules',
    updateAvail: 'Update available', updateDownload: 'Download',
  },
  ru: {
    title: 'Phantom', titleSuffix: 'VPN',
    subtitle: 'Сквозь туман, незримы',
    connect: 'Подключить', disconnect: 'Отключить', connecting: 'Подключение', stopping: 'Отключение',
    tapToEncrypt: 'Нажмите для шифрования трафика',
    protected: 'Защищено', disconnected: 'Отключено', initializing: 'Инициализация',
    notInstalled: 'Не установлено', installing: 'Установка', desktopRequired: 'Нужно приложение',
    warpRequired: 'Требуется Cloudflare WARP', install: 'Установить', installingDots: 'Установка...',
    desktopApp: 'Требуется настольное приложение',
    ip: 'IP', latency: 'Задержка', session: 'Сессия', location: 'Локация',
    download: 'Скачивание', upload: 'Загрузка', received: 'Получено', sent: 'Отправлено', uptime: 'Время',
    loss: 'Потери пакетов', datacenter: 'Датацентр', protocol: 'Протокол',
    lockEndpoint: 'Закрепить сервер', lockEndpointDesc: 'Привязать к текущему серверу',
    quantumShield: 'Постквантовый', quantumOn: 'Активен', quantumOff: 'Выкл',
    settings: 'Настройки', back: 'Назад', language: 'Язык',
    killSwitch: 'Kill Switch', killSwitchDesc: 'Переподключиться мгновенно при обрыве VPN',
    autoConnect: 'Авто-подключение', autoConnectDesc: 'Подключать при запуске приложения',
    autoStart: 'Автозапуск', autoStartDesc: 'Запускать приложение вместе с Windows',
    log: 'Журнал', noActivity: 'Нет активности',
    dnsFilter: 'DNS-фильтр', dnsFilterDesc: 'Блокировка угроз на уровне DNS',
    dnsOff: 'Выкл', dnsMalware: 'Угрозы', dnsFull: 'Угрозы + 18+',
    dnsOffDesc: 'Без фильтрации', dnsMalwareDesc: 'Блок малвари и фишинга', dnsFullDesc: 'Блок малвари, фишинга и 18+',
    splitTunnel: 'Split-туннелирование', splitTunnelDesc: 'Домены, идущие в обход VPN',
    addDomain: 'Добавить домен (напр. bank.by)', add: 'Добавить', emptyHosts: 'Нет исключений',
    updateAvail: 'Доступно обновление', updateDownload: 'Скачать',
  },
};

/* ---- Utils ---- */
function fmt(ms) {
  if (!ms) return '00:00:00';
  const s = Math.floor((Date.now() - ms) / 1000);
  return [s / 3600 | 0, (s % 3600) / 60 | 0, s % 60].map(v => String(v).padStart(2, '0')).join(':');
}
function fmtB(mb) {
  if (mb <= 0) return '—';
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}
function fmtSpeed(mbps) {
  if (mbps < 0) return null; // means "measuring"
  return mbps.toFixed(2);
}
const spring = { type: 'spring', stiffness: 300, damping: 24 };
const fade = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.4 } };
const slideIn = { initial: { opacity: 0, x: 60 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 60 }, transition: { duration: 0.35, ease: 'easeOut' } };
const slideOut = { initial: { opacity: 0, x: -60 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -60 }, transition: { duration: 0.35, ease: 'easeOut' } };

/* ==================== TOGGLE ROW ==================== */
const ToggleRow = memo(function ToggleRow({ icon: Icon, label, desc, enabled, onChange, disabled }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-3">
        <Icon size={15} strokeWidth={1.3} className="text-white/20 shrink-0" />
        <div>
          <p className="text-[12px] text-white/35">{label}</p>
          {desc && <p className="text-[9px] text-white/12 mt-0.5">{desc}</p>}
        </div>
      </div>
      <button onClick={() => onChange(!enabled)} disabled={disabled}
        className="relative w-11 h-[24px] rounded-full transition-all duration-500 shrink-0 disabled:opacity-30"
        style={{ background: enabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)' }}>
        <motion.div className="absolute top-[3px] w-[18px] h-[18px] rounded-full"
          animate={{ left: enabled ? '23px' : '3px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          style={{ background: enabled ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)' }} />
      </button>
    </div>
  );
});

/* ==================== POWER BUTTON ==================== */
const PowerBtn = memo(function PowerBtn({ status, onClick, t, disabled }) {
  const on = status === 'connected';
  const busy = status === 'connecting' || status === 'disconnecting';
  const color = on ? 'rgba(255,255,255,0.6)' : busy ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';

  return (
    <div className="relative flex items-center justify-center my-10">
      <AnimatePresence>
        {on && [0, 0.8, 1.6].map((d, i) => (
          <motion.div key={i} className="absolute w-48 h-48 rounded-full border border-white/[0.04]"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: [0.85, 1.8], opacity: [0.3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeOut', delay: d }} />
        ))}
        {on && (
          <motion.div key="gl" className="absolute w-44 h-44 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)' }}
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.7, 0.4] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }} />
        )}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        disabled={busy || disabled}
        whileHover={!busy && !disabled ? { scale: 1.07 } : {}}
        whileTap={!busy && !disabled ? { scale: 0.93 } : {}}
        transition={spring}
        className="relative z-10 w-40 h-40 rounded-full flex flex-col items-center justify-center gap-3
          border border-white/[0.05] disabled:opacity-40 disabled:cursor-wait"
        style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)' }}>
        {busy ? (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
            <Loader size={36} strokeWidth={1.2} color={color} />
          </motion.div>
        ) : (
          <motion.div whileHover={{ scale: 1.1 }} transition={spring}>
            <Power size={36} strokeWidth={1.2} color={color} />
          </motion.div>
        )}
        <span className="text-[10px] font-medium tracking-[0.3em] uppercase" style={{ color }}>
          {on ? t.disconnect : busy ? (status === 'connecting' ? t.connecting : t.stopping) : t.connect}
        </span>
      </motion.button>
    </div>
  );
});

/* ==================== STATUS DOT ==================== */
const Status = memo(function Status({ status, t }) {
  const m = {
    initializing: [t.initializing, true], 'not-installed': [t.notInstalled, false],
    installing: [t.installing, true], 'no-electron': [t.desktopRequired, false],
    disconnected: [t.disconnected, false], connecting: [t.connecting, true],
    connected: [t.protected, false], disconnecting: [t.stopping, true],
  };
  const [label, pulse] = m[status] || m.disconnected;
  const on = status === 'connected';
  return (
    <motion.div layout className="flex items-center gap-2.5">
      <span className={`w-2 h-2 rounded-full ${on ? 'bg-white/60 flicker' : pulse ? 'bg-white/20 animate-pulse' : 'bg-white/10'}`} />
      <span className="text-[11px] text-white/30 tracking-[0.25em] uppercase font-gothic">{label}</span>
    </motion.div>
  );
});

/* ==================== INFO LINE ==================== */
const Info = memo(function Info({ icon: Icon, label, value }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div className="flex items-center gap-3">
        <Icon size={14} strokeWidth={1.5} className="text-white/15" />
        <span className="text-[12px] text-white/25 tracking-wider">{label}</span>
      </div>
      <span className="text-[12px] text-white/50 font-mono">{value}</span>
    </div>
  );
});

/* ==================== SPEED BAR ==================== */
const Speed = memo(function Speed({ icon: Icon, label, value, max, barClass }) {
  const measuring = value < 0;
  const pct = measuring ? 0 : Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Icon size={13} strokeWidth={1.5} className="text-white/15" />
          <span className="text-[11px] text-white/20 tracking-wider">{label}</span>
        </div>
        {measuring
          ? <span className="text-[10px] text-white/15 animate-pulse">—</span>
          : <span className="text-[12px] text-white/40 font-mono">{fmtSpeed(value)} <span className="text-white/15 text-[10px]">MB/s</span></span>
        }
      </div>
      <div className="h-[4px] rounded-full bg-white/[0.03] overflow-hidden">
        <motion.div className={`h-full rounded-full ${barClass}`}
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.9, ease: 'easeOut' }} />
      </div>
    </div>
  );
});

/* ==================== TUNNEL STAT BADGE ==================== */
const Badge = memo(function Badge({ icon: Icon, label, value, warn }) {
  return (
    <div className="flex items-center gap-2.5 py-2.5">
      <div className="w-8 h-8 rounded-lg bg-white/[0.02] border border-white/[0.03] flex items-center justify-center shrink-0">
        <Icon size={13} strokeWidth={1.3} className={warn ? 'text-yellow-400/30' : 'text-white/18'} />
      </div>
      <div>
        <p className="text-[9px] text-white/12 tracking-[0.12em] uppercase">{label}</p>
        <p className={`text-[13px] font-medium ${warn ? 'text-yellow-400/40' : 'text-white/45'}`}>{value}</p>
      </div>
    </div>
  );
});

/* ==================== LOCK ENDPOINT ==================== */
const LockEndpoint = memo(function LockEndpoint({ data, onToggle, disabled, t }) {
  return (
    <div className="flex items-center justify-between py-3.5">
      <div className="flex items-center gap-3">
        {data.enabled
          ? <Lock size={15} strokeWidth={1.3} className="text-white/20" />
          : <Unlock size={15} strokeWidth={1.3} className="text-white/12" />
        }
        <div>
          <p className="text-[12px] text-white/35">{t.lockEndpoint}</p>
          <p className="text-[9px] text-white/12 mt-0.5">
            {data.enabled ? data.endpoint || data.ip : t.lockEndpointDesc}
          </p>
        </div>
      </div>
      <button onClick={onToggle} disabled={disabled}
        className="relative w-11 h-[24px] rounded-full transition-all duration-500 shrink-0 disabled:opacity-30"
        style={{ background: data.enabled ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)' }}>
        <motion.div className="absolute top-[3px] w-[18px] h-[18px] rounded-full"
          animate={{ left: data.enabled ? '23px' : '3px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          style={{ background: data.enabled ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.1)' }} />
      </button>
    </div>
  );
});

/* ==================== LOGS ==================== */
const Logs = memo(function Logs({ logs, t }) {
  return (
    <div className="pt-3">
      <div className="flex items-center gap-3 mb-4">
        <MonitorCheck size={15} strokeWidth={1.3} className="text-white/20" />
        <p className="text-[12px] text-white/35">{t.log}</p>
      </div>
      <div className="max-h-52 overflow-y-auto space-y-1">
        {logs.length === 0 && <p className="text-[10px] text-white/10">{t.noActivity}</p>}
        {logs.map(l => (
          <div key={l.id} className="flex gap-2.5 text-[10px] py-0.5">
            <span className="text-white/8 font-mono shrink-0">{l.time}</span>
            <span className={l.type === 'success' ? 'text-white/30' : l.type === 'error' ? 'text-red-400/30' : l.type === 'warn' ? 'text-yellow-400/20' : 'text-white/15'}>
              {l.msg}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});

function Sep() {
  return <div className="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent my-2" />;
}

/* ==================== UPDATE BANNER ==================== */
const UpdateBanner = memo(function UpdateBanner({ update, onDownload, onDismiss, t }) {
  if (!update) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      transition={spring}
      className="fixed top-9 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl
        bg-white/[0.06] backdrop-blur-xl border border-white/[0.12]
        shadow-[0_10px_40px_rgba(0,0,0,0.55)]">
      <Download size={14} strokeWidth={1.5} className="text-white/55" />
      <div className="flex flex-col">
        <p className="text-[10px] text-white/40 tracking-wider uppercase">{t.updateAvail}</p>
        <p className="text-[11px] text-white/65 font-mono">{update.latest}</p>
      </div>
      <button onClick={onDownload}
        className="ml-2 px-3 py-1.5 rounded-lg bg-white/[0.08] border border-white/[0.12]
          hover:bg-white/[0.14] hover:border-white/[0.2] text-white/70 text-[10px] tracking-wider uppercase
          transition-colors">
        {t.updateDownload}
      </button>
      <button onClick={onDismiss}
        className="w-6 h-6 rounded-md hover:bg-white/[0.05] flex items-center justify-center
          text-white/25 hover:text-white/55 transition-colors">
        <X size={12} strokeWidth={1.5} />
      </button>
    </motion.div>
  );
});

/* ==================== DNS FILTER ==================== */
const DnsFilter = memo(function DnsFilter({ mode, onChange, t }) {
  const opts = [
    { v: 'off',     label: t.dnsOff,     desc: t.dnsOffDesc },
    { v: 'malware', label: t.dnsMalware, desc: t.dnsMalwareDesc },
    { v: 'full',    label: t.dnsFull,    desc: t.dnsFullDesc },
  ];
  return (
    <div className="py-3.5">
      <div className="flex items-center gap-3 mb-3">
        <Filter size={15} strokeWidth={1.3} className="text-white/20 shrink-0" />
        <div>
          <p className="text-[12px] text-white/35">{t.dnsFilter}</p>
          <p className="text-[9px] text-white/12 mt-0.5">{t.dnsFilterDesc}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {opts.map(o => {
          const active = mode === o.v;
          return (
            <motion.button key={o.v} onClick={() => onChange(o.v)}
              whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} transition={spring}
              className={`px-2 py-2.5 rounded-xl text-center transition-all duration-400
                ${active
                  ? 'bg-white/[0.07] border border-white/[0.09]'
                  : 'bg-white/[0.015] border border-white/[0.025] hover:border-white/[0.06]'}`}>
              <p className={`text-[10px] font-medium tracking-wider uppercase ${active ? 'text-white/45' : 'text-white/20'}`}>
                {o.label}
              </p>
              <p className={`text-[8px] mt-1 ${active ? 'text-white/25' : 'text-white/12'}`}>
                {o.desc}
              </p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
});

/* ==================== SPLIT TUNNELING ==================== */
const SplitTunnel = memo(function SplitTunnel({ hosts, onAdd, onRemove, t }) {
  const [input, setInput] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    if (!v) return;
    setBusy(true); setErr('');
    const r = await onAdd(v);
    setBusy(false);
    if (r?.success) setInput('');
    else setErr(r?.error || 'invalid');
  };

  return (
    <div className="py-3.5">
      <div className="flex items-center gap-3 mb-3">
        <GitBranch size={15} strokeWidth={1.3} className="text-white/20 shrink-0" />
        <div>
          <p className="text-[12px] text-white/35">{t.splitTunnel}</p>
          <p className="text-[9px] text-white/12 mt-0.5">{t.splitTunnelDesc}</p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <input value={input}
          onChange={e => { setInput(e.target.value); setErr(''); }}
          onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          placeholder={t.addDomain}
          className={`flex-1 px-3 py-2 rounded-lg bg-white/[0.02] border text-[11px] text-white/55
            placeholder:text-white/15 outline-none transition-colors
            ${err ? 'border-red-400/30' : 'border-white/[0.04] focus:border-white/[0.1]'}`} />
        <motion.button onClick={submit} disabled={busy || !input.trim()}
          whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} transition={spring}
          className="px-3 rounded-lg bg-white/[0.04] border border-white/[0.06]
            hover:border-white/[0.12] text-white/40 disabled:opacity-30 disabled:cursor-not-allowed
            transition-colors flex items-center justify-center">
          <Plus size={14} strokeWidth={1.5} />
        </motion.button>
      </div>

      <div className="max-h-44 overflow-y-auto space-y-1.5">
        {hosts.length === 0 && (
          <p className="text-[10px] text-white/10 py-1">{t.emptyHosts}</p>
        )}
        <AnimatePresence initial={false}>
          {hosts.map(h => (
            <motion.div key={h}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-white/[0.015] border border-white/[0.03]">
              <span className="text-[11px] text-white/40 font-mono truncate">{h}</span>
              <button onClick={() => onRemove(h)}
                className="shrink-0 w-6 h-6 rounded-md hover:bg-white/[0.05] flex items-center justify-center
                  text-white/25 hover:text-white/55 transition-colors">
                <X size={12} strokeWidth={1.5} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
});

/* ==================== MODE SWITCHER (FREE / PRO) ==================== */
const ModeSwitcher = memo(function ModeSwitcher({ mode, setMode }) {
  return (
    <div className="flex items-center justify-center mb-4">
      <div className="relative flex items-center bg-white/[0.02] border border-white/[0.04] rounded-full p-1">
        <motion.div
          className="absolute top-1 bottom-1 rounded-full bg-white/[0.06] border border-white/[0.06]"
          animate={{
            left:  mode === 'free' ? 4 : '50%',
            right: mode === 'free' ? '50%' : 4,
          }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        />
        <button
          onClick={() => setMode('free')}
          className={`relative z-10 px-5 py-1.5 rounded-full text-[10px] tracking-[0.22em] uppercase font-medium transition-colors ${
            mode === 'free' ? 'text-white/65' : 'text-white/25 hover:text-white/40'
          }`}
        >
          Free
        </button>
        <button
          onClick={() => setMode('pro')}
          className={`relative z-10 px-5 py-1.5 rounded-full text-[10px] tracking-[0.22em] uppercase font-medium transition-colors ${
            mode === 'pro' ? 'text-white/65' : 'text-white/25 hover:text-white/40'
          }`}
        >
          Pro
        </button>
      </div>
    </div>
  );
});

/* ==================== SETTINGS PAGE ==================== */
function SettingsPage({ state, lang, setLang, t, onBack }) {
  return (
    <motion.div {...slideIn} className="relative z-10 flex flex-col min-h-screen px-7 py-6 max-w-[480px] mx-auto">
      <div className="flex items-center gap-4 pt-3 pb-6">
        <motion.button onClick={onBack}
          whileHover={{ scale: 1.1, x: -3 }} whileTap={{ scale: 0.9 }} transition={spring}
          className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.04] flex items-center justify-center
            hover:border-white/[0.08] transition-colors">
          <ArrowLeft size={16} strokeWidth={1.5} className="text-white/25" />
        </motion.button>
        <h2 className="text-[16px] font-gothic tracking-[0.15em] text-white/35">{t.settings}</h2>
      </div>

      <div className="flex-1 overflow-y-auto space-y-0">
        {/* Language */}
        <div className="flex items-center justify-between py-3.5">
          <div className="flex items-center gap-3">
            <Globe size={15} strokeWidth={1.3} className="text-white/20" />
            <span className="text-[12px] text-white/35">{t.language}</span>
          </div>
          <div className="flex gap-1.5">
            {['en', 'ru'].map(l => (
              <motion.button key={l}
                onClick={() => { setLang(l); try { localStorage.setItem('phantom-lang', l); } catch {} }}
                whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} transition={spring}
                className={`px-4 py-2 rounded-xl text-[11px] font-medium tracking-wider uppercase transition-all duration-400
                  ${lang === l
                    ? 'bg-white/[0.07] border border-white/[0.09] text-white/45'
                    : 'bg-white/[0.015] border border-white/[0.025] text-white/15 hover:border-white/[0.06]'
                  }`}>
                {l}
              </motion.button>
            ))}
          </div>
        </div>

        <Sep />

        {/* Kill Switch */}
        <ToggleRow icon={Shield} label={t.killSwitch} desc={t.killSwitchDesc}
          enabled={state.killSwitch} onChange={(v) => warpManager.setKillSwitch(v)} />

        <Sep />

        {/* Auto-Connect */}
        <ToggleRow icon={Wifi} label={t.autoConnect} desc={t.autoConnectDesc}
          enabled={state.autoConnect} onChange={(v) => warpManager.setAutoConnect(v)} />

        {/* Auto-Start */}
        <ToggleRow icon={RefreshCw} label={t.autoStart} desc={t.autoStartDesc}
          enabled={state.autoStart} onChange={(v) => warpManager.setAutoStart(v)} />

        <Sep />

        {/* DNS Family Filter */}
        <DnsFilter mode={state.familiesMode}
          onChange={(m) => warpManager.setFamiliesMode(m)} t={t} />

        <Sep />

        {/* Split Tunneling */}
        <SplitTunnel hosts={state.splitHosts}
          onAdd={(h) => warpManager.addSplitHost(h)}
          onRemove={(h) => warpManager.removeSplitHost(h)} t={t} />

        <Sep />

        <Logs logs={state.logs} t={t} />
      </div>
    </motion.div>
  );
}

/* ====================== APP ====================== */
export default function App() {
  const [state, setState] = useState({
    status: 'initializing', stats: warpManager.stats, logs: [],
    isElectron: false, warpInstalled: false,
    staticIp: { enabled: false }, ipInfo: {},
    killSwitch: false, autoConnect: false, autoStart: false,
    familiesMode: 'off', splitHosts: [],
  });
  const [elapsed, setElapsed] = useState('00:00:00');
  const [page, setPage] = useState('main');
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('phantom-lang') || 'en'; } catch { return 'en'; }
  });
  const [mode, setMode] = useState(() => {
    try { return localStorage.getItem('phantom-mode') || 'free'; } catch { return 'free'; }
  });
  const setModePersist = (m) => {
    setMode(m);
    try { localStorage.setItem('phantom-mode', m); } catch {}
  };
  const [country, setCountry] = useState(null);
  const timerRef = useRef(null);
  const t = i18n[lang];

  useEffect(() => {
    const unsub = warpManager.onChange(setState);
    warpManager.init();
    return unsub;
  }, []);

  // Детект страны через cdn-cgi/trace — нужно для решения Free WARP vs Free VLESS.
  useEffect(() => {
    if (!window.pro) return;
    window.pro.detectCountry().then((c) => setCountry(c || null)).catch(() => {});
  }, []);

  const freeUsesVless = mode === 'free' && country === 'RU';

  useEffect(() => {
    if (state.status === 'connected' && state.stats.connectedSince) {
      timerRef.current = setInterval(() => setElapsed(fmt(state.stats.connectedSince)), 1000);
    } else {
      setElapsed('00:00:00');
    }
    return () => clearInterval(timerRef.current);
  }, [state.status, state.stats.connectedSince]);

  const toggle = useCallback(() => {
    if (state.status === 'connected') warpManager.disconnect();
    else if (state.status === 'disconnected') warpManager.connect();
  }, [state.status]);

  const on = state.status === 'connected';
  const { stats } = state;
  const can = state.status === 'disconnected' || on;

  const locationStr = useMemo(() => state.ipInfo?.country
    ? `${state.ipInfo.city ? state.ipInfo.city + ', ' : ''}${state.ipInfo.country}`
    : '', [state.ipInfo?.city, state.ipInfo?.country]);

  const lossWarn = stats.loss > 5;

  return (
    <div className="relative min-h-screen">
      <div className="bg-scene" />

      <AnimatePresence>
        {state.update && (
          <UpdateBanner update={state.update}
            onDownload={() => warpManager.openUpdate()}
            onDismiss={() => warpManager.dismissUpdate()} t={t} />
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {page === 'settings' ? (
          <SettingsPage key="settings" state={state} lang={lang} setLang={setLang} t={t}
            onBack={() => setPage('main')} />
        ) : (
          <motion.div key="main" {...slideOut}
            className="relative z-10 flex flex-col min-h-screen px-7 py-6 max-w-[480px] mx-auto">

            {/* Header */}
            <motion.div className="flex items-center justify-between pt-3 pb-2"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8 }}>
              <div className="flex items-center gap-3">
                <Shield size={20} strokeWidth={1.5} className="text-white/20" />
                <h1 className="text-[20px] font-gothic tracking-[0.1em] text-white/40">
                  {t.title} <span className="text-white/15 font-normal">{t.titleSuffix}</span>
                </h1>
              </div>
              <div className="flex items-center gap-2">
                {/* Kill Switch indicator */}
                {state.killSwitch && (
                  <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
                    className="w-7 h-7 rounded-lg bg-white/[0.03] border border-white/[0.05] flex items-center justify-center"
                    title="Kill Switch active">
                    <Shield size={13} strokeWidth={1.5} className="text-white/25" />
                  </motion.div>
                )}
                <motion.button onClick={() => setPage('settings')}
                  whileHover={{ scale: 1.1, rotate: 30 }} whileTap={{ scale: 0.9 }} transition={spring}
                  className="w-9 h-9 rounded-xl bg-white/[0.02] border border-white/[0.03] flex items-center justify-center
                    hover:border-white/[0.07] transition-colors duration-500">
                  <Settings size={16} strokeWidth={1.3} className="text-white/20" />
                </motion.button>
              </div>
            </motion.div>
            <p className="text-[9px] text-white/10 tracking-[0.4em] uppercase font-gothic text-center mb-2">{t.subtitle}</p>

            {/* FREE / PRO mode switcher */}
            <ModeSwitcher mode={mode} setMode={setModePersist} />

            {/* Center Area */}
            <motion.div className="flex-1 flex flex-col items-center justify-center"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15 }}>

              {mode === 'pro' ? (
                <ProMode tier="pro" />
              ) : freeUsesVless ? (
                <ProMode tier="free" />
              ) : (<>

              <Status status={state.status} t={t} />

              {/* Install / loading states */}
              <AnimatePresence mode="wait">
                {state.status === 'not-installed' && (
                  <motion.div key="inst" {...fade} className="my-12 text-center space-y-5">
                    <Shield size={30} strokeWidth={1} className="text-white/10 mx-auto" />
                    <p className="text-[12px] text-white/20">{t.warpRequired}</p>
                    <motion.button onClick={() => warpManager.install()}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} transition={spring}
                      className="px-8 py-3 rounded-full border border-white/[0.06] text-white/30 text-[12px] tracking-[0.15em] uppercase
                        hover:border-white/[0.1] hover:text-white/40 transition-colors duration-500">
                      {t.install}
                    </motion.button>
                  </motion.div>
                )}
                {state.status === 'installing' && (
                  <motion.div key="ing" {...fade} className="my-12 text-center space-y-4">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                      <Loader size={26} strokeWidth={1.2} className="text-white/15 mx-auto" />
                    </motion.div>
                    <p className="text-[12px] text-white/15">{t.installingDots}</p>
                  </motion.div>
                )}
                {state.status === 'no-electron' && (
                  <motion.div key="web" {...fade} className="my-12 text-center space-y-3">
                    <p className="text-[12px] text-white/20">{t.desktopApp}</p>
                    <code className="text-[11px] text-white/15 font-mono">npm run electron:dev</code>
                  </motion.div>
                )}
                {state.status === 'initializing' && (
                  <motion.div key="init" {...fade} className="my-12">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                      <Loader size={22} strokeWidth={1.2} className="text-white/10 mx-auto" />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {can && <PowerBtn status={state.status} onClick={toggle} t={t} disabled={warpManager._busy} />}

              {/* Connection info */}
              <AnimatePresence>
                {on && (
                  <motion.div key="details" {...fade} className="w-full">
                    <Sep />
                    <Info icon={Shield} label={t.ip} value={stats.publicIp || '...'} />
                    {locationStr && <Info icon={MapPin} label={t.location} value={locationStr} />}
                    <Info icon={Zap} label={t.latency} value={stats.ping > 0 ? `${stats.ping} ms` : '...'} />
                    <Info icon={Clock} label={t.session} value={elapsed} />
                    <Sep />
                  </motion.div>
                )}
              </AnimatePresence>

              {!on && state.status === 'disconnected' && (
                <motion.p {...fade} className="text-white/10 text-[11px] text-center tracking-wider">
                  {t.tapToEncrypt}
                </motion.p>
              )}
              </>)}
            </motion.div>

            {/* Bottom Stats (WARP only) */}
            <AnimatePresence>
              {mode === 'free' && !freeUsesVless && on && (
                <motion.div key="bottom" className="space-y-4 pb-2"
                  initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 0.1 }}>

                  {/* Speed bars */}
                  <div className="space-y-3">
                    <Speed icon={Download} label={t.download} value={stats.downloadSpeed} max={20} barClass="bar-down" />
                    <Speed icon={Upload} label={t.upload} value={stats.uploadSpeed} max={10} barClass="bar-up" />
                  </div>

                  {/* Tunnel stats badges */}
                  <div className="grid grid-cols-2 gap-x-3">
                    <Badge icon={ArrowDown} label={t.received} value={fmtB(stats.totalDownload)} />
                    <Badge icon={ArrowUp}   label={t.sent}     value={fmtB(stats.totalUpload)} />
                    <Badge icon={AlertTriangle} label={t.loss} value={`${stats.loss.toFixed(1)}%`} warn={lossWarn} />
                    <Badge icon={MapPin}  label={t.datacenter} value={stats.colo || '...'} />
                  </div>

                  {/* Protocol + Post-quantum badge */}
                  {(stats.protocol || stats.postQuantum) && (
                    <div className="flex items-center gap-2">
                      {stats.protocol && (
                        <span className="text-[9px] text-white/15 tracking-wider px-2 py-1 rounded-md border border-white/[0.04] bg-white/[0.01]">
                          {stats.protocol}
                        </span>
                      )}
                      {stats.postQuantum && (
                        <motion.div initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={spring}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-md border border-white/[0.06] bg-white/[0.02]">
                          <Atom size={10} strokeWidth={1.3} className="text-white/25" />
                          <span className="text-[9px] text-white/25 tracking-wider">{t.quantumShield}</span>
                        </motion.div>
                      )}
                    </div>
                  )}

                  <Sep />

                  {/* Lock Endpoint */}
                  <LockEndpoint data={state.staticIp}
                    onToggle={() => warpManager.toggleStaticIp()}
                    disabled={state.status !== 'connected'} t={t} />

                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
