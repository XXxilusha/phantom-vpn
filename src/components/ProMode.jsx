import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Power, Loader, Globe, Download, MessageCircle, Key,
  AlertCircle, Shield, ArrowUpRight, Trash2, Clock,
  MapPin, Zap, Cpu, Sparkle,
} from 'lucide-react';
import { proManager } from '../lib/proManager';

const BOT_USERNAME = 'phantomvpnby_bot';
const spring = { type: 'spring', stiffness: 300, damping: 24 };

const fadeIn = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.4 },
};

/**
 * tier: 'pro' (по умолчанию) — поток с Telegram-ботом и вставкой VLESS вручную.
 *       'free' — авто-регистрация Free UUID, юзер видит только Connect.
 */
export default function ProMode({ tier = 'pro' }) {
  const [s, setS] = useState({
    proStatus: 'disconnected',
    proTier: null,
    proSubscription: null,
    proHasFree: false,
    proFreeExpiresAt: null,
    proHasBinary: false,
    proError: null,
    proBusy: false,
    proDownloading: false,
  });
  const [urlInput, setUrlInput] = useState('');
  const [urlInputErr, setUrlInputErr] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [freeBootstrapping, setFreeBootstrapping] = useState(false);

  useEffect(() => {
    const unsub = proManager.onChange(setS);
    proManager.init();
    return unsub;
  }, []);

  // tier='free' и нет freeSub → авто-регистрация при заходе в режим
  useEffect(() => {
    if (tier !== 'free' || !s.proHasBinary || s.proHasFree || freeBootstrapping) return;
    setFreeBootstrapping(true);
    proManager.ensureFree().finally(() => setFreeBootstrapping(false));
  }, [tier, s.proHasBinary, s.proHasFree, freeBootstrapping]);

  const isConnected = s.proStatus === 'connected';
  const isBusy = s.proStatus === 'connecting' || s.proStatus === 'disconnecting';
  const noBinary = !s.proHasBinary;
  const hasProSubscription = !!s.proSubscription;
  const hasFreeSubscription = !!s.proHasFree;

  const onConnectPro = async () => {
    if (isConnected) return proManager.disconnect();
    if (!hasProSubscription && !urlInput.trim()) return;
    const url = urlInput.trim() || s.proSubscription;
    const r = await proManager.connect({ tier: 'pro', url: urlInput.trim() ? url : undefined });
    if (r?.success) setUrlInput('');
  };
  const onConnectFree = async () => {
    if (isConnected) return proManager.disconnect();
    await proManager.connect({ tier: 'free' });
  };

  const onSaveUrl = async () => {
    const v = urlInput.trim();
    if (!v) return;
    if (!v.startsWith('vless://')) { setUrlInputErr('Должна начинаться с vless://'); return; }
    const r = await proManager.setSubscription(v);
    if (r.success) { setUrlInput(''); setUrlInputErr(''); }
    else setUrlInputErr(r.error || 'invalid');
  };

  const onForget = async () => proManager.forgetSubscription();
  const onDownload = async () => proManager.downloadBinary();

  // Binary missing — auto-download CTA (общий для обоих tier)
  if (noBinary) {
    return (
      <motion.div {...fadeIn} className="relative w-full">
        <BinaryGate downloading={s.proDownloading} error={s.proError} onDownload={onDownload} />
      </motion.div>
    );
  }

  return (
    <motion.div {...fadeIn} className="relative w-full">
      {tier === 'free' ? (
        freeBootstrapping || !hasFreeSubscription ? (
          <FreeBootstrap />
        ) : (
          <FreeConnected
            isConnected={isConnected}
            isBusy={isBusy}
            status={s.proStatus}
            error={s.proError}
            expiresAt={s.proFreeExpiresAt}
            onClick={onConnectFree}
          />
        )
      ) : !hasProSubscription ? (
        <ProOnboarding
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          err={urlInputErr}
          setErr={setUrlInputErr}
          onSave={onSaveUrl}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
        />
      ) : (
        <ProConnected
          isConnected={isConnected}
          isBusy={isBusy}
          status={s.proStatus}
          error={s.proError}
          onClick={onConnectPro}
          onForget={onForget}
          subscription={s.proSubscription}
        />
      )}
    </motion.div>
  );
}

/* ─────────── Binary gate ─────────── */

function BinaryGate({ downloading, error, onDownload }) {
  return (
    <motion.div {...fadeIn} className="space-y-6 px-2 py-4">
      <div className="text-center space-y-3">
        <Download size={26} strokeWidth={1.2} className="text-white/25 mx-auto" />
        <h3 className="text-[13px] text-white/55 font-medium tracking-wide">Установка движка</h3>
        <p className="text-[11px] text-white/30 leading-relaxed max-w-xs mx-auto">
          Нужен бинарь sing-box (~20 МБ). Загружается один раз с GitHub.
        </p>
      </div>
      <motion.button
        onClick={onDownload}
        disabled={downloading}
        whileHover={!downloading ? { scale: 1.03 } : {}}
        whileTap={!downloading ? { scale: 0.97 } : {}}
        transition={spring}
        className="w-full py-3.5 rounded-full text-[11px] tracking-[0.2em] uppercase font-medium
          bg-white/[0.05] border border-white/[0.08] text-white/55
          hover:bg-white/[0.09] hover:border-white/[0.18] hover:text-white/85
          disabled:opacity-40 disabled:cursor-wait
          flex items-center justify-center gap-2.5 transition-colors"
      >
        {downloading ? (
          <>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
              <Loader size={13} strokeWidth={1.6} />
            </motion.div>
            <span>Скачиваем</span>
          </>
        ) : (
          <>
            <Download size={13} strokeWidth={1.6} />
            <span>Загрузить sing-box</span>
          </>
        )}
      </motion.button>
      {error && <ErrorRow text={error} />}
      <p className="text-[9px] text-white/15 text-center tracking-wider">
        github.com/SagerNet/sing-box
      </p>
    </motion.div>
  );
}

/* ─────────── FREE: bootstrap / connected ─────────── */

function FreeBootstrap() {
  return (
    <motion.div {...fadeIn} className="text-center space-y-3 py-10">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}>
        <Loader size={22} strokeWidth={1.2} className="text-white/20 mx-auto" />
      </motion.div>
      <p className="text-[11px] text-white/30 tracking-wider">Готовим бесплатную подписку…</p>
    </motion.div>
  );
}

function FreeConnected({ isConnected, isBusy, status, error, expiresAt, onClick }) {
  const statusLabel = isConnected ? 'Free · Защищено' : isBusy
    ? (status === 'connecting' ? 'Подключение' : 'Отключение')
    : 'Free · Готов';
  const daysLeft = expiresAt ? Math.max(0, Math.ceil((expiresAt * 1000 - Date.now()) / 86400000)) : null;
  const info = useConnectionInfo(isConnected);

  return (
    <motion.div {...fadeIn} className="space-y-5">
      <StatusBar isConnected={isConnected} isBusy={isBusy} status={status} label={statusLabel} />
      <PowerCircle isConnected={isConnected} isBusy={isBusy} onClick={onClick} />

      <AnimatePresence>
        {isConnected && (
          <motion.div key="info" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <InfoPanel
              tier="free"
              ip={info.ip}
              location={info.location}
              uptime={info.uptime}
              extraLabel="Free · 1 устройство"
              extraValue={daysLeft !== null ? `обновится через ${daysLeft} дн.` : null}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isConnected && <TrafficPulse />}

      {!isConnected && !isBusy && (
        <p className="text-white/15 text-[11px] text-center tracking-wider px-4 leading-relaxed">
          Free · 1 устройство · автообновление 30 дней<br/>
          VLESS-канал, работает в России и везде
        </p>
      )}

      {!isConnected && (
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[10px] text-white/22 hover:text-white/50 tracking-[0.18em] uppercase transition-colors py-2"
        >
          Больше устройств и приоритет · Pro →
        </a>
      )}

      {error && <ErrorRow text={error} />}
    </motion.div>
  );
}

/* ─────────── PRO onboarding (нет подписки) ─────────── */

function ProOnboarding({ urlInput, setUrlInput, err, setErr, onSave, showAdvanced, setShowAdvanced }) {
  const tgLink = `https://t.me/${BOT_USERNAME}`;
  return (
    <motion.div {...fadeIn} className="space-y-5 px-2 py-2">
      <div className="text-center space-y-2.5">
        <Key size={26} strokeWidth={1.2} className="text-white/25 mx-auto" />
        <h3 className="text-[13px] text-white/55 font-medium tracking-wide">Подключи Pro</h3>
        <p className="text-[11px] text-white/30 leading-relaxed max-w-xs mx-auto">
          Открой Telegram-бот, получи персональную ссылку (3 дня бесплатно), и Phantom Pro готов.
        </p>
      </div>

      <motion.a
        href={tgLink}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        transition={spring}
        className="w-full py-3.5 rounded-full text-[11px] tracking-[0.2em] uppercase font-medium
          bg-white/[0.05] border border-white/[0.08] text-white/65
          hover:bg-white/[0.09] hover:border-white/[0.2] hover:text-white/95
          flex items-center justify-center gap-2.5 no-underline transition-colors"
      >
        <MessageCircle size={13} strokeWidth={1.6} />
        <span>Открыть бот в Telegram</span>
        <ArrowUpRight size={12} strokeWidth={2} />
      </motion.a>

      <button
        onClick={() => setShowAdvanced((v) => !v)}
        className="w-full text-[10px] text-white/25 hover:text-white/45 tracking-[0.2em] uppercase transition-colors py-1"
      >
        {showAdvanced ? 'скрыть' : 'вставить ссылку вручную'}
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="space-y-2 overflow-hidden"
          >
            <textarea
              value={urlInput}
              onChange={(e) => { setUrlInput(e.target.value); setErr(''); }}
              placeholder="vless://uuid@host:443?..."
              rows={3}
              className={`w-full px-3.5 py-3 rounded-xl bg-white/[0.02] border text-[10.5px] text-white/55
                placeholder:text-white/15 outline-none transition-colors font-mono resize-none
                ${err ? 'border-red-400/30' : 'border-white/[0.05] focus:border-white/[0.12]'}`}
            />
            <button
              onClick={onSave}
              disabled={!urlInput.trim()}
              className="w-full py-3 rounded-xl text-[10px] tracking-[0.2em] uppercase
                bg-white/[0.04] border border-white/[0.06] hover:border-white/[0.15] text-white/45
                disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Сохранить ссылку
            </button>
            {err && <ErrorRow text={err} />}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─────────── PRO connected (с подпиской) ─────────── */

function ProConnected({ isConnected, isBusy, status, error, onClick, onForget, subscription }) {
  const subHost = (() => {
    try { return new URL(subscription).hostname; } catch { return 'unknown'; }
  })();
  const statusLabel = isConnected ? 'Pro · Защищено' : isBusy
    ? (status === 'connecting' ? 'Подключение' : 'Отключение')
    : 'Pro · Готов';
  const info = useConnectionInfo(isConnected);

  return (
    <motion.div {...fadeIn} className="space-y-5">
      {/* Pro premium banner */}
      <div className="flex items-center justify-center gap-2 -mt-1">
        <Sparkle size={11} strokeWidth={1.5} className="text-white/55" />
        <span className="text-[10px] tracking-[0.32em] uppercase text-white/55 font-medium">
          Phantom Pro
        </span>
        <Sparkle size={11} strokeWidth={1.5} className="text-white/55" />
      </div>

      <StatusBar isConnected={isConnected} isBusy={isBusy} status={status} label={statusLabel} accent />
      <PowerCircle isConnected={isConnected} isBusy={isBusy} onClick={onClick} accent />

      <AnimatePresence>
        {isConnected && (
          <motion.div key="info" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <InfoPanel
              tier="pro"
              ip={info.ip}
              location={info.location}
              uptime={info.uptime}
              extraLabel="Pro · до 3 устройств"
              extraValue="Приоритетный канал"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Locations preview — coming in v3.5 */}
      {isConnected && (
        <LocationRow />
      )}

      {/* subscription row */}
      <div className="rounded-xl bg-white/[0.025] border border-white/[0.06] px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield size={12} strokeWidth={1.5} className="text-white/45" />
            <span className="text-[10px] tracking-[0.18em] uppercase text-white/45">Подписка</span>
          </div>
          <button
            onClick={onForget}
            className="w-6 h-6 rounded-md hover:bg-white/[0.05] flex items-center justify-center
              text-white/20 hover:text-white/55 transition-colors"
            title="Удалить подписку"
          >
            <Trash2 size={11} strokeWidth={1.5} />
          </button>
        </div>
        <div className="flex items-center gap-2 pl-[22px]">
          <Globe size={11} strokeWidth={1.5} className="text-white/30" />
          <span className="text-[11px] text-white/55 font-mono truncate">{subHost}</span>
        </div>
      </div>

      {isConnected && <TrafficPulse accent />}

      {!isConnected && !isBusy && (
        <p className="text-white/15 text-[11px] text-center tracking-wider">
          Жми кнопку — Phantom направит трафик через приоритетный VLESS-канал
        </p>
      )}

      {!isConnected && !isBusy && (
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[10px] text-white/35 hover:text-white/70 tracking-[0.18em] uppercase transition-colors py-2"
        >
          Управлять подпиской в Telegram →
        </a>
      )}

      {error && <ErrorRow text={error} />}
    </motion.div>
  );
}

/* ─────────── Shared: status bar, power button, info panel, traffic pulse ─────────── */

function StatusBar({ isConnected, isBusy, status, label, accent }) {
  const dotColor = isConnected ? (accent ? 'bg-white/85 flicker' : 'bg-white/60 flicker')
    : isBusy ? 'bg-white/20 animate-pulse' : 'bg-white/10';
  return (
    <div className="flex items-center justify-center gap-2.5">
      <span className={`w-2 h-2 rounded-full ${dotColor}`} />
      <span className={`text-[11px] tracking-[0.25em] uppercase font-gothic ${accent && isConnected ? 'text-white/65' : 'text-white/30'}`}>
        {label}
      </span>
    </div>
  );
}

function PowerCircle({ isConnected, isBusy, onClick, accent }) {
  const ringColor = accent ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)';
  const innerBg = accent && isConnected ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.02)';
  const borderColor = accent && isConnected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
  const iconColor = isConnected ? (accent ? 'text-white/80' : 'text-white/55') : 'text-white/30';
  const labelColor = isConnected ? (accent ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.3)';

  return (
    <div className="relative flex items-center justify-center my-2">
      <AnimatePresence>
        {isConnected && [0, 0.8, 1.6].map((d, i) => (
          <motion.div
            key={i}
            className="absolute w-44 h-44 rounded-full border"
            style={{ borderColor: ringColor }}
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: [0.85, 1.8], opacity: [accent ? 0.45 : 0.3, 0] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeOut', delay: d }}
          />
        ))}
      </AnimatePresence>

      <motion.button
        onClick={onClick}
        disabled={isBusy}
        whileHover={!isBusy ? { scale: 1.07 } : {}}
        whileTap={!isBusy ? { scale: 0.93 } : {}}
        transition={spring}
        className="relative z-10 w-36 h-36 rounded-full flex flex-col items-center justify-center gap-2.5
          border disabled:opacity-40 disabled:cursor-wait"
        style={{ background: innerBg, borderColor, backdropFilter: 'blur(20px)' }}
      >
        {isBusy ? (
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
            <Loader size={30} strokeWidth={1.2} className={iconColor} />
          </motion.div>
        ) : (
          <Power size={30} strokeWidth={1.2} className={iconColor} />
        )}
        <span className="text-[9px] font-medium tracking-[0.3em] uppercase" style={{ color: labelColor }}>
          {isConnected ? 'Disconnect' : 'Connect'}
        </span>
      </motion.button>
    </div>
  );
}

function InfoPanel({ tier, ip, location, uptime, extraLabel, extraValue }) {
  const isPro = tier === 'pro';
  return (
    <div
      className="rounded-xl px-3.5 py-3.5 space-y-2.5 border"
      style={{
        background: isPro ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.02)',
        borderColor: isPro ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.04)',
      }}
    >
      <InfoRow icon={Globe} label="IP" value={ip || '...'} />
      <InfoRow icon={MapPin} label="Локация" value={location || '...'} />
      <InfoRow icon={Clock} label="Сессия" value={uptime} mono />
      {extraLabel && (
        <InfoRow icon={isPro ? Cpu : Shield} label={extraLabel} value={extraValue || ''} accent={isPro} />
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, mono, accent }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <Icon size={12} strokeWidth={1.5} className={accent ? 'text-white/55' : 'text-white/25'} />
        <span className={`text-[11px] tracking-wider ${accent ? 'text-white/55' : 'text-white/35'}`}>{label}</span>
      </div>
      <span className={`text-[11px] ${mono ? 'font-mono' : ''} ${accent ? 'text-white/75' : 'text-white/55'} truncate max-w-[55%] text-right`}>
        {value}
      </span>
    </div>
  );
}

function LocationRow() {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-white/[0.05]">
      <div className="flex items-center gap-2.5">
        <MapPin size={12} strokeWidth={1.5} className="text-white/35" />
        <span className="text-[11px] tracking-wider text-white/45">Локация</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-white/55">Авто · Cloudflare</span>
        <span className="text-[8px] text-white/25 tracking-[0.2em] uppercase ml-1.5 px-1.5 py-0.5 rounded border border-white/[0.05]">
          v3.5
        </span>
      </div>
    </div>
  );
}

function TrafficPulse({ accent }) {
  return (
    <div className="flex items-center justify-center gap-6 py-1">
      <PulseDot direction="down" accent={accent} />
      <PulseDot direction="up" delay={0.4} accent={accent} />
    </div>
  );
}

function PulseDot({ direction, delay = 0, accent }) {
  return (
    <div className="flex items-center gap-2">
      <motion.div
        className="w-1 h-1 rounded-full"
        style={{ background: accent ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)' }}
        animate={{ opacity: [0.2, 1, 0.2], scale: [0.85, 1.4, 0.85] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay }}
      />
      <span className="text-[8px] text-white/20 tracking-[0.3em] uppercase">
        {direction === 'down' ? '↓ in' : '↑ out'}
      </span>
    </div>
  );
}

// ── Хук: подтягивает IP, локацию, и считает аптайм
function useConnectionInfo(isConnected) {
  const [info, setInfo] = useState({ ip: '', location: '', uptime: '00:00:00' });
  const startRef = useRef(null);

  useEffect(() => {
    if (!isConnected) { startRef.current = null; setInfo((s) => ({ ...s, uptime: '00:00:00' })); return; }
    startRef.current = Date.now();
    let cancelled = false;
    (async () => {
      try {
        if (window.vpn?.getPublicIp) {
          const ip = await window.vpn.getPublicIp();
          if (!cancelled) setInfo((s) => ({ ...s, ip: ip || '' }));
        }
        if (window.vpn?.getIpInfo) {
          const i = await window.vpn.getIpInfo();
          if (!cancelled && i?.country) {
            const loc = i.city ? `${i.city}, ${i.country}` : i.country;
            setInfo((s) => ({ ...s, location: loc }));
          }
        }
      } catch {}
    })();
    const t = setInterval(() => {
      if (!startRef.current) return;
      const s = Math.floor((Date.now() - startRef.current) / 1000);
      const hms = [s / 3600 | 0, (s % 3600) / 60 | 0, s % 60]
        .map((v) => String(v).padStart(2, '0')).join(':');
      setInfo((prev) => ({ ...prev, uptime: hms }));
    }, 1000);
    return () => { cancelled = true; clearInterval(t); };
  }, [isConnected]);

  return info;
}

function Badge({ label }) {
  return (
    <div className="px-2.5 py-1 rounded-md border border-white/[0.06] bg-white/[0.02]">
      <span className="text-[9px] text-white/30 tracking-[0.18em] uppercase">{label}</span>
    </div>
  );
}

function ErrorRow({ text }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/[0.05] border border-red-400/15">
      <AlertCircle size={11} strokeWidth={1.5} className="text-red-300/65 mt-0.5 shrink-0" />
      <span className="text-[10px] text-red-200/65">{text}</span>
    </div>
  );
}
