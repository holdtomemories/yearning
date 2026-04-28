import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useState, useEffect, useRef, useCallback } from "react";

/* ─── App version & changelog ───────────────────────────────────────────── */
/* Bump APP_VERSION whenever you ship a meaningful change. Add an entry to
   CHANGELOG. Users see the "what's new" panel ONCE per new version they
   haven't acknowledged yet. Memories are migrated and preserved across every
   version bump — see migratePins() below. */
const APP_VERSION = "1.2.0";
const CHANGELOG = [
  {
    version: "1.2.0",
    date: "April 2026",
    title: "Updates that remember you",
    notes: [
      "Your memories now survive every app update — automatically and safely.",
      "Higher contrast on light & dark maps so every word is easy to read.",
      "Fixed pinch-to-zoom on mobile — it no longer opens the plant modal by accident.",
      "Location reminders nudge you when you're within 5km of a memory, or somewhere new.",
      "Added export and import, back up your memories or move them between devices.",
      "First-time users now get a gentle prompt to plant their first thought.",
      "Better support for iPhone and Android home-screen install (PWA).",
    ],
  },
  {
    version: "1.1.0",
    date: "March 2026",
    title: "Quieter, kinder onboarding",
    notes: [
      "Welcome tour walks you through every tool the first time.",
      "Help center now lives permanently in the i button.",
    ],
  },
  {
    version: "1.0.0",
    date: "February 2026",
    title: "Yearning begins",
    notes: ["Plant your first memory anywhere on earth."],
  },
];

/* ─── Constants ─────────────────────────────────────────────────────────── */
const STORAGE_KEY     = "yearning_pins_v3";
const ONBOARDED_KEY   = "yearning_onboarded_v3";
const NOTIF_LOCS_KEY  = "yearning_notified_locs_v1";
const VERSION_KEY     = "yearning_last_seen_version";
const SCHEMA_KEY      = "yearning_schema_version";
const BACKUP_KEY      = "yearning_pins_backups";
const KOFI_URL        = "https://ko-fi.com/donatetoyearning";
const DEFAULT_CENTER  = [20, 0];
const DEFAULT_ZOOM    = 2;
const TILE_ATTR       = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const TILE_DARK       = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT      = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const NEARBY_RADIUS_KM   = 5;
const NOTIF_COOLDOWN_KM  = 1.0;
const NOTIF_COOLDOWN_MS  = 30 * 60 * 1000;
const CURRENT_SCHEMA     = 2;
const MAX_BACKUPS        = 3;

const MOODS_DARK = [
  { key: "wonder",    label: "Wonder",    color: "#a855f7" },
  { key: "peace",     label: "Peace",     color: "#06b6d4" },
  { key: "longing",   label: "Longing",   color: "#f97316" },
  { key: "joy",       label: "Joy",       color: "#22c55e" },
  { key: "ache",      label: "Ache",      color: "#ef4444" },
  { key: "gratitude", label: "Gratitude", color: "#f59e0b" },
  { key: "other",     label: "Other",     color: "#9ca3af" },
];

const MOODS_LIGHT = [
  { key: "wonder",    label: "Wonder",    color: "#6d28d9" },
  { key: "peace",     label: "Peace",     color: "#0e7490" },
  { key: "longing",   label: "Longing",   color: "#9a3412" },
  { key: "joy",       label: "Joy",       color: "#15803d" },
  { key: "ache",      label: "Ache",      color: "#b91c1c" },
  { key: "gratitude", label: "Gratitude", color: "#92400e" },
  { key: "other",     label: "Other",     color: "#4b5563" },
];

const TOUR_STEPS = [
  { targetId: "btn-locate",        title: "Locate Me",       desc: "Flies to your GPS position on the map and drops a live pulse marker where you are." },
  { targetId: "btn-plant",         title: "Plant Here ✦",    desc: "Instantly plants a memory pin at your GPS location — or at the map center if location is off." },
  { targetId: "btn-place",         title: "Tap Anywhere +",  desc: "Activates placement mode. Tap any spot on the map or long-press to instantly plant a memory." },
  { targetId: "btn-reset",         title: "Reset View ⌂",    desc: "Returns the map to the default world view — handy when you're lost in a zoom." },
  { targetId: "btn-theme",         title: "Light / Dark ◑",  desc: "Toggle between a moody dark map and a clean light map. Colors adapt automatically." },
  { targetId: "search-container",  title: "Search Places",   desc: "Type any city, country, or address to fly the map there instantly." },
  { targetId: "btn-exportimport",  title: "Export / Import", desc: "Download a backup of all your memories, or restore them on another device." },
  { targetId: "btn-tipjar",        title: "Support ☕",      desc: "Keep Yearning free — buy us a coffee if it brings you joy." },
  { targetId: "btn-help",          title: "Help Center i",   desc: "This button always brings you back here. Your guide lives here permanently." },
];

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const getMoods = (isDark) => (isDark ? MOODS_DARK : MOODS_LIGHT);
const getMoodByKey = (key, isDark = true) => {
  const set = getMoods(isDark);
  return set.find((m) => m.key === key) ?? set[0];
};

/* ─── Migration & persistence ──────────────────────────────────────────── */
function rawLoadPins() {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    if (!txt) return [];
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function rawSavePins(pins) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pins)); } catch {}
}

function getStoredSchemaVersion() {
  try {
    const v = localStorage.getItem(SCHEMA_KEY);
    return v ? parseInt(v, 10) : 1;
  } catch { return 1; }
}

function setStoredSchemaVersion(v) {
  try { localStorage.setItem(SCHEMA_KEY, String(v)); } catch {}
}

function pushBackup(pins) {
  try {
    const existing = JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]");
    existing.unshift({ at: Date.now(), version: APP_VERSION, pins });
    localStorage.setItem(BACKUP_KEY, JSON.stringify(existing.slice(0, MAX_BACKUPS)));
  } catch {}
}

function getBackups() {
  try { return JSON.parse(localStorage.getItem(BACKUP_KEY) || "[]"); } catch { return []; }
}

const MIGRATIONS = {
  // schema 1 → 2: ensure every pin has createdAt, stable id, and mood metadata
  1: (pins) => pins.map((p) => ({
    ...p,
    id: p.id || `legacy-${Math.random().toString(36).slice(2)}-${Date.now()}`,
    createdAt: p.createdAt || (typeof p.id === "string" && /^\d+$/.test(p.id) ? parseInt(p.id, 10) : Date.now()),
    moodLabel: p.moodLabel || (p.mood === "other" ? p.customMood || "Other" : (MOODS_DARK.find((m) => m.key === p.mood)?.label ?? "Wonder")),
    moodColor: p.moodColor || (MOODS_DARK.find((m) => m.key === p.mood)?.color ?? MOODS_DARK[0].color),
  })),
};

function migratePins(rawPins) {
  let pins = Array.isArray(rawPins) ? [...rawPins] : [];
  let from = getStoredSchemaVersion();
  if (from >= CURRENT_SCHEMA) return { pins, migrated: false };
  pushBackup(rawPins);
  try {
    while (from < CURRENT_SCHEMA) {
      const fn = MIGRATIONS[from];
      if (!fn) { from += 1; continue; }
      pins = fn(pins);
      from += 1;
    }
    setStoredSchemaVersion(CURRENT_SCHEMA);
    rawSavePins(pins);
    return { pins, migrated: true };
  } catch (err) {
    console.error("[Yearning] migration failed, restoring backup:", err);
    const backups = getBackups();
    if (backups.length > 0) {
      rawSavePins(backups[0].pins);
      return { pins: backups[0].pins, migrated: false, recovered: true };
    }
    return { pins: rawPins, migrated: false };
  }
}

function loadPinsWithMigration() {
  const raw = rawLoadPins();
  const result = migratePins(raw);
  return result.pins;
}

function loadNotifLocs() {
  try { return JSON.parse(localStorage.getItem(NOTIF_LOCS_KEY)) || []; } catch { return []; }
}
function saveNotifLocs(locs) {
  try { localStorage.setItem(NOTIF_LOCS_KEY, JSON.stringify(locs.slice(-30))); } catch {}
}

function getLastSeenVersion() {
  try { return localStorage.getItem(VERSION_KEY); } catch { return null; }
}
function setLastSeenVersion(v) {
  try { localStorage.setItem(VERSION_KEY, v); } catch {}
}

function compareVersions(a, b) {
  if (!a) return -1;
  if (!b) return 1;
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

function haptic(style = "light") {
  try {
    if (navigator.vibrate) {
      if (style === "heavy")        navigator.vibrate([30, 10, 30, 10, 30]);
      else if (style === "success") navigator.vibrate([15, 40, 15]);
      else if (style === "medium")  navigator.vibrate(20);
      else                          navigator.vibrate(8);
    }
  } catch {}
}

let _sharedAudioCtx = null;
function getAudioCtx() {
  try {
    if (!_sharedAudioCtx) _sharedAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_sharedAudioCtx.state === "suspended") _sharedAudioCtx.resume();
    return _sharedAudioCtx;
  } catch { return null; }
}

function playSound(type = "plant") {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    if (type === "plant") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.18);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } else if (type === "forget") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.35);
      gain.gain.setValueAtTime(0.14, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } else if (type === "chime") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(660, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(990, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.10, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    }
  } catch {}
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 768;
}

async function requestNotificationPermission() {
  try {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    const result = await Notification.requestPermission();
    return result === "granted";
  } catch { return false; }
}

function showNotification(title, body, onClick) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const n = new Notification(title, {
      body, icon: "/favicon.ico", badge: "/favicon.ico",
      vibrate: [100, 50, 100], tag: "yearning-location", renotify: true, silent: false,
    });
    if (onClick) n.onclick = () => { try { window.focus(); onClick(); } catch {} };
    return true;
  } catch { return false; }
}

/* ─── Service worker registration (if /sw.js is hosted) ────────────────── */
function registerServiceWorker(onUpdateAvailable) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;

  navigator.serviceWorker.getRegistration().then((existing) => {
    const handle = (reg) => {
      if (!reg) return;
      if (reg.waiting) onUpdateAvailable?.(reg);
      reg.addEventListener("updatefound", () => {
        const installing = reg.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            onUpdateAvailable?.(reg);
          }
        });
      });
      reg.update().catch(() => {});
    };
    if (existing) handle(existing);
    else navigator.serviceWorker.register("/sw.js").then(handle).catch(() => {});
  }).catch(() => {});

  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}

/* ─── CSS ───────────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root {
    width: 100%; height: 100%;
    overflow: hidden; background: #0a0a0f;
    -webkit-text-size-adjust: 100%; text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
  }
  body { overscroll-behavior: none; -webkit-overflow-scrolling: touch; }
  html { overscroll-behavior-y: contain; }

  .leaflet-container {
    background: #0a0a0f !important;
    touch-action: pan-x pan-y pinch-zoom !important;
    font-family: 'Lora', serif !important;
  }
  body.theme-light .leaflet-container { background: #f5f3ee !important; }

  .leaflet-control-zoom { border: none !important; box-shadow: none !important; margin: 0 !important; }
  .leaflet-left .leaflet-control-zoom { margin-left: 14px !important; }
  .leaflet-control-zoom a {
    background: rgba(11,10,17,0.92) !important;
    color: rgba(232,228,217,0.9) !important;
    border: 1px solid rgba(255,255,255,0.16) !important;
    width: 44px !important; height: 44px !important; line-height: 44px !important;
    font-size: 20px !important;
    display: flex !important; align-items: center !important; justify-content: center !important;
    backdrop-filter: blur(10px) !important; -webkit-backdrop-filter: blur(10px) !important;
    transition: all 0.15s !important;
    border-radius: 6px !important; margin-bottom: 6px !important;
  }
  .leaflet-control-zoom-in { border-radius: 6px !important; }
  .leaflet-control-zoom-out { border-radius: 6px !important; margin-bottom: 0 !important; }
  .leaflet-control-zoom a:hover { background: rgba(30,28,45,0.95) !important; color: #ffffff !important; }
  .leaflet-control-attribution {
    background: rgba(10,10,15,0.7) !important;
    color: rgba(255,255,255,0.35) !important;
    font-size: 9px !important; padding: 2px 6px !important;
  }
  .leaflet-control-attribution a { color: rgba(255,255,255,0.5) !important; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip-container { display: none !important; }

  body.theme-light .leaflet-control-zoom a {
    background: rgba(252,250,247,0.96) !important;
    color: #1a1814 !important;
    border-color: rgba(0,0,0,0.18) !important;
  }
  body.theme-light .leaflet-control-zoom a:hover {
    background: rgba(232,228,217,0.98) !important; color: #000 !important;
  }
  body.theme-light .leaflet-control-attribution {
    background: rgba(252,250,247,0.85) !important; color: rgba(26,24,20,0.65) !important;
  }
  body.theme-light .leaflet-control-attribution a { color: rgba(26,24,20,0.85) !important; }

  @keyframes gps-pulse  { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.5);opacity:0} }
  @keyframes fadeUp     { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
  @keyframes toastIn    { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes spin       { to{transform:rotate(360deg)} }
  @keyframes popIn      { 0%{opacity:0;transform:scale(0.95)} 100%{opacity:1;transform:scale(1)} }
  @keyframes slideDown  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulseRing  { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
  @keyframes slideUpIn  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }

  textarea { resize: none; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 2px; }
  body.theme-light ::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.2); }

  .yr-tool-btn {
    width: 48px; height: 48px; border-radius: 8px; cursor: pointer;
    backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; transition: all 0.18s; border: 1px solid;
    -webkit-tap-highlight-color: transparent; user-select: none; flex-shrink: 0;
    -webkit-user-select: none;
  }
  .yr-tool-btn:active { transform: scale(0.90); }

  .yr-mood-chip {
    padding: 8px 16px; border-radius: 20px; cursor: pointer; border: 1.5px solid;
    font-family: 'Lora', serif; font-size: 13px; letter-spacing: 0.1em;
    transition: all 0.15s; white-space: nowrap; -webkit-tap-highlight-color: transparent;
    min-height: 38px; display: inline-flex; align-items: center; font-weight: 500;
  }

  .yr-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.66); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease; z-index: 200; padding: 16px; overflow-y: auto;
  }
  .yr-modal { animation: fadeUp 0.28s ease forwards; }

  .yr-spotlight {
    position: fixed; border-radius: 50%;
    border: 2px solid rgba(192,132,252,0.85);
    pointer-events: none; z-index: 1001;
    animation: pulseRing 1.5s ease-out infinite;
  }
  .yr-tour-tip {
    position: fixed;
    background: rgba(11,10,17,0.97);
    border: 1px solid rgba(192,132,252,0.4);
    border-top: 2px solid rgba(192,132,252,0.85);
    border-radius: 0 0 8px 8px;
    padding: 14px 16px 12px; width: 240px;
    z-index: 1002; animation: slideDown 0.25s ease;
    box-shadow: 0 12px 40px rgba(0,0,0,0.65);
  }

  .yr-search-input {
    width: 100%; background: rgba(11,10,17,0.94);
    border: 1px solid rgba(255,255,255,0.18); border-radius: 6px;
    padding: 11px 36px 11px 14px;
    color: #ffffff; font-family: 'Lora', serif; letter-spacing: 0.06em;
    outline: none; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
    transition: border-color 0.2s; font-size: 16px;
  }
  .yr-search-input::placeholder { color: rgba(232,228,217,0.55); font-style: italic; }
  .yr-search-input:focus { border-color: rgba(192,132,252,0.65); }

  .yr-search-result {
    padding: 12px 14px; cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    font-family: 'Lora', serif; font-size: 13.5px;
    color: rgba(232,228,217,0.92); letter-spacing: 0.04em; transition: background 0.12s;
    min-height: 44px; display: flex; align-items: center;
  }
  .yr-search-result:hover, .yr-search-result:active { background: rgba(192,132,252,0.14); color: #c084fc; }
  .yr-search-result:last-child { border-bottom: none; }

  body.theme-light .yr-search-input { background: rgba(252,250,247,0.97); color: #0a0908; border-color: rgba(0,0,0,0.2); }
  body.theme-light .yr-search-input::placeholder { color: rgba(26,24,20,0.55); }
  body.theme-light .yr-search-input:focus { border-color: rgba(109,40,217,0.65); }
  body.theme-light .yr-search-result { background: rgba(252,250,247,0.98); color: #0a0908; border-bottom-color: rgba(0,0,0,0.08); }
  body.theme-light .yr-search-result:hover { background: rgba(109,40,217,0.1); color: #6d28d9; }

  .yr-found-popup {
    position: absolute; pointer-events: none;
    background: rgba(11,10,17,0.97);
    border: 1px solid rgba(8,145,178,0.55); border-radius: 6px;
    padding: 7px 13px; white-space: nowrap;
    font-family: 'Lora', serif; font-size: 12px;
    color: #22d3ee; letter-spacing: 0.14em; font-style: italic;
    animation: fadeUp 0.3s ease; z-index: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    transform: translate(-50%, calc(-100% - 20px)); font-weight: 600;
  }
  .yr-found-popup::after {
    content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 6px solid transparent; border-right: 6px solid transparent;
    border-top: 6px solid rgba(8,145,178,0.55);
  }

  .yr-pin-card { position: fixed; z-index: 300; animation: popIn 0.25s ease; }

  @media screen and (max-width: 768px) {
    .yr-tool-btn { width: 46px; height: 46px; font-size: 17px; border-radius: 10px; }
    .leaflet-control-zoom a { width: 46px !important; height: 46px !important; line-height: 46px !important; font-size: 22px !important; border-radius: 10px !important; }
    .leaflet-left .leaflet-control-zoom { margin-left: 10px !important; }
    .yr-mood-chip { padding: 9px 16px; font-size: 13.5px; min-height: 40px; }
  }
  @media screen and (max-width: 380px) {
    .yr-tool-btn { width: 44px; height: 44px; }
    .leaflet-control-zoom a { width: 44px !important; height: 44px !important; line-height: 44px !important; }
  }

  input, textarea { font-size: 16px !important; }
`;

/* ─── Theme tokens ──────────────────────────────────────────────────────── */
function useTheme(isDark) {
  return {
    panelBg:      isDark ? "rgba(11,10,17,0.97)"     : "rgba(253,251,247,0.99)",
    panelBorder:  isDark ? "rgba(255,255,255,0.12)"  : "rgba(0,0,0,0.16)",
    textPrimary:  isDark ? "#ffffff"                 : "#0a0908",
    textSec:      isDark ? "rgba(232,228,217,0.92)"  : "rgba(10,9,8,0.88)",
    textMuted:    isDark ? "rgba(232,228,217,0.62)"  : "rgba(10,9,8,0.62)",
    textFaint:    isDark ? "rgba(232,228,217,0.45)"  : "rgba(10,9,8,0.48)",
    toolBg:       isDark ? "rgba(11,10,17,0.92)"     : "rgba(253,251,247,0.96)",
    toolBorder:   isDark ? "rgba(255,255,255,0.16)"  : "rgba(0,0,0,0.18)",
    toolColor:    isDark ? "rgba(232,228,217,0.92)"  : "#0a0908",
    headerGrad:   isDark
      ? "linear-gradient(to bottom,rgba(10,10,15,0.95) 0%,rgba(10,10,15,0.5) 60%,transparent 100%)"
      : "linear-gradient(to bottom,rgba(253,251,247,0.97) 0%,rgba(253,251,247,0.5) 60%,transparent 100%)",
    legendChipBg:     isDark ? "rgba(11,10,17,0.85)"    : "rgba(253,251,247,0.96)",
    legendChipBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.14)",
    moods:        getMoods(isDark),
    isDark,
  };
}

/* ─── Sub-components ────────────────────────────────────────────────────── */
function Overlay({ zIndex = 200, onClose, children }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  return (
    <div className="yr-overlay" style={{ zIndex }} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      {children}
    </div>
  );
}

function ToolBtn({ id, title, onClick, style, children, className = "" }) {
  return (
    <button id={id} className={`yr-tool-btn ${className}`} title={title} aria-label={title} style={style}
      onClick={() => { haptic("light"); onClick?.(); }}>
      {children}
    </button>
  );
}

function Toast({ msg, isDark }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "fixed", bottom: "max(26px, env(safe-area-inset-bottom, 26px))",
      left: "50%", transform: "translateX(-50%)",
      background: isDark ? "rgba(11,10,17,0.96)" : "rgba(253,251,247,0.98)",
      backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`,
      borderRadius: 6, padding: "10px 22px", zIndex: 600,
      fontFamily: "'Lora',serif", fontSize: 13,
      color: isDark ? "rgba(232,228,217,0.95)" : "#0a0908",
      letterSpacing: "0.14em", fontStyle: "italic",
      whiteSpace: "nowrap", pointerEvents: "none",
      animation: "toastIn 0.25s ease",
      boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.18)",
      maxWidth: "calc(100vw - 40px)", overflow: "hidden", textOverflow: "ellipsis",
    }}>{msg}</div>
  );
}

/* ─── Writing modal ─────────────────────────────────────────────────────── */
function WritingModal({ coords, onSave, onCancel, isDark }) {
  const T = useTheme(isDark);
  const [draft, setDraft] = useState({ title: "", body: "", mood: "wonder", customMood: "" });
  const mood = T.moods.find((m) => m.key === draft.mood) ?? T.moods[0];
  const valid = draft.title.trim() && draft.body.trim() && (draft.mood !== "other" || draft.customMood.trim());

  const handleSave = () => {
    if (!valid) return;
    haptic("success"); playSound("plant");
    const moodLabel = draft.mood === "other" ? draft.customMood.trim() : mood.label;
    onSave({
      id: Date.now().toString(),
      lat: coords.lat, lng: coords.lng,
      title: draft.title.trim(), body: draft.body.trim(),
      mood: draft.mood, customMood: draft.mood === "other" ? draft.customMood.trim() : "",
      moodLabel, moodColor: mood.color,
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
      createdAt: Date.now(),
      appVersion: APP_VERSION,
    });
  };

  return (
    <Overlay zIndex={200} onClose={onCancel}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${mood.color}40`, borderTop: `2px solid ${mood.color}`,
        borderRadius: "0 0 8px 8px", padding: "26px 26px 22px",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.02em", marginBottom: 4 }}>
          plant a thought here
        </div>
        {coords && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.14em", marginBottom: 20, fontWeight: 500 }}>
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </div>
        )}
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>mood</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: draft.mood === "other" ? 10 : 18 }}>
          {T.moods.map((m) => (
            <button key={m.key} className="yr-mood-chip"
              onClick={() => { haptic("light"); setDraft((d) => ({ ...d, mood: m.key })); }}
              style={{
                background:  draft.mood === m.key ? `${m.color}22` : "transparent",
                borderColor: draft.mood === m.key ? m.color : T.panelBorder,
                color:       draft.mood === m.key ? m.color : T.textSec,
                fontWeight:  draft.mood === m.key ? 700 : 500,
                boxShadow:   draft.mood === m.key ? `0 0 12px ${m.color}50` : "none",
              }}
            >{m.label}</button>
          ))}
        </div>
        {draft.mood === "other" && (
          <input autoFocus placeholder="how are you feeling?" value={draft.customMood}
            onChange={(e) => setDraft((d) => ({ ...d, customMood: e.target.value }))}
            style={{
              width: "100%", background: "transparent", border: "none",
              borderBottom: `1px solid ${T.moods[6].color}88`,
              padding: "9px 0", marginBottom: 14,
              color: T.textPrimary, fontFamily: "'Lora',serif",
              fontStyle: "italic", outline: "none", letterSpacing: "0.06em",
            }}
          />
        )}
        <input autoFocus={draft.mood !== "other"} placeholder="Give this moment a name…" value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          style={{
            width: "100%", background: "transparent", border: "none",
            borderBottom: `1px solid ${draft.title ? mood.color : T.panelBorder}`,
            padding: "10px 0", marginBottom: 15,
            color: T.textPrimary, fontFamily: "'Playfair Display',serif",
            outline: "none", letterSpacing: "0.04em",
          }}
        />
        <textarea rows={5} placeholder="What do you want to remember about this place?" value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          style={{
            width: "100%",
            background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
            border: `1px solid ${T.panelBorder}`, borderRadius: 6,
            padding: 12, marginBottom: 20,
            color: T.textPrimary, fontFamily: "'Lora',serif",
            lineHeight: 1.85, fontStyle: "italic",
            outline: "none", letterSpacing: "0.02em",
          }}
        />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => { haptic("light"); onCancel(); }}
            style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "10px 20px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.1em", minHeight: 44, fontWeight: 500 }}
          >discard</button>
          <button onClick={handleSave} disabled={!valid}
            style={{
              background: valid ? `${mood.color}28` : "transparent",
              border: `1px solid ${valid ? mood.color : T.panelBorder}`,
              color: valid ? mood.color : T.textFaint,
              padding: "10px 24px", borderRadius: 6,
              cursor: valid ? "pointer" : "not-allowed",
              fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.12em",
              minHeight: 44, fontWeight: 700,
            }}
          >plant it ✦</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Forget modal ──────────────────────────────────────────────────────── */
function ForgetModal({ pin, onConfirm, onCancel, isDark }) {
  const T = useTheme(isDark);
  const moodColor = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const moodLabel = pin.moodLabel || getMoodByKey(pin.mood, isDark).label;

  const handleConfirm = () => { haptic("heavy"); playSound("forget"); onConfirm(); };

  return (
    <Overlay zIndex={500} onClose={onCancel}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 400, maxWidth: "100%",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(220,38,38,0.22)", borderTop: "2px solid rgba(220,38,38,0.6)",
        borderRadius: "0 0 8px 8px", padding: "30px 28px 26px", textAlign: "center",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <div style={{ fontSize: 32, marginBottom: 16, color: moodColor, filter: `drop-shadow(0 0 12px ${moodColor}66)`, opacity: 0.7 }}>◈</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: isDark ? "rgba(252,165,165,0.9)" : "#b91c1c", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>let go of this memory?</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.02em", marginBottom: 5, lineHeight: 1.35 }}>{pin.title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: moodColor, letterSpacing: "0.18em", marginBottom: 20, fontWeight: 600 }}>{moodLabel} · {pin.date}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.85, fontStyle: "italic", marginBottom: 20 }}>
          Once forgotten, this memory will be gone<br />from this earth — quietly and permanently.
          <br /><span style={{ color: T.textMuted, fontSize: 12.5 }}>There is no way to bring it back.</span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(220,38,38,0.09)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, padding: "8px 16px", marginBottom: 24 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: isDark ? "rgba(252,165,165,0.85)" : "#b91c1c", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: isDark ? "rgba(252,165,165,0.95)" : "#b91c1c", letterSpacing: "0.16em", fontWeight: 600 }}>this cannot be undone</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => { haptic("light"); onCancel(); }} style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", minHeight: 44, fontWeight: 500 }}>keep it</button>
          <button onClick={handleConfirm} style={{ background: "rgba(220,38,38,0.14)", border: "1px solid rgba(220,38,38,0.5)", color: isDark ? "rgba(252,165,165,1)" : "#b91c1c", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", minHeight: 44, fontWeight: 700 }}>let it go</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Export / Import modal ─────────────────────────────────────────────── */
function ExportImportModal({ pins, onImport, onClose, isDark }) {
  const T = useTheme(isDark);
  const [tab, setTab] = useState("export");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const fileRef = useRef(null);

  const handleExport = () => {
    haptic("medium");
    const data = JSON.stringify({ app: "yearning", version: APP_VERSION, exported: new Date().toISOString(), count: pins.length, pins }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `yearning-memories-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target.result;
      setImportText(text);
      try {
        const parsed = JSON.parse(text);
        const arr = parsed.pins ?? parsed;
        if (!Array.isArray(arr)) throw new Error("Invalid format");
        setPendingCount(arr.length); setImportError("");
      } catch {
        setImportError("Invalid file. Please use a Yearning export file."); setPendingCount(0);
      }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = () => {
    try {
      const parsed = JSON.parse(importText);
      const importedPins = parsed.pins ?? parsed;
      if (!Array.isArray(importedPins)) throw new Error("Invalid format");
      importedPins.forEach((p) => { if (typeof p.lat !== "number" || typeof p.lng !== "number") throw new Error("Invalid pin data"); });
      haptic("success"); playSound("plant");
      onImport(importedPins);
      setImportSuccess(true);
      setTimeout(() => { setImportSuccess(false); onClose(); }, 1500);
    } catch {
      setImportError("Invalid file. Please use a Yearning export file.");
    }
  };

  const accent = isDark ? "#a855f7" : "#6d28d9";

  return (
    <Overlay zIndex={300} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 440, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${accent}33`, borderTop: `2px solid ${accent}`,
        borderRadius: "0 0 8px 8px", padding: "28px 26px 24px",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
        position: "relative",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 10, fontWeight: 600 }}>memories</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: T.textPrimary, marginBottom: 20, fontWeight: 500 }}>export &amp; import</div>

        <div style={{ display: "flex", gap: 0, marginBottom: 20, border: `1px solid ${T.panelBorder}`, borderRadius: 6, overflow: "hidden" }}>
          {["export", "import"].map((t) => (
            <button key={t} onClick={() => { haptic("light"); setTab(t); setImportError(""); }} style={{
              flex: 1, padding: "11px 0", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", transition: "all 0.18s", border: "none",
              background: tab === t ? `${accent}22` : "transparent",
              color: tab === t ? accent : T.textSec,
              fontWeight: tab === t ? 700 : 500,
              borderBottom: tab === t ? `2px solid ${accent}` : "2px solid transparent",
            }}>{t}</button>
          ))}
        </div>

        <div style={{
          background: isDark ? "rgba(34,211,238,0.07)" : "rgba(14,116,144,0.06)",
          border: `1px solid ${isDark ? "rgba(34,211,238,0.22)" : "rgba(14,116,144,0.22)"}`,
          borderLeft: `3px solid ${isDark ? "rgba(34,211,238,0.7)" : "rgba(14,116,144,0.7)"}`,
          borderRadius: "0 6px 6px 0", padding: "10px 14px", marginBottom: 20,
          fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, lineHeight: 1.65, fontStyle: "italic",
        }}>
          Your memories are stored on this device and survive every app update — but exporting a backup is always a good idea.
        </div>

        {tab === "export" ? (
          <div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.8, fontStyle: "italic", marginBottom: 20 }}>
              Download all your memories as a JSON file. You can import this file later to restore your memories, or move them to another device.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 6, padding: "12px 16px", marginBottom: 22 }}>
              <div style={{ fontSize: 24, color: accent }}>◈</div>
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: T.textPrimary, fontWeight: 500 }}>{pins.length} {pins.length === 1 ? "memory" : "memories"}</div>
                <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>ready to export</div>
              </div>
            </div>
            <button onClick={handleExport} disabled={pins.length === 0} style={{
              width: "100%", padding: "13px 0", borderRadius: 6,
              background: pins.length > 0 ? `${accent}22` : "transparent",
              border: `1px solid ${pins.length > 0 ? accent : T.panelBorder}`,
              color: pins.length > 0 ? accent : T.textFaint,
              fontFamily: "'Lora',serif", fontSize: 14, letterSpacing: "0.14em",
              cursor: pins.length > 0 ? "pointer" : "not-allowed", fontWeight: 700, minHeight: 48,
            }}>↓ download memories</button>
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.8, fontStyle: "italic", marginBottom: 18 }}>
              Upload a Yearning export file to restore or merge your memories. Existing memories will be preserved (duplicates skipped).
            </div>
            <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFileImport} style={{ display: "none" }} />
            <button onClick={() => fileRef.current?.click()} style={{
              width: "100%", padding: "13px 0", borderRadius: 6, marginBottom: 12,
              background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
              border: `1px dashed ${T.panelBorder}`,
              color: T.textSec, fontFamily: "'Lora',serif", fontSize: 13.5, letterSpacing: "0.1em",
              cursor: "pointer", minHeight: 48, fontWeight: 500,
            }}>↑ choose file</button>
            {importText && !importError && !importSuccess && pendingCount > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", marginBottom: 10 }}>
                  Found <strong style={{ color: accent, fontStyle: "normal" }}>{pendingCount}</strong> {pendingCount === 1 ? "memory" : "memories"} ready to import.
                </div>
                <button onClick={handleImportConfirm} style={{
                  width: "100%", padding: "13px 0", borderRadius: 6,
                  background: `${accent}22`, border: `1px solid ${accent}`,
                  color: accent, fontFamily: "'Lora',serif", fontSize: 14, letterSpacing: "0.14em",
                  cursor: "pointer", fontWeight: 700, minHeight: 48,
                }}>✦ import memories</button>
              </div>
            )}
            {importError && (
              <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: isDark ? "rgba(252,165,165,0.95)" : "#b91c1c", fontStyle: "italic", marginTop: 8, fontWeight: 500 }}>{importError}</div>
            )}
            {importSuccess && (
              <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: isDark ? "#86efac" : "#15803d", fontStyle: "italic", marginTop: 8, fontWeight: 600 }}>✓ memories imported successfully</div>
            )}
          </div>
        )}
      </div>
    </Overlay>
  );
}

/* ─── Tip Jar ───────────────────────────────────────────────────────────── */
function TipJarModal({ onClose, isDark }) {
  const T = useTheme(isDark);
  const goldText = isDark ? "rgba(251,191,36,0.95)" : "#92400e";
  const goldBorder = isDark ? "rgba(251,191,36,0.45)" : "rgba(146,64,14,0.45)";
  const goldBg = isDark ? "rgba(180,83,9,0.12)" : "rgba(180,83,9,0.08)";

  return (
    <Overlay zIndex={300} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 360, maxWidth: "100%", textAlign: "center",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${goldBorder}`, borderTop: `2px solid ${goldBorder}`,
        borderRadius: "0 0 8px 8px", padding: "30px 28px 26px", position: "relative",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        <div style={{ fontSize: 36, marginBottom: 14, filter: "drop-shadow(0 0 12px rgba(253,230,138,0.5))" }}>☕</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.03em", marginBottom: 10 }}>help yearning keep memories</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.85, fontStyle: "italic", marginBottom: 22 }}>
          We built yearning to help you hold onto the moments that matter most. And we want to keep it free, always.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {[{ l: "☕ $3", s: "a coffee" }, { l: "☕☕ $6", s: "two coffees" }, { l: "✦ $12", s: "you're amazing" }].map((t) => (
            <a key={t.l} href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
              flex: 1, textDecoration: "none",
              background: goldBg, border: `1px solid ${goldBorder}`,
              borderRadius: 6, padding: "11px 6px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 56,
            }}>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: goldText, letterSpacing: "0.06em", fontWeight: 700 }}>{t.l}</div>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: goldText, opacity: 0.75, letterSpacing: "0.14em", fontStyle: "italic" }}>{t.s}</div>
            </a>
          ))}
        </div>
        <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textDecoration: "none",
          background: goldBg, border: `1px solid ${goldBorder}`,
          borderRadius: 6, padding: 12,
          fontFamily: "'Lora',serif", fontSize: 13.5, color: goldText,
          letterSpacing: "0.14em", fontWeight: 700,
        }}>support yearning on ko-fi →</a>
        <div style={{ marginTop: 14, fontFamily: "'Lora',serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.12em", fontStyle: "italic" }}>
          no account needed · opens in a new tab
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Help modal ────────────────────────────────────────────────────────── */
function HelpModal({ onClose, isDark, onEnableNotifications, notifPermission, onShowChangelog, pinCount }) {
  const T = useTheme(isDark);
  const cyan = isDark ? "#22d3ee" : "#0e7490";
  const purple = isDark ? "#c084fc" : "#6d28d9";
  const green = isDark ? "#86efac" : "#15803d";
  const gold = isDark ? "rgba(251,191,36,0.95)" : "#92400e";

  const tools = [
    { icon: "◎", col: cyan,    label: "Locate Me",      desc: "Flies to your GPS position and shows a live pulse marker." },
    { icon: "✦", col: purple,  label: "Plant Here",     desc: "Plants a pin at your GPS location, or at the map center if unavailable." },
    { icon: "+", col: T.textPrimary, label: "Tap Anywhere",   desc: "Enter placing mode — tap any spot, or long-press for an instant plant." },
    { icon: "⌂", col: T.textSec,     label: "Reset View",     desc: "Flies back to the world view at default zoom." },
    { icon: "↝", col: T.textSec,     label: "Random Memory",  desc: "Jumps to a random memory you've planted." },
    { icon: "◑", col: gold,    label: "Light / Dark",   desc: "Toggle between dark and light map themes." },
    { icon: "⬇", col: T.textSec,     label: "Export / Import",desc: "Back up your memories to a file, or restore from a previous export." },
    { icon: "☕", col: gold,    label: "Support",        desc: "Keep Yearning free with a small tip." },
    { icon: "i", col: cyan,    label: "Help Center",    desc: "This panel — your guide lives here permanently.", italic: true },
  ];
  const Tag = ({ c, children }) => (
    <span style={{
      background: c === "cyan" ? (isDark ? "rgba(8,145,178,0.18)" : "rgba(8,145,178,0.12)") : (isDark ? "rgba(22,163,74,0.16)" : "rgba(22,163,74,0.1)"),
      color: c === "cyan" ? cyan : green,
      padding: "2px 8px", borderRadius: 4, fontSize: 11.5,
      fontStyle: "normal", fontFamily: "'Lora',serif", letterSpacing: "0.04em", fontWeight: 600,
    }}>{children}</span>
  );

  return (
    <Overlay zIndex={300} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 460, maxWidth: "100%",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${cyan}33`, borderTop: `2px solid ${cyan}`,
        borderRadius: "0 0 8px 8px", padding: "30px 28px 26px", position: "relative",
        maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>help center</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 500, color: T.textPrimary, marginBottom: 22 }}>how to use yearning</div>

        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>your tools</div>
        {tools.map(({ icon, col, label, desc, italic }) => (
          <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 6, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
              border: `1px solid ${T.panelBorder}`,
              color: col, fontSize: italic ? 16 : 15, fontWeight: 600,
              fontFamily: italic ? "'Lora',serif" : "inherit",
              fontStyle: italic ? "italic" : "normal",
            }}>{icon}</div>
            <div style={{ paddingTop: 2 }}>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textPrimary, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>{label}</div>
              <div style={{ fontFamily: "'Lora',serif", fontStyle: "italic", fontSize: 13.5, color: T.textSec, lineHeight: 1.7 }}>{desc}</div>
            </div>
          </div>
        ))}

        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "16px 0 14px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 11, fontWeight: 600 }}>moods</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          {T.moods.map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, boxShadow: `0 0 6px ${m.color}88` }} />
              <span style={{ fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textPrimary, fontWeight: 600 }}>{m.label}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "20px 0 14px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>location reminders</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", marginBottom: 12, lineHeight: 1.7 }}>
          When enabled, yearning quietly reminds you when you arrive somewhere new — within {NEARBY_RADIUS_KM}km of where you've been before, or in a place you haven't planted yet.
        </div>
        <button
          onClick={onEnableNotifications}
          disabled={notifPermission === "granted" || notifPermission === "denied"}
          style={{
            width: "100%", padding: "11px 0", borderRadius: 6, marginBottom: 14,
            background: notifPermission === "granted" ? (isDark ? "rgba(22,163,74,0.16)" : "rgba(22,163,74,0.1)")
              : notifPermission === "denied" ? "transparent" : `${cyan}22`,
            border: `1px solid ${notifPermission === "granted" ? (isDark ? "rgba(134,239,172,0.5)" : "rgba(22,163,74,0.5)")
              : notifPermission === "denied" ? T.panelBorder : cyan}`,
            color: notifPermission === "granted" ? green : notifPermission === "denied" ? T.textFaint : cyan,
            fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", fontWeight: 700,
            cursor: notifPermission === "default" ? "pointer" : "default", minHeight: 44,
          }}
        >
          {notifPermission === "granted" ? "✓ notifications enabled" :
           notifPermission === "denied"  ? "notifications blocked in browser" :
           "✦ enable location reminders"}
        </button>

        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "6px 0 16px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>add to homescreen</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", marginBottom: 14, lineHeight: 1.65 }}>Keep yearning just a tap away — it works like a native app.</div>
        {[
          { bg: isDark ? "rgba(34,211,238," : "rgba(14,116,144,", label: "iPhone · Safari", col: "cyan", steps: ["Tap the", "Share", "button at the bottom", "Scroll and tap", "Add to Home Screen", "", "Tap", "Add", "in the top right corner"] },
          { bg: isDark ? "rgba(134,239,172," : "rgba(22,163,74,", label: "Android · Chrome", col: "green", steps: ["Tap the", "⋮", "menu in the top right", "Tap", "Add to Home screen", "", "Tap", "Add", "to confirm"] },
        ].map(({ bg, label, col, steps }) => (
          <div key={label} style={{ background: `${bg}0.07)`, border: `1px solid ${bg}0.25)`, borderLeft: `3px solid ${bg}0.65)`, borderRadius: "0 6px 6px 0", padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: `${bg}0.95)`, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 9, fontWeight: 700 }}>{label}</div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, lineHeight: 1.7, fontStyle: "italic", marginBottom: i < 2 ? 5 : 0 }}>
                {i + 1}. {steps[i * 3]} <Tag c={col}>{steps[i * 3 + 1]}</Tag> {steps[i * 3 + 2]}
              </div>
            ))}
          </div>
        ))}

        <div style={{
          marginTop: 12,
          background: isDark ? "rgba(168,85,247,0.08)" : "rgba(109,40,217,0.06)",
          border: `1px solid ${isDark ? "rgba(168,85,247,0.25)" : "rgba(109,40,217,0.2)"}`,
          borderLeft: `3px solid ${isDark ? "rgba(168,85,247,0.7)" : "rgba(109,40,217,0.55)"}`,
          borderRadius: "0 6px 6px 0", padding: "12px 14px",
          fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textSec, lineHeight: 1.7, fontStyle: "italic",
        }}>
          <strong style={{ color: T.textPrimary, fontWeight: 700, fontStyle: "normal" }}>Your memories are safe across updates.</strong>{" "}
          {pinCount > 0 ? `All ${pinCount} of your memories will persist` : "All your memories will persist"} every time yearning updates — no resets, no logins, ever.
        </div>

        <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.panelBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button onClick={onShowChangelog} style={{
            background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec,
            padding: "8px 14px", borderRadius: 5, cursor: "pointer",
            fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", fontWeight: 600, minHeight: 36,
          }}>what's new</button>
          <span style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.18em", fontWeight: 500 }}>
            yearning v{APP_VERSION}
          </span>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── What's New modal ──────────────────────────────────────────────────── */
function WhatsNewModal({ entries, isFirstAcknowledgement, onClose, isDark, pinCount }) {
  const T = useTheme(isDark);
  const purple = isDark ? "#a855f7" : "#6d28d9";

  return (
    <Overlay zIndex={350} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${purple}33`, borderTop: `2px solid ${purple}`,
        borderRadius: "0 0 8px 8px", padding: "30px 28px 26px", position: "relative",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
        animation: "slideUpIn 0.4s ease",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>

        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: purple, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>
          {isFirstAcknowledgement ? "yearning · updated" : "what's new"}
        </div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 500, color: T.textPrimary, marginBottom: 6, lineHeight: 1.2 }}>
          {entries[0]?.title || `Version ${APP_VERSION}`}
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textMuted, letterSpacing: "0.1em", marginBottom: 20, fontStyle: "italic", fontWeight: 500 }}>
          v{entries[0]?.version || APP_VERSION} {entries[0]?.date ? `· ${entries[0].date}` : ""}
        </div>

        {isFirstAcknowledgement && pinCount > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            background: isDark ? "rgba(34,211,238,0.08)" : "rgba(14,116,144,0.07)",
            border: `1px solid ${isDark ? "rgba(34,211,238,0.3)" : "rgba(14,116,144,0.3)"}`,
            borderLeft: `3px solid ${isDark ? "rgba(34,211,238,0.8)" : "rgba(14,116,144,0.75)"}`,
            borderRadius: "0 6px 6px 0", padding: "12px 14px", marginBottom: 18,
          }}>
            <div style={{ fontSize: 16, color: isDark ? "#22d3ee" : "#0e7490", marginTop: 1, flexShrink: 0 }}>◉</div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, lineHeight: 1.7 }}>
              <strong style={{ color: T.textPrimary, fontWeight: 700 }}>All {pinCount} {pinCount === 1 ? "memory is" : "memories are"} safe.</strong>{" "}
              <span style={{ fontStyle: "italic" }}>Your data stayed exactly where you left it — yearning updates never erase your memories.</span>
            </div>
          </div>
        )}

        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>
          {entries.length > 1 ? "what changed since you were last here" : "what's new"}
        </div>

        {entries.slice(0, 3).map((entry, idx) => (
          <div key={entry.version} style={{ marginBottom: idx < entries.length - 1 ? 18 : 6 }}>
            {entries.length > 1 && (
              <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: purple, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>
                v{entry.version} {entry.date && <span style={{ color: T.textMuted, fontWeight: 500 }}>· {entry.date}</span>}
              </div>
            )}
            {entry.notes.map((note, i) => (
              <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
                <div style={{ width: 4, height: 4, borderRadius: "50%", background: purple, marginTop: 8, flexShrink: 0, opacity: 0.85 }} />
                <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: T.textSec, lineHeight: 1.7, fontStyle: "italic" }}>{note}</div>
              </div>
            ))}
          </div>
        ))}

        <div style={{ marginTop: 22, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
          <span style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.16em", marginRight: "auto", fontWeight: 500 }}>v{APP_VERSION}</span>
          <button onClick={() => { haptic("medium"); onClose(); }} style={{
            background: `${purple}28`, border: `1px solid ${purple}`,
            color: purple, padding: "10px 22px", borderRadius: 6, cursor: "pointer",
            fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", minHeight: 44, fontWeight: 700,
          }}>continue ✦</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Update-available banner ───────────────────────────────────────────── */
function UpdateBanner({ isDark, onApply, onDismiss }) {
  const T = useTheme(isDark);
  const cyan = isDark ? "#22d3ee" : "#0e7490";
  return (
    <div style={{
      position: "fixed", top: "max(72px, calc(env(safe-area-inset-top, 0px) + 72px))",
      left: "50%", transform: "translateX(-50%)",
      background: T.panelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${cyan}55`, borderLeft: `3px solid ${cyan}`,
      borderRadius: "0 8px 8px 0",
      padding: "12px 16px 12px 14px", zIndex: 130,
      animation: "fadeUp 0.4s ease",
      width: "min(380px, calc(100vw - 28px))",
      boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ fontSize: 18, color: cyan, flexShrink: 0 }}>↻</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: T.textPrimary, fontWeight: 500, marginBottom: 2 }}>
          a new version is ready
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>
          your memories will be kept · just refresh to update
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onDismiss} style={{
          background: "transparent", border: "none", color: T.textMuted,
          fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.1em", cursor: "pointer",
          padding: "8px 6px", minHeight: 36, fontWeight: 500,
        }}>later</button>
        <button onClick={onApply} style={{
          background: `${cyan}22`, border: `1px solid ${cyan}`,
          color: cyan, padding: "8px 14px", borderRadius: 5, cursor: "pointer",
          fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", fontWeight: 700, minHeight: 36,
        }}>refresh</button>
      </div>
    </div>
  );
}

/* ─── Onboarding welcome ────────────────────────────────────────────────── */
function WelcomeModal({ onStartTour, onSkip }) {
  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
      zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.35s ease", padding: 16, overflowY: "auto",
    }}>
      <div className="yr-modal" style={{
        width: 450, maxWidth: "100%",
        background: "rgba(11,10,17,0.98)",
        border: "1px solid rgba(168,85,247,0.25)", borderTop: "2px solid rgba(168,85,247,0.85)",
        borderRadius: "0 0 8px 8px", padding: "38px 32px 30px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: "rgba(232,228,217,0.6)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>welcome</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 500, color: "#ffffff", letterSpacing: "0.03em", lineHeight: 1, marginBottom: 8 }}>Welcome to Yearning</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(232,228,217,0.7)", fontStyle: "italic", letterSpacing: "0.1em", marginBottom: 24 }}>leave a part of yourself somewhere</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14.5, color: "rgba(232,228,217,0.92)", lineHeight: 1.85, fontStyle: "italic" }}>
          A quiet place to plant your thoughts, feelings, and memories exactly where they happened — anywhere on earth.
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, background: "rgba(8,145,178,0.1)", border: "1px solid rgba(8,145,178,0.3)", borderLeft: "3px solid rgba(8,145,178,0.75)", padding: "14px 16px", margin: "24px 0 14px", borderRadius: "0 6px 6px 0" }}>
          <div style={{ fontSize: 16, color: "#22d3ee", marginTop: 1, flexShrink: 0 }}>◉</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(232,228,217,0.92)", lineHeight: 1.8 }}>
            <span style={{ color: "#ffffff", fontStyle: "italic", fontWeight: 600 }}>Your memories never leave your device.</span><br />
            Everything is stored locally — no servers, no accounts, no tracking.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.28)", borderLeft: "3px solid rgba(168,85,247,0.7)", padding: "14px 16px", margin: "0 0 24px", borderRadius: "0 6px 6px 0" }}>
          <div style={{ fontSize: 16, color: "#c084fc", marginTop: 1, flexShrink: 0 }}>↻</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(232,228,217,0.92)", lineHeight: 1.8 }}>
            <span style={{ color: "#ffffff", fontStyle: "italic", fontWeight: 600 }}>Updates won't erase your memories.</span><br />
            Every new version safely keeps everything you've ever planted.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={() => { haptic("light"); onSkip(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.16)", color: "rgba(232,228,217,0.7)", fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.16em", cursor: "pointer", padding: "11px 20px", borderRadius: 6, minHeight: 44, fontWeight: 500 }}>skip tour</button>
          <button onClick={() => { haptic("medium"); onStartTour(); }} style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.7)", color: "rgba(216,180,254,1)", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.2em", padding: "12px 28px", borderRadius: 6, cursor: "pointer", minHeight: 44, fontWeight: 700 }}>show me around →</button>
        </div>
      </div>
    </div>
  );
}

/* ─── First-plant nudge ─────────────────────────────────────────────────── */
function FirstPlantNudge({ isDark, onPlantHere, onPlantWhere, onDismiss, hasLocation }) {
  const T = useTheme(isDark);
  const purple = isDark ? "#a855f7" : "#6d28d9";
  return (
    <div style={{
      position: "fixed", bottom: "max(60px, calc(env(safe-area-inset-bottom, 0px) + 60px))",
      left: "50%", transform: "translateX(-50%)",
      background: T.panelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${purple}50`, borderLeft: `3px solid ${purple}`,
      borderRadius: "0 8px 8px 0",
      padding: "16px 18px 14px", zIndex: 120,
      animation: "fadeUp 0.4s ease",
      width: "min(360px, calc(100vw - 28px))",
      boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
    }}>
      <button onClick={onDismiss} style={{ position: "absolute", top: 8, right: 10, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }} aria-label="Dismiss">×</button>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: T.textPrimary, marginBottom: 6, paddingRight: 20, fontWeight: 500 }}>
        you're somewhere right now ✦
      </div>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", lineHeight: 1.7, marginBottom: 14 }}>
        This moment will pass. Plant a thought here so you can come back to it.
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onDismiss} style={{
          background: "transparent", border: `1px solid ${T.panelBorder}`,
          color: T.textSec, padding: "9px 14px", borderRadius: 6, cursor: "pointer",
          fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.1em", minHeight: 38, fontWeight: 500,
        }}>not now</button>
        {hasLocation ? (
          <button onClick={onPlantHere} style={{
            background: `${purple}28`, border: `1px solid ${purple}`,
            color: purple, padding: "9px 18px", borderRadius: 6,
            cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 12.5, letterSpacing: "0.12em",
            minHeight: 38, fontWeight: 700, flex: 1,
          }}>plant where I am ✦</button>
        ) : (
          <button onClick={onPlantWhere} style={{
            background: `${purple}28`, border: `1px solid ${purple}`,
            color: purple, padding: "9px 18px", borderRadius: 6,
            cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 12.5, letterSpacing: "0.12em",
            minHeight: 38, fontWeight: 700, flex: 1,
          }}>plant first thought →</button>
        )}
      </div>
    </div>
  );
}

/* ─── Tour overlay ──────────────────────────────────────────────────────── */
function TourOverlay({ step, total, onNext, onPrev, onSkip }) {
  const [rect, setRect] = useState(null);
  const tipRef = useRef(null);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const target = document.getElementById(TOUR_STEPS[step].targetId);
    if (!target) { onNext(); return; }
    const r = target.getBoundingClientRect();
    setRect(r);
    setTimeout(() => {
      if (!tipRef.current) return;
      const tipH = tipRef.current.offsetHeight || 170;
      const tipW = 240;
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const rad = Math.max(r.width, r.height) / 2 + 12;
      let tipTop = cy + rad + 14;
      if (tipTop + tipH > window.innerHeight - 20) tipTop = cy - rad - tipH - 14;
      if (tipTop < 20) tipTop = 20;
      let tipLeft = cx - tipW / 2;
      tipLeft = Math.max(14, Math.min(tipLeft, window.innerWidth - tipW - 14));
      setTipPos({ top: tipTop, left: tipLeft });
    }, 0);
  }, [step]);

  if (!rect) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rad = Math.max(rect.width, rect.height) / 2 + 12;
  const { title, desc } = TOUR_STEPS[step];

  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999, pointerEvents: "none", animation: "fadeIn 0.2s ease" }} />
      <div className="yr-spotlight" style={{ left: cx - rad, top: cy - rad, width: rad * 2, height: rad * 2 }} />
      <div ref={tipRef} className="yr-tour-tip" style={{ top: tipPos.top, left: tipPos.left }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: "rgba(216,180,254,0.9)", letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>{step + 1} of {total}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#ffffff", marginBottom: 8, lineHeight: 1.3, fontWeight: 500 }}>{title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(232,228,217,0.92)", lineHeight: 1.7, fontStyle: "italic", marginBottom: 14 }}>{desc}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => { haptic("light"); onSkip(); }} style={{ background: "transparent", border: "none", color: "rgba(232,228,217,0.6)", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", cursor: "pointer", padding: 4, fontWeight: 500 }}>skip</button>
          <div style={{ display: "flex", gap: 6 }}>
            {step > 0 && (
              <button onClick={() => { haptic("light"); onPrev(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(232,228,217,0.85)", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", cursor: "pointer", padding: "7px 14px", borderRadius: 5, minHeight: 36, fontWeight: 500 }}>← back</button>
            )}
            <button onClick={() => { haptic("medium"); onNext(); }} style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.7)", color: "rgba(216,180,254,1)", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.18em", cursor: "pointer", padding: "7px 16px", borderRadius: 5, minHeight: 36, fontWeight: 700 }}>
              {step === total - 1 ? "begin ✦" : "next →"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Search box ────────────────────────────────────────────────────────── */
function SearchBox({ isDark }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        setResults(data);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 400);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const flyTo = (r) => {
    haptic("light");
    const m = window.__yearningMap;
    if (m) m.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 12, { duration: 1.5 });
    setQuery(r.display_name.split(",").slice(0, 2).join(", "));
    setResults([]);
  };

  return (
    <div id="search-container" style={{
      position: "fixed", top: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))",
      left: "50%", transform: "translateX(-50%)",
      width: "min(360px, calc(100vw - 120px))", zIndex: 110,
    }}>
      <div style={{ position: "relative" }}>
        <input className="yr-search-input" type="text" placeholder="search a place…"
          autoComplete="off" inputMode="search" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setResults([]); e.target.blur(); } }}
        />
        {query && (
          <button onClick={() => { haptic("light"); setQuery(""); setResults([]); }}
            style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: isDark ? "rgba(232,228,217,0.7)" : "rgba(10,9,8,0.7)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4, minWidth: 30, minHeight: 30, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Clear search">×</button>
        )}
      </div>
      {(results.length > 0 || loading) && (
        <div style={{
          background: isDark ? "rgba(11,10,17,0.97)" : "rgba(252,250,247,0.98)",
          border: `1px solid ${isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.16)"}`,
          borderTop: "none", borderRadius: "0 0 6px 6px",
          overflow: "hidden", maxHeight: 240, overflowY: "auto",
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
        }}>
          {loading && results.length === 0 && (
            <div style={{ padding: "12px 14px", fontFamily: "'Lora',serif", fontSize: 12.5, color: isDark ? "rgba(232,228,217,0.6)" : "rgba(10,9,8,0.6)", fontStyle: "italic" }}>searching…</div>
          )}
          {results.map((r, i) => (
            <div key={i} className="yr-search-result" onClick={() => flyTo(r)}>
              {r.display_name.split(",").slice(0, 3).join(", ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Found-you popup ───────────────────────────────────────────────────── */
function FoundPopup({ lat, lng, mapInstance }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const pt = mapInstance.latLngToContainerPoint([lat, lng]);
      setPos({ x: pt.x, y: pt.y });
    };
    update();
    mapInstance.on("move zoom", update);
    return () => mapInstance.off("move zoom", update);
  }, [lat, lng, mapInstance]);
  if (!pos) return null;
  return <div className="yr-found-popup" style={{ left: pos.x, top: pos.y }}>Found you ✦</div>;
}

/* ─── Pin card ──────────────────────────────────────────────────────────── */
function PinCard({ pin, mapInstance, isDark, onClose, onForget }) {
  const T = useTheme(isDark);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });
  const moodColor = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const moodLabel = pin.moodLabel || getMoodByKey(pin.mood, isDark).label;

  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const pt = mapInstance.latLngToContainerPoint([pin.lat, pin.lng]);
      const cardW = Math.min(340, window.innerWidth - 28);
      let left = pt.x - cardW / 2;
      left = Math.max(14, Math.min(left, window.innerWidth - cardW - 14));
      const cardEstHeight = 240;
      let top = pt.y + 44;
      if (top + cardEstHeight > window.innerHeight - 20) top = Math.max(14, pt.y - cardEstHeight - 24);
      setPos({ left, top, width: cardW });
    };
    update();
    mapInstance.on("move zoom", update);
    return () => mapInstance.off("move zoom", update);
  }, [pin, mapInstance]);

  return (
    <div className="yr-pin-card" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      <div style={{
        background: T.panelBg, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
        border: `1px solid ${moodColor}40`, borderLeft: `4px solid ${moodColor}`,
        borderRadius: "0 8px 8px 0",
        padding: "18px 18px 14px",
        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
        maxHeight: "min(46vh, 360px)", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1, paddingRight: 10 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: moodColor, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 5, fontWeight: 700 }}>
              {moodLabel} · {pin.date}
            </div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 500, color: T.textPrimary, lineHeight: 1.3 }}>
              {pin.title}
            </div>
          </div>
          <button onClick={() => { haptic("light"); onClose(); }} style={{ background: "transparent", border: "none", color: T.textSec, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0, flexShrink: 0, minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Close">×</button>
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.85, fontStyle: "italic" }}>
          {pin.body}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.panelBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.06em", fontWeight: 500 }}>
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </div>
          <button onClick={() => { haptic("medium"); onForget(pin.id); }}
            style={{ background: "transparent", border: "none", color: isDark ? "rgba(252,165,165,0.75)" : "rgba(185,28,28,0.85)", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 32, fontWeight: 600 }}
          >forget this</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export default function Yearning() {
  const mapContainerRef  = useRef(null);
  const mapRef           = useRef(null);
  const tileLayerRef     = useRef(null);
  const markersRef       = useRef({});
  const userMarkerRef    = useRef(null);
  const leafletRef       = useRef(null);
  const longPressTimer   = useRef(null);
  const toastTimer       = useRef(null);
  const pinchActiveRef   = useRef(false);
  const lastTouchEndRef  = useRef(0);
  const locationWatchRef = useRef(null);
  const lastNotifTimeRef = useRef(0);
  const lastNotifLocRef  = useRef(null);

  const [pins,             setPins]             = useState(loadPinsWithMigration);
  const [selectedPinId,    setSelectedPinId]    = useState(null);
  const [mode,             setMode]             = useState("view");
  const [placingCoords,    setPlacingCoords]    = useState(null);
  const [isDark,           setIsDark]           = useState(true);
  const [mapReady,         setMapReady]         = useState(false);
  const [toast,            setToast]            = useState(null);
  const [userLatLng,       setUserLatLng]       = useState(null);
  const [locationStatus,   setLocationStatus]   = useState("idle");
  const [forgetTargetId,   setForgetTargetId]   = useState(null);
  const [foundPopup,       setFoundPopup]       = useState(null);
  const [showTipJar,       setShowTipJar]       = useState(false);
  const [showHelp,         setShowHelp]         = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [showFirstNudge,   setShowFirstNudge]   = useState(false);
  const [showWhatsNew,     setShowWhatsNew]     = useState(false);
  const [whatsNewIsFirstAck, setWhatsNewIsFirstAck] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [notifPermission,  setNotifPermission]  = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );

  const [onboardPhase, setOnboardPhase] = useState(() => {
    try { return localStorage.getItem(ONBOARDED_KEY) ? null : "welcome"; } catch { return "welcome"; }
  });
  const [tourStep, setTourStep] = useState(0);

  /* ── Apply theme & viewport meta (incl. Apple PWA hints) ── */
  useEffect(() => {
    document.body.className = isDark ? "theme-dark" : "theme-light";

    const setMeta = (name, content) => {
      let el = document.querySelector(`meta[name="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.name = name; document.head.appendChild(el); }
      el.content = content;
    };

    setMeta("viewport", "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    setMeta("theme-color", isDark ? "#0a0a0f" : "#f5f3ee");
    setMeta("apple-mobile-web-app-capable", "yes");
    setMeta("mobile-web-app-capable", "yes");
    setMeta("apple-mobile-web-app-status-bar-style", isDark ? "black-translucent" : "default");
    setMeta("apple-mobile-web-app-title", "Yearning");
  }, [isDark]);

  /* ── Persist pins on every change ── */
  useEffect(() => { rawSavePins(pins); }, [pins]);

  /* ── Snapshot a backup once per session (extra safety net) ── */
  useEffect(() => {
    pushBackup(pins);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDarkRef = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /* ── Version detection: show "what's new" once per new version ── */
  useEffect(() => {
    if (onboardPhase) return; // Don't run during onboarding
    const lastSeen = getLastSeenVersion();
    if (!lastSeen) return; // Brand-new user; finishOnboarding will set version
    const cmp = compareVersions(lastSeen, APP_VERSION);
    if (cmp < 0) {
      const t = setTimeout(() => {
        setWhatsNewIsFirstAck(true);
        setShowWhatsNew(true);
      }, 800);
      return () => clearTimeout(t);
    }
  }, [onboardPhase]);

  /* ── Service worker: detect new versions deployed by the host ── */
  useEffect(() => {
    registerServiceWorker(() => setShowUpdateBanner(true));
  }, []);

  /* ── Location-based notifications ── */
  const checkAndNotify = useCallback((lat, lng) => {
    if (Notification.permission !== "granted") return;
    const now = Date.now();
    if (now - lastNotifTimeRef.current < NOTIF_COOLDOWN_MS) return;
    if (lastNotifLocRef.current) {
      const d = distanceKm(lat, lng, lastNotifLocRef.current.lat, lastNotifLocRef.current.lng);
      if (d < NOTIF_COOLDOWN_KM) return;
    }
    const notifiedLocs = loadNotifLocs();
    const recentlyNotified = notifiedLocs.some(
      (l) => distanceKm(lat, lng, l.lat, l.lng) < NOTIF_COOLDOWN_KM
    );
    if (recentlyNotified) return;

    const nearbyPins = pins.filter((p) => distanceKm(lat, lng, p.lat, p.lng) <= NEARBY_RADIUS_KM);
    let shown = false;
    if (nearbyPins.length > 0) {
      shown = showNotification(
        "yearning — you've been here ✦",
        nearbyPins.length === 1
          ? `Near "${nearbyPins[0].title}". Tap to revisit.`
          : `${nearbyPins.length} memories nearby — including "${nearbyPins[0].title}".`,
      );
    } else if (pins.length > 0) {
      shown = showNotification(
        "yearning — somewhere new ✦",
        "You've drifted somewhere unfamiliar. Plant a thought before this moment passes.",
      );
    }
    if (shown) {
      lastNotifTimeRef.current = now;
      lastNotifLocRef.current = { lat, lng };
      saveNotifLocs([...notifiedLocs, { lat, lng, t: now }]);
    }
  }, [pins]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    if (notifPermission !== "granted") return;
    if (locationWatchRef.current) {
      navigator.geolocation.clearWatch(locationWatchRef.current);
      locationWatchRef.current = null;
    }
    const watchId = navigator.geolocation.watchPosition(
      (pos) => { checkAndNotify(pos.coords.latitude, pos.coords.longitude); },
      () => {},
      { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 30000 }
    );
    locationWatchRef.current = watchId;
    return () => {
      if (locationWatchRef.current) {
        navigator.geolocation.clearWatch(locationWatchRef.current);
        locationWatchRef.current = null;
      }
    };
  }, [notifPermission, checkAndNotify]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (Notification.permission !== "granted") return;
      if (pins.length === 0) return;
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => checkAndNotify(pos.coords.latitude, pos.coords.longitude),
        () => {},
        { timeout: 5000, maximumAge: 5 * 60 * 1000 }
      );
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [pins, checkAndNotify]);

  /* ── Init Leaflet ── */
  const initMap = useCallback(() => {
    if (mapRef.current || !mapContainerRef.current || !window.L) return;
    const L = window.L;
    leafletRef.current = L;
    const isMobile = isMobileDevice();
    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
      zoomControl: false, attributionControl: false,
      tap: false, bounceAtZoomLimits: false, worldCopyJump: true,
      zoomSnap: isMobile ? 0.5 : 1, zoomDelta: isMobile ? 0.5 : 1,
      wheelDebounceTime: 40, wheelPxPerZoomLevel: 120,
      inertia: true, inertiaDeceleration: 3000,
    });
    tileLayerRef.current = L.tileLayer(TILE_DARK, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19, crossOrigin: true,
    }).addTo(map);
    L.control.zoom({ position: "topleft" }).addTo(map);
    L.control.attribution({ position: "bottomright", prefix: false }).addTo(map);

    setTimeout(() => {
      const zoomEl = document.querySelector(".leaflet-control-zoom");
      if (zoomEl && zoomEl.parentElement) {
        const parent = zoomEl.parentElement;
        parent.style.position = "absolute";
        parent.style.top = "50%";
        parent.style.transform = "translateY(-50%)";
        parent.style.left = "0";
      }
    }, 50);

    mapRef.current = map;
    window.__yearningMap = map;
    setMapReady(true);

    try {
      if (localStorage.getItem(ONBOARDED_KEY) && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => map.setView([pos.coords.latitude, pos.coords.longitude], 5, { animate: false }),
          () => {},
          { timeout: 3000, maximumAge: 300000 }
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (window.L) { initMap(); return; }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
    script.onload = initMap;
    document.head.appendChild(script);
  }, [initMap]);

  useEffect(() => {
    if (!mapReady) return;
    const handleResize = () => mapRef.current?.invalidateSize();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, [mapReady]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19, crossOrigin: true,
    }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [isDark, mapReady]);

  const createPinIcon = useCallback((pin, isSelected = false) => {
    const L = leafletRef.current;
    if (!L) return null;
    const color = pin.moodColor || getMoodByKey(pin.mood, isDarkRef.current).color;
    const size = isSelected ? 34 : 26;
    const html = `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 10px ${color}aa);pointer-events:none">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid rgba(255,255,255,${isSelected ? "0.7" : "0.45"});box-shadow:0 0 ${isSelected ? 22 : 12}px ${color}cc;transition:all 0.2s;pointer-events:auto"></div>
      <div style="width:2px;height:8px;background:${color};opacity:0.85;margin-top:-1px;pointer-events:none"></div>
    </div>`;
    return L.divIcon({ html, className: "", iconSize: [size + 4, size + 16], iconAnchor: [(size + 4) / 2, size + 16] });
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};
    pins.forEach((pin) => {
      const icon = createPinIcon(pin, pin.id === selectedPinId);
      const marker = L.marker([pin.lat, pin.lng], { icon, riseOnHover: true }).addTo(map);
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        haptic("light");
        setSelectedPinId((prev) => prev === pin.id ? null : pin.id);
      });
      markersRef.current[pin.id] = marker;
    });
  }, [pins, mapReady, selectedPinId, createPinIcon, isDark]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handleClick = (e) => {
      if (pinchActiveRef.current) return;
      if (Date.now() - lastTouchEndRef.current < 350) return;
      if (modeRef.current === "placing") {
        openWriting({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else {
        setSelectedPinId(null);
      }
    };
    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapReady]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !mapReady) return;
    let lpStart = null;
    const clearLP = () => {
      if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      lpStart = null;
    };
    const onTouchStart = (e) => {
      if (e.touches.length >= 2) { pinchActiveRef.current = true; clearLP(); return; }
      pinchActiveRef.current = false;
      if (modeRef.current !== "view" && modeRef.current !== "placing") return;
      const touch = e.touches[0];
      lpStart = { x: touch.clientX, y: touch.clientY, target: e.target };
      longPressTimer.current = setTimeout(() => {
        if (!lpStart || pinchActiveRef.current) return;
        const map = mapRef.current; if (!map) return;
        const rect = container.getBoundingClientRect();
        const pt = map.containerPointToLatLng([lpStart.x - rect.left, lpStart.y - rect.top]);
        haptic("medium"); playSound("chime");
        openWriting({ lat: pt.lat, lng: pt.lng });
        showToast("long-press pinned ✦");
        lpStart = null;
      }, 600);
    };
    const onTouchMove = (e) => {
      if (e.touches.length >= 2) { pinchActiveRef.current = true; clearLP(); return; }
      if (!lpStart || !e.touches[0]) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - lpStart.x) > 10 || Math.abs(t.clientY - lpStart.y) > 10) clearLP();
    };
    const onTouchEnd = (e) => {
      lastTouchEndRef.current = Date.now();
      clearLP();
      if (e.touches.length === 0) setTimeout(() => { pinchActiveRef.current = false; }, 250);
    };
    const onTouchCancel = () => { clearLP(); setTimeout(() => { pinchActiveRef.current = false; }, 250); };

    container.addEventListener("touchstart",  onTouchStart, { passive: true });
    container.addEventListener("touchmove",   onTouchMove,  { passive: true });
    container.addEventListener("touchend",    onTouchEnd,   { passive: true });
    container.addEventListener("touchcancel", onTouchCancel,{ passive: true });
    return () => {
      container.removeEventListener("touchstart",  onTouchStart);
      container.removeEventListener("touchmove",   onTouchMove);
      container.removeEventListener("touchend",    onTouchEnd);
      container.removeEventListener("touchcancel", onTouchCancel);
      clearLP();
    };
  }, [mapReady, showToast]);

  useEffect(() => {
    const c = mapContainerRef.current;
    if (c) c.style.cursor = mode === "placing" ? "crosshair" : "";
  }, [mode]);

  /* ── Handlers ── */
  const openWriting = (coords) => {
    haptic("medium");
    setPlacingCoords(coords);
    setMode("writing");
  };

  const cancelWrite = () => { setMode("view"); setPlacingCoords(null); };

  const handleSave = (newPin) => {
    setPins((p) => [...p, newPin]);
    setMode("view");
    setPlacingCoords(null);
    setSelectedPinId(newPin.id);
    mapRef.current?.flyTo([newPin.lat, newPin.lng], 16, { duration: 1.2 });
    showToast("Memory planted ✦");
    setShowFirstNudge(false);
    if (Notification.permission === "default") {
      setTimeout(async () => {
        const granted = await requestNotificationPermission();
        if (granted) {
          setNotifPermission("granted");
          showToast("location reminders enabled ·˚");
        } else {
          setNotifPermission(Notification.permission);
        }
      }, 1500);
    }
  };

  const requestLocation = useCallback(() => {
    haptic("light");
    if (!navigator.geolocation) { showToast("Geolocation not supported"); return; }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLatLng({ lat, lng });
        setLocationStatus("granted");
        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;
        if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
        const pulseHtml = `<div style="position:relative;width:20px;height:20px;pointer-events:none"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(8,145,178,0.22);animation:gps-pulse 2s infinite"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:11px;height:11px;border-radius:50%;background:#22d3ee;border:2px solid white;box-shadow:0 0 10px #22d3ee"></div></div>`;
        userMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({ html: pulseHtml, className: "", iconSize: [20, 20], iconAnchor: [10, 10] }),
          zIndexOffset: 1000, interactive: false,
        }).addTo(map);
        map.flyTo([lat, lng], 10, { duration: 2 });
        setTimeout(() => setFoundPopup({ lat, lng }), 2100);
        setTimeout(() => setFoundPopup(null), 5200);
      },
      () => { setLocationStatus("denied"); showToast("Location access denied"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [showToast]);

  const plantAtCenter = () => {
    const map = mapRef.current; if (!map) return;
    const c = map.getCenter();
    openWriting({ lat: c.lat, lng: c.lng });
  };

  const resetView = () => {
    haptic("light");
    mapRef.current?.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1.4 });
    showToast("view restored");
  };

  const jumpRandom = () => {
    haptic("light");
    if (!pins.length) return;
    const pin = pins[Math.floor(Math.random() * pins.length)];
    setSelectedPinId(pin.id);
    mapRef.current?.flyTo([pin.lat, pin.lng], 14, { duration: 1.6 });
  };

  const confirmForget = () => {
    setPins((p) => p.filter((x) => x.id !== forgetTargetId));
    setSelectedPinId(null); setForgetTargetId(null);
    showToast("gently forgotten ·˚");
  };

  const handleImport = (importedPins) => {
    setPins((current) => {
      const existingIds = new Set(current.map((p) => p.id));
      const newPins = importedPins.filter((p) => !existingIds.has(p.id));
      return [...current, ...newPins];
    });
    showToast(`${importedPins.length} memories restored ✦`);
  };

  const handleEnableNotifications = useCallback(async () => {
    haptic("light");
    const granted = await requestNotificationPermission();
    setNotifPermission(typeof Notification !== "undefined" ? Notification.permission : "default");
    if (granted) {
      showToast("location reminders enabled ·˚");
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => checkAndNotify(pos.coords.latitude, pos.coords.longitude),
          () => {}, { timeout: 5000 }
        );
      }
    } else {
      showToast("notifications not enabled");
    }
  }, [showToast, checkAndNotify]);

  const dismissWhatsNew = () => {
    haptic("light");
    setShowWhatsNew(false);
    setLastSeenVersion(APP_VERSION);
  };

  const applyUpdate = useCallback(() => {
    haptic("medium");
    rawSavePins(pins);
    pushBackup(pins);
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }).catch(() => {});
    }
    setTimeout(() => window.location.reload(), 200);
  }, [pins]);

  const finishOnboarding = () => {
    try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch {}
    setOnboardPhase(null); setTourStep(0);
    if (!getLastSeenVersion()) setLastSeenVersion(APP_VERSION);
    setTimeout(() => setShowFirstNudge(true), 700);
  };
  const skipOnboarding = () => { finishOnboarding(); showToast("help is always in the i button ·˚"); };

  /* ── Derived ── */
  const T = useTheme(isDark);
  const selectedPin = pins.find((p) => p.id === selectedPinId);
  const forgetTargetPin = pins.find((p) => p.id === forgetTargetId);

  const toolBtnStyle = { background: T.toolBg, borderColor: T.toolBorder, color: T.toolColor };
  const cyan   = isDark ? "#22d3ee" : "#0e7490";
  const purple = isDark ? "#a855f7" : "#6d28d9";

  const lastSeen = getLastSeenVersion();
  const changelogEntries = whatsNewIsFirstAck
    ? CHANGELOG.filter((c) => compareVersions(c.version, lastSeen || "0.0.0") > 0)
    : CHANGELOG;

  return (
    <div style={{
      width: "100%", height: "100dvh",
      background: isDark ? "#0a0a0f" : "#f5f3ee",
      overflow: "hidden", position: "relative",
    }}>
      <style>{GLOBAL_CSS}</style>

      <div ref={mapContainerRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {/* Header gradient */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "max(18px, calc(env(safe-area-inset-top, 0px) + 14px)) 22px 44px",
        background: T.headerGrad, pointerEvents: "none",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.06em", lineHeight: 1 }}>yearning</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.12em", marginTop: 4, fontStyle: "italic", fontWeight: 500 }}>leave a part of yourself somewhere</div>
        </div>
        {pins.length > 0 && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, letterSpacing: "0.1em", marginTop: 4, fontWeight: 600 }}>
            {pins.length} {pins.length === 1 ? "memory" : "memories"}
          </div>
        )}
      </div>

      {mapReady && <SearchBox isDark={isDark} />}

      {/* Update available banner */}
      {showUpdateBanner && !showWhatsNew && (
        <UpdateBanner
          isDark={isDark}
          onApply={applyUpdate}
          onDismiss={() => { haptic("light"); setShowUpdateBanner(false); }}
        />
      )}

      {/* Right toolbar */}
      {mode !== "placing" && (
        <div id="toolbar" style={{
          position: "fixed",
          right: "max(14px, env(safe-area-inset-right, 14px))",
          top: "50%", transform: "translateY(-50%)",
          zIndex: 100, display: "flex", flexDirection: "column", gap: 8,
        }}>
          <button id="btn-locate" className="yr-tool-btn" title="Locate me" aria-label="Locate me"
            onClick={() => { haptic("light"); requestLocation(); }}
            style={{
              background: locationStatus === "granted" ? (isDark ? "rgba(8,145,178,0.18)" : "rgba(14,116,144,0.12)") : T.toolBg,
              borderColor: locationStatus === "granted" ? cyan : T.toolBorder,
              color: locationStatus === "granted" ? cyan : T.toolColor,
            }}>
            {locationStatus === "requesting"
              ? <div style={{ width: 14, height: 14, border: `2px solid ${cyan}40`, borderTopColor: cyan, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              : "◎"}
          </button>

          <ToolBtn id="btn-plant" title={userLatLng ? "Plant at my location" : "Plant at map center"}
            onClick={() => { userLatLng ? openWriting(userLatLng) : plantAtCenter(); }}
            style={{ background: `${purple}1f`, borderColor: purple, color: purple }}>✦</ToolBtn>

          <ToolBtn id="btn-place" title="Tap anywhere on map"
            onClick={() => { setMode("placing"); setSelectedPinId(null); showToast("tap a spot · or long-press"); }}
            style={{ ...toolBtnStyle, fontSize: 22, fontWeight: 400 }}>+</ToolBtn>

          {pins.length > 0 && (
            <ToolBtn id="btn-random" title="Jump to a random memory" onClick={jumpRandom}
              style={{ ...toolBtnStyle, fontSize: 14 }}>↝</ToolBtn>
          )}

          <ToolBtn id="btn-reset" title="Reset view" onClick={resetView}
            style={{ ...toolBtnStyle, fontSize: 16 }}>⌂</ToolBtn>

          <div style={{ height: 1, background: T.panelBorder, borderRadius: 1, margin: "2px 8px" }} />

          <ToolBtn id="btn-theme" title={isDark ? "Switch to light map" : "Switch to dark map"}
            onClick={() => { setIsDark((v) => !v); }} style={{ ...toolBtnStyle, fontSize: 14 }}>◑</ToolBtn>

          <ToolBtn id="btn-exportimport" title="Export / Import memories"
            onClick={() => { setShowExportImport(true); }} style={{ ...toolBtnStyle, fontSize: 14 }}>⬇</ToolBtn>

          <ToolBtn id="btn-tipjar" title="Support Yearning"
            onClick={() => { setShowTipJar(true); }} style={toolBtnStyle}>☕</ToolBtn>

          <ToolBtn id="btn-help" title="Help" onClick={() => { setShowHelp(true); }}
            style={{ ...toolBtnStyle, fontFamily: "'Lora',serif", fontStyle: "italic", fontWeight: 600, fontSize: 16 }}>i</ToolBtn>
        </div>
      )}

      {mode === "placing" && (
        <button className="yr-tool-btn" onClick={() => { haptic("light"); setMode("view"); }}
          aria-label="Cancel placing"
          style={{ position: "fixed", right: "max(14px, env(safe-area-inset-right, 14px))", top: "50%", transform: "translateY(-50%)", zIndex: 100, background: "rgba(220,38,38,0.14)", borderColor: "rgba(220,38,38,0.5)", color: isDark ? "rgba(252,165,165,1)" : "#b91c1c", fontSize: 22 }}
        >×</button>
      )}

      {/* Mood legend */}
      <div style={{
        position: "fixed",
        left: "max(14px, env(safe-area-inset-left, 14px))",
        bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 56px))",
        zIndex: 100, display: "flex", flexDirection: "column", gap: 5,
      }}>
        {T.moods.map((m) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, flexShrink: 0, boxShadow: `0 0 5px ${m.color}aa` }} />
            <span style={{
              fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.12em",
              color: T.textPrimary, background: T.legendChipBg,
              border: `1px solid ${T.legendChipBorder}`,
              padding: "2px 8px", borderRadius: 4,
              backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)", fontWeight: 600,
            }}>{m.label}</span>
          </div>
        ))}
      </div>

      {mode === "placing" && (
        <div style={{
          position: "fixed", bottom: "max(30px, calc(env(safe-area-inset-bottom, 0px) + 30px))",
          left: "50%", transform: "translateX(-50%)",
          background: T.panelBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${T.panelBorder}`, borderRadius: 6,
          padding: "11px 22px", zIndex: 100,
          fontFamily: "'Lora',serif", fontSize: 13, color: T.textPrimary,
          letterSpacing: "0.12em", fontStyle: "italic", fontWeight: 500,
          animation: "fadeUp 0.25s ease",
          maxWidth: "calc(100vw - 28px)", textAlign: "center",
          boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.5)" : "0 4px 20px rgba(0,0,0,0.15)",
        }}>tap anywhere · or long-press to plant instantly</div>
      )}

      {pins.length === 0 && mode === "view" && mapReady && !selectedPinId && !showFirstNudge && onboardPhase === null && !showWhatsNew && (
        <div style={{
          position: "fixed", bottom: "max(30px, calc(env(safe-area-inset-bottom, 0px) + 30px))",
          left: "50%", transform: "translateX(-50%)",
          background: T.panelBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${T.panelBorder}`, borderRadius: 6,
          padding: "12px 22px", zIndex: 100, textAlign: "center",
          animation: "fadeUp 0.4s ease",
          boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.14)",
          maxWidth: "calc(100vw - 28px)",
        }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: T.textPrimary, letterSpacing: "0.04em", marginBottom: 4, fontWeight: 500 }}>
            the map is waiting
          </div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", letterSpacing: "0.08em" }}>
            tap <strong style={{ fontStyle: "normal", color: purple, fontWeight: 700 }}>✦</strong> or <strong style={{ fontStyle: "normal", color: T.textPrimary, fontWeight: 700 }}>+</strong> to plant your first memory
          </div>
        </div>
      )}

      {showFirstNudge && pins.length === 0 && mode === "view" && onboardPhase === null && !showWhatsNew && (
        <FirstPlantNudge
          isDark={isDark} hasLocation={!!userLatLng}
          onPlantHere={() => { setShowFirstNudge(false); openWriting(userLatLng); }}
          onPlantWhere={() => { setShowFirstNudge(false); plantAtCenter(); }}
          onDismiss={() => setShowFirstNudge(false)}
        />
      )}

      {selectedPin && mode === "view" && mapRef.current && (
        <PinCard pin={selectedPin} mapInstance={mapRef.current} isDark={isDark}
          onClose={() => setSelectedPinId(null)} onForget={setForgetTargetId} />
      )}

      {foundPopup && mapRef.current && (
        <FoundPopup lat={foundPopup.lat} lng={foundPopup.lng} mapInstance={mapRef.current} />
      )}

      {mode === "writing" && (
        <WritingModal coords={placingCoords} onSave={handleSave} onCancel={cancelWrite} isDark={isDark} />
      )}

      {forgetTargetId && forgetTargetPin && (
        <ForgetModal pin={forgetTargetPin} onConfirm={confirmForget} onCancel={() => setForgetTargetId(null)} isDark={isDark} />
      )}

      {showExportImport && (
        <ExportImportModal pins={pins} onImport={handleImport} onClose={() => setShowExportImport(false)} isDark={isDark} />
      )}

      {showTipJar && <TipJarModal onClose={() => setShowTipJar(false)} isDark={isDark} />}

      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          isDark={isDark}
          onEnableNotifications={handleEnableNotifications}
          notifPermission={notifPermission}
          pinCount={pins.length}
          onShowChangelog={() => { setShowHelp(false); setWhatsNewIsFirstAck(false); setShowWhatsNew(true); }}
        />
      )}

      {showWhatsNew && (
        <WhatsNewModal
          entries={changelogEntries.length > 0 ? changelogEntries : CHANGELOG}
          isFirstAcknowledgement={whatsNewIsFirstAck}
          onClose={dismissWhatsNew}
          isDark={isDark}
          pinCount={pins.length}
        />
      )}

      {onboardPhase === "welcome" && (
        <WelcomeModal
          onStartTour={() => { setOnboardPhase("tour"); setTourStep(0); }}
          onSkip={skipOnboarding}
        />
      )}

      {onboardPhase === "tour" && (
        <TourOverlay
          step={tourStep} total={TOUR_STEPS.length}
          onNext={() => {
            if (tourStep >= TOUR_STEPS.length - 1) { finishOnboarding(); showToast("you're all set ✦"); }
            else setTourStep((s) => s + 1);
          }}
          onPrev={() => setTourStep((s) => Math.max(0, s - 1))}
          onSkip={skipOnboarding}
        />
      )}

      <Toast msg={toast} isDark={isDark} />
          <SpeedInsights />
        <Analytics />
    </div>
  );
}