import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Power, Loader, Globe, Download, MessageCircle, Key,
  AlertCircle, Shield, ArrowRight, Trash2, ArrowUpRight,
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

export default function ProMode({ t }) {
  const [s, setS] = useState({
    proStatus: 'disconnected',
    proSubscription: null,
    proHasBinary: false,
    proError: null,
    proBusy: false,
    proDownloading: false,
  });
  const [urlInput, setUrlInput] = useState('');
  const [urlInputErr, setUrlInputErr] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const unsub = proManager.onChange(setS);
    proManager.init();
    return unsub;
  }, []);

  const isConnected = s.proStatus === 'connected';
  const isBusy = s.proStatus === 'connecting' || s.proStatus === 'disconnecting';
  const noBinary = !s.proHasBinary;
  const hasSubscription = !!s.proSubscription;

  const onConnect = async () => {
    if (isConnected) return proManager.disconnect();
    if (!hasSubscription && !urlInput.trim()) return;
    const url = urlInput.trim() || s.proSubscription;
    const r = await proManager.connect(url);
    if (r?.success) setUrlInput('');
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

  return (
    <motion.div {...fadeIn} className="relative w-full">
      {noBinary ? (
        <BinaryGate downloading={s.proDownloading} error={s.proError} onDownload={onDownload} />
      ) : !hasSubscription ? (
        <Onboarding
          urlInput={urlInput}
          setUrlInput={setUrlInput}
          err={urlInputErr}
          setErr={setUrlInputErr}
          onSave={onSaveUrl}
          showAdvanced={showAdvanced}
          setShowAdvanced={setShowAdvanced}
        />
      ) : (
        <Connected
          isConnected={isConnected}
          isBusy={isBusy}
          status={s.proStatus}
          error={s.proError}
          onClick={onConnect}
          onForget={onForget}
          subscription={s.proSubscription}
        />
      )}
    </motion.div>
  );
}

/* ─────────── Binary missing — auto-download from GitHub ─────────── */

function BinaryGate({ downloading, error, onDownload }) {
  return (
    <motion.div {...fadeIn} className="space-y-6 px-2 py-4">
      <div className="text-center space-y-3">
        <Download size={26} strokeWidth={1.2} className="text-white/25 mx-auto" />
        <h3 className="text-[13px] text-white/55 font-medium tracking-wide">Установка движка</h3>
        <p className="text-[11px] text-white/30 leading-relaxed max-w-xs mx-auto">
          Pro-режиму нужен бинарь sing-box (~20 МБ). Загружается один раз с GitHub.
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

/* ─────────── Onboarding — Telegram CTA + manual VLESS ─────────── */

function Onboarding({ urlInput, setUrlInput, err, setErr, onSave, showAdvanced, setShowAdvanced }) {
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

/* ─────────── Connected — minimal power button screen ─────────── */

function Connected({ isConnected, isBusy, status, error, onClick, onForget, subscription }) {
  const subHost = (() => {
    try { return new URL(subscription).hostname; } catch { return 'unknown'; }
  })();
  const statusLabel = isConnected ? 'Protected' : isBusy
    ? (status === 'connecting' ? 'Connecting' : 'Stopping')
    : 'Disconnected';

  return (
    <motion.div {...fadeIn} className="space-y-6">
      {/* status dot */}
      <div className="flex items-center justify-center gap-2.5">
        <span className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-white/60 flicker' : isBusy ? 'bg-white/20 animate-pulse' : 'bg-white/10'
        }`} />
        <span className="text-[11px] tracking-[0.25em] uppercase text-white/30 font-gothic">
          {statusLabel}
        </span>
      </div>

      {/* power button — same style as FREE for consistency */}
      <div className="relative flex items-center justify-center my-2">
        <AnimatePresence>
          {isConnected && [0, 0.8, 1.6].map((d, i) => (
            <motion.div
              key={i}
              className="absolute w-44 h-44 rounded-full border border-white/[0.04]"
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: [0.85, 1.8], opacity: [0.3, 0] }}
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
            border border-white/[0.05] disabled:opacity-40 disabled:cursor-wait"
          style={{ background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(20px)' }}
        >
          {isBusy ? (
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}>
              <Loader size={30} strokeWidth={1.2} className={isConnected ? 'text-white/55' : 'text-white/25'} />
            </motion.div>
          ) : (
            <Power size={30} strokeWidth={1.2} className={isConnected ? 'text-white/55' : 'text-white/30'} />
          )}
          <span className="text-[9px] font-medium tracking-[0.3em] uppercase"
            style={{ color: isConnected ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.3)' }}>
            {isConnected ? 'Disconnect' : 'Connect'}
          </span>
        </motion.button>
      </div>

      {/* subscription row */}
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] px-3.5 py-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield size={12} strokeWidth={1.5} className="text-white/30" />
            <span className="text-[10px] tracking-[0.18em] uppercase text-white/30">Подписка</span>
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
          <Globe size={11} strokeWidth={1.5} className="text-white/18" />
          <span className="text-[11px] text-white/40 font-mono truncate">{subHost}</span>
        </div>
      </div>

      {/* tip */}
      {!isConnected && !isBusy && (
        <p className="text-white/10 text-[11px] text-center tracking-wider">
          Жми кнопку — Phantom направит трафик через VLESS-канал
        </p>
      )}

      {/* badges */}
      {isConnected && (
        <div className="flex justify-center gap-2 flex-wrap">
          <Badge label="VLESS" />
          <Badge label="Cloudflare" />
          <Badge label="TLS" />
        </div>
      )}

      {/* upgrade link — subtle, only shown when not connected */}
      {!isConnected && !isBusy && (
        <a
          href={`https://t.me/${BOT_USERNAME}`}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-center text-[10px] text-white/22 hover:text-white/50 tracking-[0.18em] uppercase transition-colors py-2"
        >
          Управлять подпиской в Telegram →
        </a>
      )}

      {error && <ErrorRow text={error} />}
    </motion.div>
  );
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
