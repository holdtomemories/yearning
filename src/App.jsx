import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ─── Version & Changelog ───────────────────────────────────────────────── */
const APP_VERSION = "1.3.0";
const CHANGELOG = [
  { version: "1.3.0", date: "May 2026", title: "A richer sense of place", notes: ["Memories now remember the city and country they were planted in — automatically.","Time travel: drag the slider at the bottom to filter memories by date range.","Mood filters: tap any mood chip to see only those memories. Tap more to combine.","Search through everything you've ever written — title, body, place, mood.","Heatmap view: press the new ⌘ button to see where you think the most.","On this day: gentle resurfacing of memories from a year, two, or five years ago.","Anniversary loops: planting near an old memory quietly tells you who you were here before.","Edit memories within 24 hours of planting — for second thoughts and small fixes.","Share a memory as a paper-textured card with its own hand-carved seal.","A new stat in the help center: how long you've been listening to yourself.","Light/dark theme preference now persists across sessions.","Backup nudge: gentle reminder if you haven't exported in 15 days."] },
  { version: "1.2.0", date: "April 2026", title: "Updates that remember you", notes: ["Your memories now survive every app update — automatically and safely.","Higher contrast on light & dark maps so every word is easy to read.","Fixed pinch-to-zoom on mobile — it no longer opens the plant modal by accident.","Location reminders nudge you when you're within 5km of a memory, or somewhere new.","Added export and import, back up your memories or move them between devices.","First-time users now get a gentle prompt to plant their first thought.","Better support for iPhone and Android home-screen install (PWA)."] },
  { version: "1.1.0", date: "March 2026", title: "Quieter, kinder onboarding", notes: ["Welcome tour walks you through every tool the first time.","Help center now lives permanently in the i button."] },
  { version: "1.0.0", date: "February 2026", title: "Yearning begins", notes: ["Plant your first memory anywhere on earth."] },
];

/* ─── Constants ─────────────────────────────────────────────────────────── */
const K = {
  STORAGE: "yearning_pins_v3", ONBOARDED: "yearning_onboarded_v3",
  NOTIF_LOCS: "yearning_notified_locs_v1", VERSION: "yearning_last_seen_version",
  SCHEMA: "yearning_schema_version", BACKUP: "yearning_pins_backups",
  THEME: "yearning_theme", LAST_BACKUP: "yearning_last_backup_at",
  ANNIV_DISMISS: "yearning_anniv_dismissed_today", GEOCACHE: "yearning_geocache_v1",
  FIRST_RUN: "yearning_first_run_at",
};
const KOFI_URL = "https://ko-fi.com/supportyearningmap";
const DEFAULT_CENTER = [20, 0], DEFAULT_ZOOM = 3;
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const NEARBY_KM = 5, NOTIF_COOLDOWN_KM = 1.0, NOTIF_COOLDOWN_MS = 30 * 60 * 1000;
const CURRENT_SCHEMA = 3, MAX_BACKUPS = 3, BACKUP_NUDGE_DAYS = 15;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000, ANNIV_RADIUS_M = 50;

const MOODS_DARK = [
  { key: "wonder", label: "Wonder", color: "#a855f7" },
  { key: "peace", label: "Peace", color: "#06b6d4" },
  { key: "longing", label: "Longing", color: "#f97316" },
  { key: "joy", label: "Joy", color: "#22c55e" },
  { key: "ache", label: "Ache", color: "#ef4444" },
  { key: "gratitude", label: "Gratitude", color: "#f59e0b" },
  { key: "other", label: "Other", color: "#9ca3af" },
];
const MOODS_LIGHT = [
  { key: "wonder", label: "Wonder", color: "#6d28d9" },
  { key: "peace", label: "Peace", color: "#0e7490" },
  { key: "longing", label: "Longing", color: "#9a3412" },
  { key: "joy", label: "Joy", color: "#15803d" },
  { key: "ache", label: "Ache", color: "#b91c1c" },
  { key: "gratitude", label: "Gratitude", color: "#92400e" },
  { key: "other", label: "Other", color: "#4b5563" },
];

const TOUR_STEPS = [
  { targetId: "btn-plant", title: "Plant Here ✦", desc: "Instantly plants a memory pin at your GPS location — or at the map center if location is off." },
  { targetId: "btn-search-mem", title: "Search Memories", desc: "Search through every memory you've ever planted — by title, body, mood, or place." },
  { targetId: "btn-filter", title: "Filter Moods", desc: "Tap the funnel to open the filter tray and filter by mood." },
  { targetId: "btn-menu", title: "More Options ≡", desc: "Locate, heatmap, theme, export, support, help — all your low-frequency tools." },
  { targetId: "search-expand-btn", title: "Search Places", desc: "Tap the magnifying glass to expand a search bar and fly to any place." },
];

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const getMoods = (isDark) => isDark ? MOODS_DARK : MOODS_LIGHT;
const getMoodByKey = (key, isDark = true) => getMoods(isDark).find(m => m.key === key) ?? getMoods(isDark)[0];
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

/* ─── Geocoding (cached) ────────────────────────────────────────────────── */
function loadGeocache() { try { return JSON.parse(ls.get(K.GEOCACHE) || "{}"); } catch { return {}; } }
function saveGeocache(c) {
  const e = Object.entries(c);
  ls.set(K.GEOCACHE, JSON.stringify(e.length > 500 ? Object.fromEntries(e.slice(-400)) : c));
}
const gcKey = (lat, lng) => `${lat.toFixed(2)},${lng.toFixed(2)}`;
async function reverseGeocode(lat, lng) {
  const cache = loadGeocache(), key = gcKey(lat, lng);
  if (cache[key]) return cache[key];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`, { headers: { "Accept-Language": "en" } });
    if (!res.ok) throw new Error();
    const { address: a = {} } = await res.json();
    const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state || "";
    const result = { city, country: a.country || "" };
    cache[key] = result; saveGeocache(cache);
    return result;
  } catch { return { city: "", country: "" }; }
}

// ↓ INSERT getIpCenter RIGHT HERE ↓

async function getIpCenter() {
  const endpoints = [
    () => fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) })
            .then(r => r.json())
            .then(d => d.latitude && d.longitude ? [d.latitude, d.longitude] : null),
    () => fetch("https://ip-api.com/json/?fields=lat,lon,status", { signal: AbortSignal.timeout(4000) })
            .then(r => r.json())
            .then(d => d.status === "success" ? [d.lat, d.lon] : null),
  ];
  for (const fn of endpoints) {
    try { const result = await fn(); if (result) return result; } catch {}
  }
  return null;
}

/* ─── Seal generation ───────────────────────────────────────────────────── */
function makeSeed(lat, lng, ts, city = "") {
  const str = `${lat.toFixed(4)}|${lng.toFixed(4)}|${ts}|${city}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function makeRng(seed) {
  let s = seed;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function generateSeal(seed, color = "#a855f7", size = 120) {
  const rng = makeRng(seed), cx = size / 2, cy = size / 2, baseR = size * 0.32;
  const pts = 12 + Math.floor(rng() * 4);
  const path = Array.from({ length: pts }, (_, i) => { const a = (i / pts) * Math.PI * 2, r = baseR * (0.78 + rng() * 0.34); return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; });
  let d = `M ${path[0][0].toFixed(1)} ${path[0][1].toFixed(1)}`;
  for (let i = 0; i < path.length; i++) {
    const [cx2, cy2] = path[i], [nx, ny] = path[(i + 1) % path.length];
    d += ` Q ${cx2.toFixed(1)} ${cy2.toFixed(1)} ${((cx2 + nx) / 2).toFixed(1)} ${((cy2 + ny) / 2).toFixed(1)}`;
  }
  d += " Z";
  const marks = Array.from({ length: 2 + Math.floor(rng() * 2) }, () => {
    const a1 = rng() * Math.PI * 2, a2 = a1 + Math.PI * 0.4 + rng() * Math.PI * 0.6;
    const r1 = baseR * (0.25 + rng() * 0.35), r2 = baseR * (0.25 + rng() * 0.35);
    return { x1: cx + Math.cos(a1) * r1, y1: cy + Math.sin(a1) * r1, x2: cx + Math.cos(a2) * r2, y2: cy + Math.sin(a2) * r2 };
  });
  const da = rng() * Math.PI * 2, dr = baseR * 0.5;
  return { path: d, marks, dot: { x: cx + Math.cos(da) * dr, y: cy + Math.sin(da) * dr }, size };
}

/* ─── Persistence & Migration ───────────────────────────────────────────── */
const rawLoadPins = () => { try { const t = ls.get(K.STORAGE); return t ? JSON.parse(t) : []; } catch { return []; } };
const rawSavePins = (p) => ls.set(K.STORAGE, JSON.stringify(p));
const getSchema = () => { const v = ls.get(K.SCHEMA); return v ? parseInt(v, 10) : 1; };
const setSchema = (v) => ls.set(K.SCHEMA, String(v));
function pushBackup(pins) { try { const e = JSON.parse(ls.get(K.BACKUP) || "[]"); e.unshift({ at: Date.now(), version: APP_VERSION, pins }); ls.set(K.BACKUP, JSON.stringify(e.slice(0, MAX_BACKUPS))); } catch {} }
function getBackups() { try { return JSON.parse(ls.get(K.BACKUP) || "[]"); } catch { return []; } }

const MIGRATIONS = {
  1: (pins) => pins.map(p => ({ ...p, id: p.id || `legacy-${Math.random().toString(36).slice(2)}-${Date.now()}`, createdAt: p.createdAt || (typeof p.id === "string" && /^\d+$/.test(p.id) ? parseInt(p.id, 10) : Date.now()), moodLabel: p.moodLabel || (p.mood === "other" ? p.customMood || "Other" : MOODS_DARK.find(m => m.key === p.mood)?.label ?? "Wonder"), moodColor: p.moodColor || (MOODS_DARK.find(m => m.key === p.mood)?.color ?? MOODS_DARK[0].color) })),
  2: (pins) => pins.map(p => ({ ...p, city: p.city || "", country: p.country || "" })),
};

function migratePins(rawPins) {
  let pins = Array.isArray(rawPins) ? [...rawPins] : [];
  let from = getSchema();
  if (from >= CURRENT_SCHEMA) return { pins, migrated: false };
  pushBackup(rawPins);
  try {
    while (from < CURRENT_SCHEMA) { const fn = MIGRATIONS[from]; if (fn) pins = fn(pins); from++; }
    setSchema(CURRENT_SCHEMA); rawSavePins(pins);
    return { pins, migrated: true };
  } catch (err) {
    console.error("[Yearning] migration failed:", err);
    const backups = getBackups();
    if (backups.length > 0) { rawSavePins(backups[0].pins); return { pins: backups[0].pins, migrated: false }; }
    return { pins: rawPins, migrated: false };
  }
}

const loadPinsWithMigration = () => migratePins(rawLoadPins()).pins;
const loadNotifLocs = () => { try { return JSON.parse(ls.get(K.NOTIF_LOCS)) || []; } catch { return []; } };
const saveNotifLocs = (l) => ls.set(K.NOTIF_LOCS, JSON.stringify(l.slice(-30)));
const getLastSeenVersion = () => ls.get(K.VERSION);
const setLastSeenVersion = (v) => ls.set(K.VERSION, v);
const getStoredTheme = () => { const v = ls.get(K.THEME); return v === "light" || v === "dark" ? v : "dark"; };
const setStoredTheme = (t) => ls.set(K.THEME, t);
const getLastBackupAt = () => { const v = ls.get(K.LAST_BACKUP); return v ? parseInt(v, 10) : null; };
const setLastBackupAt = (t) => ls.set(K.LAST_BACKUP, String(t));
function getFirstRunAt() { let v = ls.get(K.FIRST_RUN); if (!v) { v = String(Date.now()); ls.set(K.FIRST_RUN, v); } return parseInt(v, 10); }
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
const getAnnivDismissed = () => ls.get(K.ANNIV_DISMISS);
const setAnnivDismissed = () => ls.set(K.ANNIV_DISMISS, todayKey());

function compareVersions(a, b) {
  if (!a) return -1; if (!b) return 1;
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x < y) return -1; if (x > y) return 1; }
  return 0;
}

/* ─── Audio / Haptic ────────────────────────────────────────────────────── */
function haptic(style = "light") {
  try {
    if (!navigator.vibrate) return;
    const p = { heavy: [30, 10, 30, 10, 30], success: [15, 40, 15], medium: [20] }[style] || [8];
    navigator.vibrate(p);
  } catch {}
}

let _audioCtx = null;
function getAudioCtx() {
  try { if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (_audioCtx.state === "suspended") _audioCtx.resume(); return _audioCtx; } catch { return null; }
}
function playSound(type = "plant") {
  try {
    const ctx = getAudioCtx(); if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    const t = ctx.currentTime;
    const sounds = {
      plant: () => { osc.type = "sine"; osc.frequency.setValueAtTime(523, t); osc.frequency.exponentialRampToValueAtTime(880, t + 0.18); gain.gain.setValueAtTime(0.18, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4); osc.start(t); osc.stop(t + 0.4); },
      forget: () => { osc.type = "sine"; osc.frequency.setValueAtTime(440, t); osc.frequency.exponentialRampToValueAtTime(220, t + 0.35); gain.gain.setValueAtTime(0.14, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5); osc.start(t); osc.stop(t + 0.5); },
      chime: () => { osc.type = "sine"; osc.frequency.setValueAtTime(660, t); osc.frequency.exponentialRampToValueAtTime(990, t + 0.12); gain.gain.setValueAtTime(0.10, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3); osc.start(t); osc.stop(t + 0.3); },
    };
    sounds[type]?.();
  } catch {}
}

/* ─── Geo math ──────────────────────────────────────────────────────────── */
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const distanceM = (a, b, c, d) => distanceKm(a, b, c, d) * 1000;
const isMobileDevice = () => typeof window !== "undefined" && (/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth < 1024);

/* ─── Notifications ─────────────────────────────────────────────────────── */
async function requestNotificationPermission() {
  try { if (!("Notification" in window)) return false; if (Notification.permission === "granted") return true; if (Notification.permission === "denied") return false; return (await Notification.requestPermission()) === "granted"; } catch { return false; }
}
function showNotification(title, body, onClick) {
  try {
    if (!("Notification" in window) || Notification.permission !== "granted") return false;
    const n = new Notification(title, { body, icon: "/favicon.ico", badge: "/favicon.ico", vibrate: [100, 50, 100], tag: "yearning-location", renotify: true, silent: false });
    if (onClick) n.onclick = () => { try { window.focus(); onClick(); } catch {} };
    return true;
  } catch { return false; }
}

/* ─── Service worker ────────────────────────────────────────────────────── */
function registerServiceWorker(onUpdate) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (window.location.protocol !== "https:" && window.location.hostname !== "localhost") return;
  navigator.serviceWorker.getRegistration().then((existing) => {
    const handle = (reg) => {
      if (!reg) return;
      if (reg.waiting) onUpdate?.(reg);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => { if (sw.state === "installed" && navigator.serviceWorker.controller) onUpdate?.(reg); });
      });
      reg.update().catch(() => {});
    };
    if (existing) handle(existing);
    else navigator.serviceWorker.register("/sw.js").then(handle).catch(() => {});
  }).catch(() => {});
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloaded) { reloaded = true; window.location.reload(); } });
}

/* ─── Date helpers ──────────────────────────────────────────────────────── */
const fmtMonthYear = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
const fmtFullDate = (ts) => new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
const daysBetween = (a, b) => Math.floor(Math.abs(b - a) / 86400000);
const monthsBetween = (a, b) => { const da = new Date(a), db = new Date(b); return (db.getFullYear() - da.getFullYear()) * 12 + db.getMonth() - da.getMonth(); };
const isSameDayOfYear = (a, b) => { const da = new Date(a), db = new Date(b); return da.getMonth() === db.getMonth() && da.getDate() === db.getDate(); };

/* ─── CSS ───────────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  html,body,#root{width:100%;height:100%;overflow:hidden;background:#0a0a0f;-webkit-text-size-adjust:100%;text-size-adjust:100%;-webkit-tap-highlight-color:transparent}
  body{overscroll-behavior:none;-webkit-overflow-scrolling:touch}
  html{overscroll-behavior-y:contain}
  .leaflet-container{background:#0a0a0f !important;touch-action:pan-x pan-y pinch-zoom !important;font-family:'Lora',serif !important}
  body.theme-light .leaflet-container{background:#f5f3ee !important}
  .leaflet-control-zoom{display:none !important}
  .leaflet-control-attribution{background:rgba(10,10,15,0.7) !important;color:rgba(255,255,255,0.45) !important;font-size:9px !important;padding:2px 6px !important}
  .leaflet-control-attribution a{color:rgba(255,255,255,0.65) !important}
  .leaflet-popup-content-wrapper,.leaflet-popup-tip-container{display:none !important}
  body.theme-light .leaflet-control-attribution{background:rgba(252,250,247,0.92) !important;color:rgba(26,24,20,0.7) !important}
  body.theme-light .leaflet-control-attribution a{color:rgba(26,24,20,0.9) !important}
  @keyframes gps-pulse{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(2.5);opacity:0}}
  @keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
  @keyframes fadeIn{from{opacity:0}to{opacity:1}}
  @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
  @keyframes spin{to{transform:rotate(360deg)}}
  @keyframes popIn{0%{opacity:0;transform:scale(0.95)}100%{opacity:1;transform:scale(1)}}
  @keyframes slideDown{from{opacity:0;transform:translateY(-10px)}to{opacity:1;transform:translateY(0)}}
  @keyframes pulseRing{0%{transform:scale(1);opacity:.7}100%{transform:scale(2.4);opacity:0}}
  @keyframes slideUpIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
  @keyframes sealStamp{0%{opacity:0;transform:scale(.6) rotate(-8deg)}60%{opacity:1;transform:scale(1.08) rotate(0)}100%{opacity:1;transform:scale(1) rotate(0)}}
  textarea{resize:none}
  ::-webkit-scrollbar{width:4px;height:4px}
  ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.15);border-radius:2px}
  body.theme-light ::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.2)}
  .yr-tool-btn{width:54px;height:54px;border-radius:12px;cursor:pointer;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:center;justify-content:center;font-size:20px;transition:all 0.18s;border:1px solid;-webkit-tap-highlight-color:transparent;user-select:none;flex-shrink:0;-webkit-user-select:none}
  .yr-tool-btn:active{transform:scale(0.90)}
  .yr-mood-chip{padding:11px 18px;border-radius:20px;cursor:pointer;border:1.5px solid;font-family:'Lora',serif;font-size:14px;letter-spacing:.1em;transition:all 0.15s;white-space:nowrap;-webkit-tap-highlight-color:transparent;min-height:48px;display:inline-flex;align-items:center;font-weight:500}
  .yr-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;z-index:200;padding:16px;overflow-y:auto}
  .yr-modal{animation:fadeUp 0.28s ease forwards}
  .yr-spotlight{position:fixed;border-radius:50%;border:2px solid rgba(192,132,252,0.85);pointer-events:none;z-index:1001;animation:pulseRing 1.5s ease-out infinite}
  .yr-tour-tip{position:fixed;background:rgba(11,10,17,0.97);border:1px solid rgba(192,132,252,0.4);border-top:2px solid rgba(192,132,252,0.85);border-radius:0 0 8px 8px;padding:14px 16px 12px;width:240px;z-index:1002;animation:slideDown 0.25s ease;box-shadow:0 12px 40px rgba(0,0,0,0.65)}
  .yr-search-input{width:100%;background:rgba(11,10,17,0.94);border:1px solid rgba(255,255,255,0.18);border-radius:6px;padding:11px 36px 11px 14px;color:#fff;font-family:'Lora',serif;letter-spacing:.06em;outline:none;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:border-color 0.2s;font-size:16px}
  .yr-search-input::placeholder{color:rgba(232,228,217,0.55);font-style:italic}
  .yr-search-input:focus{border-color:rgba(192,132,252,0.65)}
  .yr-search-result{padding:12px 14px;cursor:pointer;border-bottom:1px solid rgba(255,255,255,0.06);font-family:'Lora',serif;font-size:13.5px;color:rgba(232,228,217,0.92);letter-spacing:.04em;transition:background 0.12s;min-height:44px;display:flex;align-items:center}
  .yr-search-result:hover,.yr-search-result:active{background:rgba(192,132,252,0.14);color:#c084fc}
  .yr-search-result:last-child{border-bottom:none}
  body.theme-light .yr-search-input{background:rgba(252,250,247,0.97);color:#0a0908;border-color:rgba(0,0,0,0.2)}
  body.theme-light .yr-search-input::placeholder{color:rgba(26,24,20,0.55)}
  body.theme-light .yr-search-input:focus{border-color:rgba(109,40,217,0.65)}
  body.theme-light .yr-search-result{background:rgba(252,250,247,0.98);color:#0a0908;border-bottom-color:rgba(0,0,0,0.08)}
  body.theme-light .yr-search-result:hover{background:rgba(109,40,217,0.1);color:#6d28d9}
  .yr-found-popup{position:absolute;pointer-events:none;background:rgba(11,10,17,0.97);border:1px solid rgba(8,145,178,0.55);border-radius:6px;padding:7px 13px;white-space:nowrap;font-family:'Lora',serif;font-size:12px;color:#22d3ee;letter-spacing:.14em;font-style:italic;animation:fadeUp 0.3s ease;z-index:600;box-shadow:0 4px 20px rgba(0,0,0,0.5);transform:translate(-50%,calc(-100% - 20px));font-weight:600}
  .yr-found-popup::after{content:'';position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);border-left:6px solid transparent;border-right:6px solid transparent;border-top:6px solid rgba(8,145,178,0.55)}
  .yr-pin-card{position:fixed;z-index:300;animation:popIn 0.25s ease}
  .yr-slider-track{-webkit-appearance:none;appearance:none;width:100%;height:4px;background:transparent;outline:none;pointer-events:none;position:absolute;left:0;right:0;top:0}
  .yr-slider-track::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:24px;height:24px;border-radius:50%;background:#c084fc;border:2px solid rgba(255,255,255,0.9);cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px rgba(192,132,252,0.6);touch-action:none}
  .yr-slider-track::-moz-range-thumb{width:24px;height:24px;border-radius:50%;background:#c084fc;border:2px solid rgba(255,255,255,0.9);cursor:pointer;pointer-events:auto;box-shadow:0 2px 8px rgba(192,132,252,0.6);touch-action:none}
  body.theme-light .yr-slider-track::-webkit-slider-thumb{background:#6d28d9;border-color:#fff}
  body.theme-light .yr-slider-track::-moz-range-thumb{background:#6d28d9;border-color:#fff}
  .yr-paper{background-image:radial-gradient(circle at 20% 30%,rgba(0,0,0,.018) 1px,transparent 1px),radial-gradient(circle at 70% 60%,rgba(0,0,0,.022) 1px,transparent 1px),radial-gradient(circle at 40% 80%,rgba(0,0,0,.015) 1px,transparent 1px),radial-gradient(circle at 90% 20%,rgba(0,0,0,.018) 1px,transparent 1px);background-size:25px 25px,30px 30px,35px 35px,40px 40px}
  @media(max-width:768px){.yr-tool-btn{width:52px;height:46px;font-size:19px;border-radius:12px}.yr-mood-chip{padding:9px 16px;font-size:13.5px;min-height:48px}}
  @media(max-width:380px){.yr-tool-btn{width:50px;height:50px}}
  input,textarea{font-size:16px !important}

  /* ── FIX: Search dropdown — always fixed to viewport so it never scrolls with layout ── */
  .yr-place-search-dropdown{
    position:fixed;
    background:rgba(11,10,17,0.97);
    border:1px solid rgba(255,255,255,0.16);
    border-top:none;
    border-radius:0 0 8px 8px;
    overflow:hidden;
    max-height:220px;
    overflow-y:auto;
    backdrop-filter:blur(12px);
    -webkit-backdrop-filter:blur(12px);
    animation:fadeUp 0.15s ease;
    z-index:500;
    box-shadow:0 8px 24px rgba(0,0,0,0.5);
  }
  body.theme-light .yr-place-search-dropdown{
    background:rgba(252,250,247,0.98);
    border-color:rgba(0,0,0,0.16);
  }
`;

/* ─── Theme tokens ──────────────────────────────────────────────────────── */
function useTheme(isDark) {
  return {
    panelBg:    isDark ? "rgba(11,10,17,0.97)" : "#ffffff",
    panelBorder:isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.22)",
    textPrimary:isDark ? "#ffffff" : "#0a0908",
    textSec:    isDark ? "rgba(232,228,217,0.92)" : "rgba(10,9,8,0.92)",
    textMuted:  isDark ? "rgba(232,228,217,0.62)" : "rgba(10,9,8,0.7)",
    textFaint:  isDark ? "rgba(232,228,217,0.45)" : "rgba(10,9,8,0.55)",
    toolBg:     isDark ? "rgba(11,10,17,0.92)" : "#ffffff",
    toolBorder: isDark ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.22)",
    toolColor:  isDark ? "rgba(232,228,217,0.92)" : "#0a0908",
    headerGrad: isDark ? "linear-gradient(to bottom,rgba(10,10,15,.95) 0%,rgba(10,10,15,.5) 60%,transparent 100%)" : "linear-gradient(to bottom,rgba(245,243,238,.98) 0%,rgba(245,243,238,.6) 60%,transparent 100%)",
    legendChipBg:     isDark ? "rgba(11,10,17,0.85)" : "#ffffff",
    legendChipBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.2)",
    moods: getMoods(isDark),
    isDark,
  };
}

/* ─── Reusable primitives ───────────────────────────────────────────────── */
function Overlay({ zIndex = 200, onClose, children }) {
  return <div className="yr-overlay" style={{ zIndex }} onClick={e => e.target === e.currentTarget && onClose?.()}>{children}</div>;
}

function Modal({ onClose, isDark, accentColor, zIndex = 200, width = 480, anim, children, style = {} }) {
  const T = useTheme(isDark);
  return (
    <Overlay zIndex={zIndex} onClose={onClose}>
      <div className="yr-modal" onClick={e => e.stopPropagation()} style={{
        width, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${accentColor}40`, borderTop: `2px solid ${accentColor}`,
        borderRadius: "0 0 8px 8px", padding: "26px 26px 22px",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
        position: "relative", animation: anim, ...style,
      }}>
        <CloseBtn onClose={onClose} isDark={isDark} />
        {children}
      </div>
    </Overlay>
  );
}

function CloseBtn({ onClose, isDark }) {
  return (
    <button onClick={() => { haptic("light"); onClose(); }}
      style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: isDark ? "rgba(232,228,217,0.62)" : "rgba(10,9,8,0.7)", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }}
      aria-label="Close">×</button>
  );
}

function ModalLabel({ isDark, children }) {
  const T = useTheme(isDark);
  return <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{children}</div>;
}

function ModalTitle({ isDark, children, style = {} }) {
  const T = useTheme(isDark);
  return <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: T.textPrimary, marginBottom: 18, fontWeight: 500, ...style }}>{children}</div>;
}

function InfoBox({ isDark, color, children, style = {} }) {
  const c = typeof color === "string" ? color : "";
  return (
    <div style={{
      background: isDark ? `${c}11` : `${c}0a`,
      border: `1px solid ${c}33`, borderLeft: `3px solid ${c}99`,
      borderRadius: "0 6px 6px 0", padding: "10px 14px", marginBottom: 18,
      fontFamily: "'Lora',serif", fontSize: 12.5, color: "inherit", lineHeight: 1.6, fontStyle: "italic",
      ...style,
    }}>{children}</div>
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
  const T = useTheme(isDark);
  return (
    <div style={{
      position: "fixed", bottom: "max(86px, calc(env(safe-area-inset-bottom, 0px) + 86px))",
      left: "50%", transform: "translateX(-50%)",
      background: T.panelBg, backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
      border: `1px solid ${isDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.14)"}`,
      borderRadius: 6, padding: "10px 22px", zIndex: 600,
      fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec,
      letterSpacing: "0.14em", fontStyle: "italic", whiteSpace: "nowrap",
      pointerEvents: "none", animation: "toastIn 0.25s ease",
      boxShadow: isDark ? "0 4px 24px rgba(0,0,0,0.5)" : "0 4px 24px rgba(0,0,0,0.18)",
      maxWidth: "calc(100vw - 40px)", overflow: "hidden", textOverflow: "ellipsis",
    }}>{msg}</div>
  );
}

/* ─── Notification/info banners ─────────────────────────────────────────── */
function Banner({ isDark, color, icon, title, subtitle, actions, style = {} }) {
  const T = useTheme(isDark);
  return (
    <div style={{
      position: "fixed", top: "max(72px, calc(env(safe-area-inset-top, 0px) + 72px))",
      left: "50%", transform: "translateX(-50%)",
      background: T.panelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${color}55`, borderLeft: `3px solid ${color}`,
      borderRadius: "0 8px 8px 0", padding: "12px 16px 12px 14px", zIndex: 130,
      animation: "fadeUp 0.4s ease", display: "flex", alignItems: "center", gap: 12,
      boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
      width: "min(420px, calc(100vw - 28px))", ...style,
    }}>
      <div style={{ fontSize: 18, color, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: T.textPrimary, fontWeight: 500, marginBottom: 2 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>{actions}</div>
    </div>
  );
}

function BannerBtn({ color, isDark, onClick, filled, children }) {
  const T = useTheme(isDark);
  if (!filled) return <button onClick={onClick} style={{ background: "transparent", border: "none", color: T.textMuted, fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.1em", cursor: "pointer", padding: "8px 6px", minHeight: 52, minWidth: 52, fontWeight: 500 }}>{children}</button>;
  return <button onClick={onClick} style={{ background: `${color}22`, border: `1px solid ${color}`, color, padding: "8px 14px", borderRadius: 5, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", fontWeight: 700, minHeight: 52 }}>{children}</button>;
}

/* ─── Seal ──────────────────────────────────────────────────────────────── */
function SealGlyph({ pin, color, size = 88, animate = false }) {
  const seed = useMemo(() => makeSeed(pin.lat, pin.lng, pin.createdAt || 0, pin.city || ""), [pin.lat, pin.lng, pin.createdAt, pin.city]);
  const seal = useMemo(() => generateSeal(seed, color, size), [seed, color, size]);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ animation: animate ? "sealStamp 0.6s ease-out" : "none", display: "block" }}>
      <defs><filter id={`sr-${seed}`} x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed % 100} /><feDisplacementMap in="SourceGraphic" scale="1.2" /></filter></defs>
      <path d={seal.path} fill={color} fillOpacity="0.18" stroke={color} strokeWidth="1.6" strokeOpacity="0.85" filter={`url(#sr-${seed})`} />
      {seal.marks.map((m, i) => <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} stroke={color} strokeWidth="1.4" strokeOpacity="0.7" strokeLinecap="round" filter={`url(#sr-${seed})`} />)}
      <circle cx={seal.dot.x} cy={seal.dot.y} r="1.4" fill={color} fillOpacity="0.85" />
    </svg>
  );
}

/* ─── Writing / Edit modal ──────────────────────────────────────────────── */
function WritingModal({ coords, existingPin, onSave, onCancel, isDark, anniversaryHint }) {
  const T = useTheme(isDark);
  const isEdit = !!existingPin;
  const [draft, setDraft] = useState(() => existingPin
    ? { title: existingPin.title, body: existingPin.body, mood: existingPin.mood, customMood: existingPin.customMood || "" }
    : { title: "", body: "", mood: "wonder", customMood: "" });
  const [locationLabel, setLocationLabel] = useState("");
  const mood = T.moods.find(m => m.key === draft.mood) ?? T.moods[0];
  const valid = draft.title.trim() && draft.body.trim() && (draft.mood !== "other" || draft.customMood.trim());
  const d = (k, v) => setDraft(p => ({ ...p, [k]: v }));

  const displayCoords = coords || (existingPin ? { lat: existingPin.lat, lng: existingPin.lng } : null);

  useEffect(() => {
    if (!displayCoords) return;
    const cache = loadGeocache();
    const key = gcKey(displayCoords.lat, displayCoords.lng);
    if (cache[key]) {
      const r = cache[key];
      if (r.city || r.country) setLocationLabel([r.city, r.country].filter(Boolean).join(", "));
      return;
    }
    if (existingPin?.city || existingPin?.country) {
      setLocationLabel([existingPin.city, existingPin.country].filter(Boolean).join(", "));
      return;
    }
    reverseGeocode(displayCoords.lat, displayCoords.lng).then(r => {
      if (r.city || r.country) setLocationLabel([r.city, r.country].filter(Boolean).join(", "));
    });
  }, []);

  const handleSave = () => {
    if (!valid) return;
    haptic("success"); playSound("plant");
    const moodLabel = draft.mood === "other" ? draft.customMood.trim() : mood.label;
    const base = { title: draft.title.trim(), body: draft.body.trim(), mood: draft.mood, customMood: draft.mood === "other" ? draft.customMood.trim() : "", moodLabel, moodColor: mood.color };
    onSave(isEdit
      ? { ...existingPin, ...base, editedAt: Date.now() }
      : { id: Date.now().toString(), lat: coords.lat, lng: coords.lng, ...base, date: fmtFullDate(Date.now()), createdAt: Date.now(), appVersion: APP_VERSION, city: "", country: "" });
  };

  return (
    <Overlay zIndex={200} onClose={onCancel}>
      <div className="yr-modal" onClick={e => e.stopPropagation()} style={{
        width: 480, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${mood.color}40`, borderTop: `2px solid ${mood.color}`,
        borderRadius: "0 0 8px 8px", padding: "26px 26px 22px",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.02em", marginBottom: 4 }}>
          {isEdit ? "edit this memory" : "plant a thought here"}
        </div>
        {displayCoords && (
          <div style={{ marginBottom: anniversaryHint ? 12 : 20 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.14em", fontWeight: 500 }}>
              {displayCoords.lat.toFixed(5)}, {displayCoords.lng.toFixed(5)}
            </div>
            {locationLabel ? (
              <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, letterSpacing: "0.08em", fontWeight: 600, marginTop: 3, fontStyle: "italic" }}>
                {locationLabel}
              </div>
            ) : (
              <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: T.textFaint, letterSpacing: "0.1em", marginTop: 3, fontStyle: "italic" }}>
                locating…
              </div>
            )}
          </div>
        )}
        {anniversaryHint && !isEdit && (
          <div style={{ background: isDark ? "rgba(168,85,247,0.1)" : "rgba(109,40,217,0.07)", border: `1px solid ${isDark ? "rgba(168,85,247,0.3)" : "rgba(109,40,217,0.25)"}`, borderLeft: `3px solid ${isDark ? "rgba(168,85,247,0.7)" : "rgba(109,40,217,0.6)"}`, borderRadius: "0 6px 6px 0", padding: "10px 14px", marginBottom: 18, fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textSec, fontStyle: "italic", lineHeight: 1.6 }}>
            ✦ You were here before — {anniversaryHint}
          </div>
        )}
        <ModalLabel isDark={isDark}>mood</ModalLabel>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: draft.mood === "other" ? 10 : 18 }}>
          {T.moods.map(m => (
            <button key={m.key} className="yr-mood-chip" onClick={() => { haptic("light"); d("mood", m.key); }}
              style={{ background: draft.mood === m.key ? `${m.color}22` : "transparent", borderColor: draft.mood === m.key ? m.color : T.panelBorder, color: draft.mood === m.key ? m.color : T.textSec, fontWeight: draft.mood === m.key ? 700 : 500, boxShadow: draft.mood === m.key ? `0 0 12px ${m.color}50` : "none" }}>
              {m.label}
            </button>
          ))}
        </div>
        {draft.mood === "other" && (
          <input autoFocus={!isEdit} placeholder="how are you feeling?" value={draft.customMood} onChange={e => d("customMood", e.target.value)}
            style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${T.moods[6].color}88`, padding: "9px 0", marginBottom: 14, color: T.textPrimary, fontFamily: "'Lora',serif", fontStyle: "italic", outline: "none", letterSpacing: "0.06em" }} />
        )}
        <input autoFocus={!isEdit && draft.mood !== "other"} placeholder="Give this moment a name…" value={draft.title} onChange={e => d("title", e.target.value)}
          style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${draft.title ? mood.color : T.panelBorder}`, padding: "10px 0", marginBottom: 15, color: T.textPrimary, fontFamily: "'Playfair Display',serif", outline: "none", letterSpacing: "0.04em" }} />
        <textarea rows={5} placeholder="What do you want to remember about this place?" value={draft.body} onChange={e => d("body", e.target.value)}
          style={{ width: "100%", background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)", border: `1px solid ${T.panelBorder}`, borderRadius: 6, padding: 12, marginBottom: 20, color: T.textPrimary, fontFamily: "'Lora',serif", lineHeight: 1.85, fontStyle: "italic", outline: "none", letterSpacing: "0.02em" }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={() => { haptic("light"); onCancel(); }} style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "10px 20px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.1em", minHeight: 52, fontWeight: 500 }}>{isEdit ? "cancel" : "discard"}</button>
          <button onClick={handleSave} disabled={!valid} style={{ background: valid ? `${mood.color}28` : "transparent", border: `1px solid ${valid ? mood.color : T.panelBorder}`, color: valid ? mood.color : T.textFaint, padding: "10px 24px", borderRadius: 6, cursor: valid ? "pointer" : "not-allowed", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.12em", minHeight: 52, fontWeight: 700 }}>{isEdit ? "save changes ✦" : "plant it ✦"}</button>
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
  return (
    <Overlay zIndex={500} onClose={onCancel}>
      <div className="yr-modal" onClick={e => e.stopPropagation()} style={{ width: 400, maxWidth: "100%", background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(220,38,38,0.22)", borderTop: "2px solid rgba(220,38,38,0.6)", borderRadius: "0 0 8px 8px", padding: "30px 28px 26px", textAlign: "center", boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)" }}>
        <div style={{ fontSize: 32, marginBottom: 16, color: moodColor, filter: `drop-shadow(0 0 12px ${moodColor}66)`, opacity: 0.7 }}>◈</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: isDark ? "rgba(252,165,165,0.9)" : "#b91c1c", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 12, fontWeight: 700 }}>let go of this memory?</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.02em", marginBottom: 5, lineHeight: 1.35 }}>{pin.title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: moodColor, letterSpacing: "0.18em", marginBottom: 20, fontWeight: 600 }}>{moodLabel} · {pin.date}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.85, fontStyle: "italic", marginBottom: 20 }}>Once forgotten, this memory will be gone<br />from this earth — quietly and permanently.<br /><span style={{ color: T.textMuted, fontSize: 12.5 }}>There is no way to bring it back.</span></div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(220,38,38,0.09)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 6, padding: "8px 16px", marginBottom: 24 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: isDark ? "rgba(252,165,165,0.85)" : "#b91c1c", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: isDark ? "rgba(252,165,165,0.95)" : "#b91c1c", letterSpacing: "0.16em", fontWeight: 600 }}>this cannot be undone</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={() => { haptic("light"); onCancel(); }} style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", minHeight: 52, fontWeight: 500 }}>keep it</button>
          <button onClick={() => { haptic("heavy"); playSound("forget"); onConfirm(); }} style={{ background: "rgba(220,38,38,0.14)", border: "1px solid rgba(220,38,38,0.5)", color: isDark ? "rgba(252,165,165,1)" : "#b91c1c", padding: "10px 24px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", minHeight: 52, fontWeight: 700 }}>let it go</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Export / Import modal ─────────────────────────────────────────────── */
function ExportImportModal({ pins, onImport, onClose, onExported, isDark, lastBackupAt }) {
  const T = useTheme(isDark);
  const [tab, setTab] = useState("export");
  const [importText, setImportText] = useState("");
  const [importError, setImportError] = useState("");
  const [importSuccess, setImportSuccess] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const fileRef = useRef(null);
  const accent = isDark ? "#a855f7" : "#6d28d9";
  const daysSince = lastBackupAt ? daysBetween(lastBackupAt, Date.now()) : null;

  const handleExport = () => {
    haptic("medium");
    const data = JSON.stringify({ app: "yearning", version: APP_VERSION, exported: new Date().toISOString(), count: pins.length, pins }, null, 2);
    const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `yearning-memories-${new Date().toISOString().split("T")[0]}.json` });
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    onExported?.();
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result; setImportText(text);
      try { const arr = (JSON.parse(text).pins ?? JSON.parse(text)); if (!Array.isArray(arr)) throw new Error(); setPendingCount(arr.length); setImportError(""); }
      catch { setImportError("Invalid file. Please use a Yearning export file."); setPendingCount(0); }
    };
    reader.readAsText(file);
  };

  const handleImportConfirm = () => {
    try {
      const arr = JSON.parse(importText).pins ?? JSON.parse(importText);
      if (!Array.isArray(arr)) throw new Error();
      arr.forEach(p => { if (typeof p.lat !== "number" || typeof p.lng !== "number") throw new Error(); });
      haptic("success"); playSound("plant");
      onImport(arr); setImportSuccess(true);
      setTimeout(() => { setImportSuccess(false); onClose(); }, 1500);
    } catch { setImportError("Invalid file. Please use a Yearning export file."); }
  };

  const tabBtnStyle = (t) => ({ flex: 1, padding: "11px 0", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", transition: "all 0.18s", border: "none", background: tab === t ? `${accent}22` : "transparent", color: tab === t ? accent : T.textSec, fontWeight: tab === t ? 700 : 500, borderBottom: tab === t ? `2px solid ${accent}` : "2px solid transparent" });
  const actionBtnStyle = (active) => ({ width: "100%", padding: "13px 0", borderRadius: 6, background: active ? `${accent}22` : "transparent", border: `1px solid ${active ? accent : T.panelBorder}`, color: active ? accent : T.textFaint, fontFamily: "'Lora',serif", fontSize: 14, letterSpacing: "0.14em", cursor: active ? "pointer" : "not-allowed", fontWeight: 700, minHeight: 48 });

  return (
    <Modal onClose={onClose} isDark={isDark} accentColor={accent} zIndex={300} width={440}>
      <ModalLabel isDark={isDark}>memories</ModalLabel>
      <ModalTitle isDark={isDark}>export &amp; import</ModalTitle>
      <div style={{ display: "flex", gap: 0, marginBottom: 20, border: `1px solid ${T.panelBorder}`, borderRadius: 6, overflow: "hidden" }}>
        {["export", "import"].map(t => <button key={t} onClick={() => { haptic("light"); setTab(t); setImportError(""); }} style={tabBtnStyle(t)}>{t}</button>)}
      </div>
      <InfoBox isDark={isDark} color={isDark ? "#22d3ee" : "#0e7490"}>Your memories are stored on this device and survive every app update — but exporting a backup is always a good idea.</InfoBox>

      {tab === "export" ? (
        <>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.8, fontStyle: "italic", marginBottom: 16 }}>Download all your memories as a JSON file. Import it later to restore or move them to another device.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 6, padding: "12px 16px", marginBottom: 14 }}>
            <div style={{ fontSize: 24, color: accent }}>◈</div>
            <div>
              <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: T.textPrimary, fontWeight: 500 }}>{pins.length} {pins.length === 1 ? "memory" : "memories"}</div>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>ready to export</div>
            </div>
          </div>
          {daysSince !== null && <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic", marginBottom: 16 }}>Last backup: {daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`}</div>}
          <button onClick={handleExport} disabled={pins.length === 0} style={actionBtnStyle(pins.length > 0)}>↓ download memories</button>
        </>
      ) : (
        <>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.8, fontStyle: "italic", marginBottom: 18 }}>Upload a Yearning export file to restore or merge your memories. Existing memories will be preserved (duplicates skipped).</div>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={handleFile} style={{ display: "none" }} />
          <button onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: "13px 0", borderRadius: 6, marginBottom: 12, background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)", border: `1px dashed ${T.panelBorder}`, color: T.textSec, fontFamily: "'Lora',serif", fontSize: 13.5, letterSpacing: "0.1em", cursor: "pointer", minHeight: 48, fontWeight: 500 }}>↑ choose file</button>
          {importText && !importError && !importSuccess && pendingCount > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", marginBottom: 10 }}>Found <strong style={{ color: accent, fontStyle: "normal" }}>{pendingCount}</strong> {pendingCount === 1 ? "memory" : "memories"} ready to import.</div>
              <button onClick={handleImportConfirm} style={actionBtnStyle(true)}>✦ import memories</button>
            </div>
          )}
          {importError && <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: isDark ? "rgba(252,165,165,0.95)" : "#b91c1c", fontStyle: "italic", marginTop: 8, fontWeight: 500 }}>{importError}</div>}
          {importSuccess && <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: isDark ? "#86efac" : "#15803d", fontStyle: "italic", marginTop: 8, fontWeight: 600 }}>✓ memories imported successfully</div>}
        </>
      )}
    </Modal>
  );
}

/* ─── Tip Jar ───────────────────────────────────────────────────────────── */
function TipJarModal({ onClose, isDark }) {
  const T = useTheme(isDark);
  const gold = isDark ? "rgba(251,191,36,0.95)" : "#92400e";
  const goldBorder = isDark ? "rgba(251,191,36,0.45)" : "rgba(146,64,14,0.45)";
  const goldBg = isDark ? "rgba(180,83,9,0.12)" : "rgba(180,83,9,0.08)";
  const tiers = [{ l: "☕ $3", s: "a coffee" }, { l: "☕☕ $6", s: "two coffees" }, { l: "✦ $12", s: "you're amazing" }];
  return (
    <Modal onClose={onClose} isDark={isDark} accentColor={goldBorder} zIndex={300} width={360} style={{ textAlign: "center" }}>
      <div style={{ fontSize: 36, marginBottom: 14, filter: "drop-shadow(0 0 12px rgba(253,230,138,0.5))" }}>☕</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.03em", marginBottom: 10 }}>help yearning keep memories</div>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.85, fontStyle: "italic", marginBottom: 22 }}>We built yearning to help you hold onto the moments that matter most. And we want to keep it free, always.</div>
      <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
        {tiers.map(t => (
          <a key={t.l} href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{ flex: 1, textDecoration: "none", background: goldBg, border: `1px solid ${goldBorder}`, borderRadius: 6, padding: "11px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minHeight: 56 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: gold, letterSpacing: "0.06em", fontWeight: 700 }}>{t.l}</div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: gold, opacity: 0.75, letterSpacing: "0.14em", fontStyle: "italic" }}>{t.s}</div>
          </a>
        ))}
      </div>
      <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{ display: "block", textDecoration: "none", background: goldBg, border: `1px solid ${goldBorder}`, borderRadius: 6, padding: 12, fontFamily: "'Lora',serif", fontSize: 13.5, color: gold, letterSpacing: "0.14em", fontWeight: 700 }}>support yearning on ko-fi →</a>
      <div style={{ marginTop: 14, fontFamily: "'Lora',serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.12em", fontStyle: "italic" }}>no account needed · opens in a new tab</div>
    </Modal>
  );
}

/* ─── Memory search modal ───────────────────────────────────────────────── */
function MemorySearchModal({ pins, onSelect, onClose, isDark }) {
  const T = useTheme(isDark);
  const [query, setQuery] = useState("");
  const accent = isDark ? "#a855f7" : "#6d28d9";
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sorted = pins.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (!q) return sorted.slice(0, 30);
    return sorted.filter(p => `${p.title} ${p.body} ${p.moodLabel || ""} ${p.city || ""} ${p.country || ""}`.toLowerCase().includes(q));
  }, [pins, query]);

  return (
    <Modal onClose={onClose} isDark={isDark} accentColor={accent} zIndex={300} style={{ display: "flex", flexDirection: "column" }}>
      <ModalLabel isDark={isDark}>search memories</ModalLabel>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: T.textPrimary, marginBottom: 16, fontWeight: 500, fontStyle: "italic" }}>what are you looking for…</div>
      <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="a word, a feeling, a place…"
        style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${query ? accent : T.panelBorder}`, padding: "10px 0", marginBottom: 14, color: T.textPrimary, fontFamily: "'Playfair Display',serif", fontStyle: "italic", outline: "none", letterSpacing: "0.02em", fontSize: 17 }} />
      <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.16em", marginBottom: 10, fontStyle: "italic", fontWeight: 500 }}>
        {query ? `${results.length} found` : `your last ${Math.min(30, results.length)} memories`}
      </div>
      <div style={{ flex: 1, overflowY: "auto", marginRight: -8, paddingRight: 8 }}>
        {results.length === 0 && query && <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: T.textMuted, fontStyle: "italic", padding: "20px 0", textAlign: "center" }}>nothing matches that — yet.</div>}
        {results.map(p => {
          const mc = p.moodColor || getMoodByKey(p.mood, isDark).color;
          const place = [p.city, p.country].filter(Boolean).join(", ");
          return (
            <button key={p.id} onClick={() => { haptic("light"); onSelect(p); }} style={{ width: "100%", textAlign: "left", padding: "12px 0", background: "transparent", border: "none", borderBottom: `1px solid ${T.panelBorder}`, cursor: "pointer", display: "block" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: mc, flexShrink: 0, boxShadow: `0 0 4px ${mc}aa` }} />
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15.5, color: T.textPrimary, fontWeight: 500, flex: 1, lineHeight: 1.3 }}>{p.title}</div>
              </div>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", lineHeight: 1.55, marginBottom: 4, paddingLeft: 15, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.body}</div>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.1em", paddingLeft: 15, fontWeight: 500 }}>{p.date}{place ? ` · ${place}` : ""}</div>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

/* ─── Share card modal ──────────────────────────────────────────────────── */
function ShareCardModal({ pin, isDark, onClose }) {
  const T = useTheme(isDark);
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const moodColor = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const moodLabel = pin.moodLabel || getMoodByKey(pin.mood, isDark).label;
  const place = [pin.city, pin.country].filter(Boolean).join(", ");
  const accent = isDark ? "#a855f7" : "#6d28d9";

  const renderToCanvas = useCallback(async () => {
    const W = 1080, H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#faf6ee"); grad.addColorStop(1, "#f0e9d8");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 800; i++) { ctx.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.025})`; ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 1.5, 0, Math.PI * 2); ctx.fill(); }
    const vg = ctx.createRadialGradient(W/2, H/2, W*0.35, W/2, H/2, W*0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.06)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = moodColor; ctx.globalAlpha = 0.85; ctx.fillRect(80, 80, 4, 80); ctx.globalAlpha = 1;
    ctx.fillStyle = moodColor; ctx.font = "700 28px 'Lora',serif"; ctx.textAlign = "left"; ctx.fillText(moodLabel.toUpperCase(), 110, 130);
    ctx.fillStyle = "rgba(60,50,40,0.55)"; ctx.font = "italic 22px 'Lora',serif"; ctx.fillText(pin.date, 110, 165);
    ctx.fillStyle = "#1a1410"; ctx.font = "500 64px 'Playfair Display',serif";
    const wrap = (text, x, y, maxW, lh, max = 3) => { const words = text.split(" "); let line = "", yy = y, drawn = 0; for (const w of words) { const t = line + w + " "; if (ctx.measureText(t).width > maxW && line) { ctx.fillText(line.trim(), x, yy); line = w + " "; yy += lh; if (++drawn >= max) { ctx.fillText(line.trim() + "…", x, yy); return yy + lh; } } else line = t; } if (line) ctx.fillText(line.trim(), x, yy); return yy + lh; };
    let yPos = wrap(pin.title, 110, 260, W - 220, 78);
    ctx.strokeStyle = "rgba(60,50,40,0.25)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(110, yPos + 20); ctx.lineTo(260, yPos + 20); ctx.stroke(); yPos += 70;
    ctx.fillStyle = "rgba(40,30,20,0.85)"; ctx.font = "italic 34px 'Lora',serif";
    yPos = wrap(pin.body, 110, yPos, W - 220, 50, 10);
    if (place) { ctx.fillStyle = "rgba(60,50,40,0.6)"; ctx.font = "500 24px 'Lora',serif"; ctx.fillText(place, 110, yPos + 30); yPos += 55; }
    ctx.fillStyle = "rgba(60,50,40,0.45)"; ctx.font = "500 18px 'Lora',serif"; ctx.fillText(`${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`, 110, yPos + 30);
    const seed = makeSeed(pin.lat, pin.lng, pin.createdAt || 0, pin.city || "");
    const sd = generateSeal(seed, moodColor, 200);
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><path d="${sd.path}" fill="${moodColor}" fill-opacity="0.22" stroke="${moodColor}" stroke-width="2.4" stroke-opacity="0.85"/>${sd.marks.map(m => `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="${moodColor}" stroke-width="2.2" stroke-opacity="0.75" stroke-linecap="round"/>`).join("")}<circle cx="${sd.dot.x}" cy="${sd.dot.y}" r="2.2" fill="${moodColor}" fill-opacity="0.9"/></svg>`;
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr))); });
    ctx.save(); ctx.translate(W - 240, H - 320); ctx.rotate(-0.08); ctx.globalAlpha = 0.92; ctx.drawImage(img, 0, 0, 180, 180); ctx.restore();
    ctx.fillStyle = "rgba(40,30,20,0.55)"; ctx.font = "700 20px 'Lora',serif"; ctx.textAlign = "left"; ctx.fillText("YEARNINGMAP", 110, H - 100);
    ctx.fillStyle = "rgba(60,50,40,0.5)"; ctx.font = "italic 22px 'Lora',serif"; ctx.fillText("leave a part of yourself somewhere", 110, H - 70);
    return canvas;
  }, [pin, moodColor, moodLabel, place]);

  const downloadShare = async () => {
    haptic("medium"); setBusy(true); setStatusMsg("");
    try {
      const canvas = await renderToCanvas();
      const blob = await new Promise(res => canvas.toBlob(res, "image/png", 0.95));
      if (!blob) throw new Error();
      const file = new File([blob], `yearning-${pin.id}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file], title: pin.title }); setStatusMsg("shared ✦"); setBusy(false); return; } catch {}
      }
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: `yearning-${pin.id}.png` });
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      setStatusMsg("saved to your device ✦");
    } catch { setStatusMsg("could not generate card"); } finally { setBusy(false); }
  };

  return (
    <Modal onClose={onClose} isDark={isDark} accentColor={moodColor} zIndex={400} width={440}>
      <ModalLabel isDark={isDark}>share memory</ModalLabel>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: T.textPrimary, marginBottom: 18, fontWeight: 500 }}>a page from your diary</div>
      <div ref={cardRef} className="yr-paper" style={{ background: "linear-gradient(180deg,#faf6ee 0%,#f0e9d8 100%)", borderRadius: 4, padding: "22px 22px 18px", marginBottom: 18, boxShadow: "0 8px 32px rgba(40,30,20,0.25),inset 0 0 60px rgba(60,40,20,0.04)", position: "relative", overflow: "hidden" }}>
        <div style={{ width: 3, height: 32, background: moodColor, marginBottom: 10, opacity: 0.85 }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: moodColor, letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>{moodLabel}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: "rgba(60,50,40,0.55)", fontStyle: "italic", marginBottom: 14 }}>{pin.date}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#1a1410", fontWeight: 500, lineHeight: 1.25, marginBottom: 14 }}>{pin.title}</div>
        <div style={{ width: 60, height: 1, background: "rgba(60,50,40,0.25)", marginBottom: 14 }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(40,30,20,0.85)", fontStyle: "italic", lineHeight: 1.7, marginBottom: 14, display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pin.body}</div>
        {place && <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: "rgba(60,50,40,0.7)", fontWeight: 600, letterSpacing: "0.04em" }}>{place}</div>}
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: "rgba(60,50,40,0.5)", marginTop: 2, fontWeight: 500 }}>{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</div>
        <div style={{ position: "absolute", right: 16, bottom: 50, transform: "rotate(-6deg)", opacity: 0.92 }}><SealGlyph pin={pin} color={moodColor} size={70} animate /></div>
        <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid rgba(60,50,40,0.15)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: "rgba(40,30,20,0.55)", letterSpacing: "0.18em", fontWeight: 700 }}>YEARNINGMAP</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 9, color: "rgba(60,50,40,0.5)", fontStyle: "italic" }}>leave a part of yourself somewhere</div>
        </div>
      </div>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: T.textMuted, fontStyle: "italic", lineHeight: 1.6, marginBottom: 14 }}>Each memory has its own seal — generated from where and when you planted it. No two are alike.</div>
      <button onClick={downloadShare} disabled={busy} style={{ width: "100%", padding: "13px 0", borderRadius: 6, background: `${accent}22`, border: `1px solid ${accent}`, color: accent, fontFamily: "'Lora',serif", fontSize: 13.5, letterSpacing: "0.14em", cursor: busy ? "wait" : "pointer", fontWeight: 700, minHeight: 48 }}>
        {busy ? "preparing…" : "↗ share or save card"}
      </button>
      {statusMsg && <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", marginTop: 10, textAlign: "center" }}>{statusMsg}</div>}
    </Modal>
  );
}

/* ─── Help modal ────────────────────────────────────────────────────────── */
function HelpModal({ onClose, isDark, onEnableNotifications, notifPermission, onShowChangelog, pinCount, listeningDays }) {
  const T = useTheme(isDark);
  const cyan = isDark ? "#22d3ee" : "#0e7490";
  const purple = isDark ? "#c084fc" : "#6d28d9";
  const green = isDark ? "#86efac" : "#15803d";
  const gold = isDark ? "rgba(251,191,36,0.95)" : "#92400e";
  const tools = [
    { icon: "◎", col: cyan, label: "Locate Me", desc: "Flies to your GPS position and shows a live pulse marker." },
    { icon: "✦", col: purple, label: "Plant Here", desc: "Plants a pin at your GPS location, or at the map center if unavailable." },
    { icon: "+", col: T.textPrimary, label: "Tap Anywhere", desc: "Enter placing mode — tap any spot, or long-press for an instant plant." },
    { icon: "⌕", col: purple, label: "Search Memories", desc: "Full-text search through every memory you've planted — title, body, mood, place." },
    { icon: "⌘", col: T.textSec, label: "Heatmap", desc: "Toggle a soft density view that shows where you think the most." },
    { icon: "⌂", col: T.textSec, label: "Reset View", desc: "Flies back to the world view at default zoom." },
    { icon: "↝", col: T.textSec, label: "Random Memory", desc: "Jumps to a random memory you've planted." },
    { icon: "◑", col: gold, label: "Light / Dark", desc: "Toggle between dark and light map themes. Your choice persists across sessions." },
    { icon: "⬇", col: T.textSec, label: "Export / Import", desc: "Back up your memories to a file, or restore from a previous export." },
    { icon: "☕", col: gold, label: "Support", desc: "Keep Yearning free with a small tip." },
    { icon: "i", col: cyan, label: "Help Center", desc: "This panel — your guide lives here permanently.", italic: true },
  ];
  const notifStates = { granted: { bg: isDark ? "rgba(22,163,74,0.16)" : "rgba(22,163,74,0.1)", border: isDark ? "rgba(134,239,172,0.5)" : "rgba(22,163,74,0.5)", color: green, label: "✓ notifications enabled" }, denied: { bg: "transparent", border: T.panelBorder, color: T.textFaint, label: "notifications blocked in browser" }, default: { bg: `${cyan}22`, border: cyan, color: cyan, label: "✦ enable location reminders" } };
  const ns = notifStates[notifPermission] || notifStates.default;

  const Sect = ({ title, children }) => <>
    <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "16px 0 14px" }} />
    <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>{title}</div>
    {children}
  </>;

  return (
    <Modal onClose={onClose} isDark={isDark} accentColor={cyan} zIndex={300} width={460}>
      <ModalLabel isDark={isDark}>help center</ModalLabel>
      <ModalTitle isDark={isDark}>how to use yearning</ModalTitle>
      {listeningDays > 0 && (
        <div style={{ background: isDark ? "rgba(168,85,247,0.07)" : "rgba(109,40,217,0.05)", border: `1px solid ${isDark ? "rgba(168,85,247,0.22)" : "rgba(109,40,217,0.18)"}`, borderLeft: `3px solid ${purple}`, borderRadius: "0 6px 6px 0", padding: "14px 16px", marginBottom: 22 }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: 14.5, color: T.textPrimary, lineHeight: 1.45 }}>
            You've been listening to yourself for <strong style={{ color: purple, fontStyle: "normal", fontWeight: 600 }}>{listeningDays} {listeningDays === 1 ? "day" : "days"}</strong>.
          </div>
        </div>
      )}
      <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 14, fontWeight: 600 }}>your tools</div>
      {tools.map(({ icon, col, label, desc, italic }) => (
        <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: 6, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)", border: `1px solid ${T.panelBorder}`, color: col, fontSize: italic ? 16 : 15, fontWeight: 600, fontFamily: italic ? "'Lora',serif" : "inherit", fontStyle: italic ? "italic" : "normal" }}>{icon}</div>
          <div style={{ paddingTop: 2 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textPrimary, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 3, fontWeight: 700 }}>{label}</div>
            <div style={{ fontFamily: "'Lora',serif", fontStyle: "italic", fontSize: 13.5, color: T.textSec, lineHeight: 1.7 }}>{desc}</div>
          </div>
        </div>
      ))}
      <Sect title="editing memories"><div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", lineHeight: 1.75 }}>For 24 hours after planting, you can edit a memory's title, body, or mood. After that, the moment is set in stone. The location and time are never editable.</div></Sect>
      <Sect title="time travel"><div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", lineHeight: 1.75 }}>Open the mood filter tray and scroll down to find the date range slider. Drag the handles to filter memories by time.</div></Sect>
      <Sect title="moods">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          {T.moods.map(m => <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 9, height: 9, borderRadius: "50%", background: m.color, boxShadow: `0 0 6px ${m.color}88` }} /><span style={{ fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textPrimary, fontWeight: 600 }}>{m.label}</span></div>)}
        </div>
      </Sect>
      <Sect title="location reminders">
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", marginBottom: 12, lineHeight: 1.7 }}>When enabled, yearning quietly reminds you when you arrive somewhere new — within {NEARBY_KM}km of where you've been before.</div>
        <button onClick={onEnableNotifications} disabled={notifPermission !== "default"} style={{ width: "100%", padding: "11px 0", borderRadius: 6, marginBottom: 14, background: ns.bg, border: `1px solid ${ns.border}`, color: ns.color, fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", fontWeight: 700, cursor: notifPermission === "default" ? "pointer" : "default", minHeight: 52 }}>{ns.label}</button>
      </Sect>
      <Sect title="add to homescreen">
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", marginBottom: 14, lineHeight: 1.65 }}>Keep yearning just a tap away — it works like a native app.</div>
        {[
          { label: "iPhone · Safari", color: isDark ? "#22d3ee" : "#0e7490", steps: [["Tap the", "Share", "button at the bottom"], ["Scroll and tap", "Add to Home Screen", ""], ["Tap", "Add", "in the top right corner"]] },
          { label: "Android · Chrome", color: isDark ? "#86efac" : "#15803d", steps: [["Tap the", "⋮", "menu in the top right"], ["Tap", "Add to Home screen", ""], ["Tap", "Add", "to confirm"]] },
        ].map(({ label, color, steps }) => (
          <div key={label} style={{ background: `${color}11`, border: `1px solid ${color}40`, borderLeft: `3px solid ${color}a0`, borderRadius: "0 6px 6px 0", padding: "14px 16px", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 9, fontWeight: 700 }}>{label}</div>
            {steps.map(([pre, tag, post], i) => (
              <div key={i} style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, lineHeight: 1.7, fontStyle: "italic", marginBottom: i < 2 ? 5 : 0 }}>
                {i + 1}. {pre} <span style={{ background: color + "22", color, padding: "2px 8px", borderRadius: 4, fontSize: 11.5, fontStyle: "normal", fontWeight: 600 }}>{tag}</span> {post}
              </div>
            ))}
          </div>
        ))}
      </Sect>
      <div style={{ marginTop: 12, background: isDark ? "rgba(168,85,247,0.08)" : "rgba(109,40,217,0.06)", border: `1px solid ${isDark ? "rgba(168,85,247,0.25)" : "rgba(109,40,217,0.2)"}`, borderLeft: `3px solid ${isDark ? "rgba(168,85,247,0.7)" : "rgba(109,40,217,0.55)"}`, borderRadius: "0 6px 6px 0", padding: "12px 14px", fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textSec, lineHeight: 1.7, fontStyle: "italic" }}>
        <strong style={{ color: T.textPrimary, fontWeight: 700, fontStyle: "normal" }}>Your memories are safe across updates.</strong>{" "}{pinCount > 0 ? `All ${pinCount} of your memories will persist` : "All your memories will persist"} every time yearning updates — no resets, no logins, ever.
      </div>
      <div style={{ marginTop: 20, paddingTop: 14, borderTop: `1px solid ${T.panelBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button onClick={onShowChangelog} style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "8px 14px", borderRadius: 5, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", fontWeight: 600, minHeight: 44 }}>what's new</button>
        <span style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.18em", fontWeight: 500 }}>yearning v{APP_VERSION}</span>
      </div>
    </Modal>
  );
}

/* ─── What's New modal ──────────────────────────────────────────────────── */
function WhatsNewModal({ entries, isFirstAcknowledgement, onClose, isDark, pinCount }) {
  const T = useTheme(isDark);
  const purple = isDark ? "#a855f7" : "#6d28d9";
  const cyan = isDark ? "#22d3ee" : "#0e7490";
  return (
    <Modal onClose={onClose} isDark={isDark} accentColor={purple} zIndex={350} anim="slideUpIn 0.4s ease">
      <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: purple, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>{isFirstAcknowledgement ? "yearning · updated" : "what's new"}</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 24, fontWeight: 500, color: T.textPrimary, marginBottom: 6, lineHeight: 1.2 }}>{entries[0]?.title || `Version ${APP_VERSION}`}</div>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textMuted, letterSpacing: "0.1em", marginBottom: 20, fontStyle: "italic", fontWeight: 500 }}>v{entries[0]?.version || APP_VERSION} {entries[0]?.date ? `· ${entries[0].date}` : ""}</div>
      {isFirstAcknowledgement && pinCount > 0 && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: isDark ? "rgba(34,211,238,0.08)" : "rgba(14,116,144,0.07)", border: `1px solid ${isDark ? "rgba(34,211,238,0.3)" : "rgba(14,116,144,0.3)"}`, borderLeft: `3px solid ${isDark ? "rgba(34,211,238,0.8)" : "rgba(14,116,144,0.75)"}`, borderRadius: "0 6px 6px 0", padding: "12px 14px", marginBottom: 18 }}>
          <div style={{ fontSize: 16, color: cyan, marginTop: 1, flexShrink: 0 }}>◉</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, lineHeight: 1.7 }}>
            <strong style={{ color: T.textPrimary, fontWeight: 700 }}>All {pinCount} {pinCount === 1 ? "memory is" : "memories are"} safe.</strong>{" "}<span style={{ fontStyle: "italic" }}>Your data stayed exactly where you left it.</span>
          </div>
        </div>
      )}
      <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 12, fontWeight: 600 }}>{entries.length > 1 ? "what changed since you were last here" : "what's new"}</div>
      {entries.slice(0, 3).map((entry, idx) => (
        <div key={entry.version} style={{ marginBottom: idx < entries.length - 1 ? 18 : 6 }}>
          {entries.length > 1 && <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: purple, letterSpacing: "0.18em", textTransform: "uppercase", marginBottom: 8, fontWeight: 700 }}>v{entry.version} {entry.date && <span style={{ color: T.textMuted, fontWeight: 500 }}>· {entry.date}</span>}</div>}
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
        <button onClick={() => { haptic("medium"); onClose(); }} style={{ background: `${purple}28`, border: `1px solid ${purple}`, color: purple, padding: "10px 22px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", minHeight: 52, fontWeight: 700 }}>continue ✦</button>
      </div>
    </Modal>
  );
}

/* ─── Small UI widgets ──────────────────────────────────────────────────── */
function UpdateBanner({ isDark, onApply, onDismiss }) {
  const cyan = isDark ? "#22d3ee" : "#0e7490";
  return (
    <Banner isDark={isDark} color={cyan} icon="↻" title="a new version is ready" subtitle="your memories will be kept · just refresh to update"
      actions={<><BannerBtn isDark={isDark} onClick={onDismiss}>later</BannerBtn><BannerBtn isDark={isDark} color={cyan} filled onClick={onApply}>refresh</BannerBtn></>} />
  );
}

function BackupNudge({ isDark, daysAgo, onExport, onDismiss }) {
  const cyan = isDark ? "#22d3ee" : "#0e7490";
  return (
    <Banner isDark={isDark} color={cyan} icon="↓" title={`you haven't backed up in ${daysAgo} days`} subtitle="export now for peace of mind ·˚"
      actions={<><BannerBtn isDark={isDark} onClick={onDismiss}>later</BannerBtn><BannerBtn isDark={isDark} color={cyan} filled onClick={onExport}>export</BannerBtn></>} />
  );
}

function OnThisDayNudge({ pin, isDark, onView, onDismiss }) {
  const T = useTheme(isDark);
  const mc = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const years = new Date().getFullYear() - new Date(pin.createdAt).getFullYear();
  const yearLabel = years === 1 ? "a year ago" : `${years} years ago`;
  return (
    <div style={{ position: "fixed", top: "max(72px, calc(env(safe-area-inset-top, 0px) + 72px))", left: "50%", transform: "translateX(-50%)", background: T.panelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: `1px solid ${mc}55`, borderLeft: `3px solid ${mc}`, borderRadius: "0 8px 8px 0", padding: "14px 18px 12px 16px", zIndex: 130, animation: "slideUpIn 0.5s ease", width: "min(420px, calc(100vw - 28px))", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)" }}>
      <button onClick={onDismiss} style={{ position: "absolute", top: 6, right: 10, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4, minWidth: 52, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Dismiss">×</button>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: mc, letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>on this day</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: 15, color: T.textPrimary, fontWeight: 500, lineHeight: 1.4, marginBottom: 8, paddingRight: 20 }}>{yearLabel}, you wrote here…</div>
      <button onClick={onView} style={{ width: "100%", background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: T.textPrimary, fontWeight: 500, marginBottom: 3 }}>{pin.title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{pin.body}</div>
        <div style={{ marginTop: 6, fontFamily: "'Lora',serif", fontSize: 11, color: mc, letterSpacing: "0.14em", fontWeight: 700 }}>revisit →</div>
      </button>
    </div>
  );
}

function WelcomeModal({ onStartTour, onSkip }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center", animation: "fadeIn 0.35s ease", padding: 16, overflowY: "auto" }}>
      <div className="yr-modal" style={{ width: 450, maxWidth: "100%", background: "rgba(11,10,17,0.98)", border: "1px solid rgba(168,85,247,0.25)", borderTop: "2px solid rgba(168,85,247,0.85)", borderRadius: "0 0 8px 8px", padding: "38px 32px 30px", boxShadow: "0 32px 80px rgba(0,0,0,0.7)" }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: "rgba(232,228,217,0.6)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 16, fontWeight: 600 }}>welcome</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 30, fontWeight: 500, color: "#ffffff", letterSpacing: "0.03em", lineHeight: 1, marginBottom: 8 }}>Welcome to Yearning</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(232,228,217,0.7)", fontStyle: "italic", letterSpacing: "0.1em", marginBottom: 24 }}>leave a part of yourself somewhere</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14.5, color: "rgba(232,228,217,0.92)", lineHeight: 1.85, fontStyle: "italic" }}>A quiet place to plant your thoughts, feelings, and memories exactly where they happened — anywhere on earth.</div>
        {[
          { bg: "rgba(8,145,178,", col: "#22d3ee", icon: "◉", head: "Your memories never leave your device.", body: "Everything is stored locally — no servers, no accounts, no tracking." },
          { bg: "rgba(168,85,247,", col: "#c084fc", icon: "↻", head: "Updates won't erase your memories.", body: "Every new version safely keeps everything you've ever planted." },
        ].map(({ bg, col, icon, head, body }) => (
          <div key={head} style={{ display: "flex", alignItems: "flex-start", gap: 14, background: `${bg}0.1)`, border: `1px solid ${bg}0.3)`, borderLeft: `3px solid ${bg}0.75)`, padding: "14px 16px", margin: "24px 0 14px", borderRadius: "0 6px 6px 0" }}>
            <div style={{ fontSize: 16, color: col, marginTop: 1, flexShrink: 0 }}>{icon}</div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(232,228,217,0.92)", lineHeight: 1.8 }}><span style={{ color: "#fff", fontStyle: "italic", fontWeight: 600 }}>{head}</span><br />{body}</div>
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <button onClick={() => { haptic("light"); onSkip(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.16)", color: "rgba(232,228,217,0.7)", fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.16em", cursor: "pointer", padding: "11px 20px", borderRadius: 6, minHeight: 52, fontWeight: 500 }}>skip tour</button>
          <button onClick={() => { haptic("medium"); onStartTour(); }} style={{ background: "rgba(168,85,247,0.18)", border: "1px solid rgba(168,85,247,0.7)", color: "rgba(216,180,254,1)", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.2em", padding: "12px 28px", borderRadius: 6, cursor: "pointer", minHeight: 52, fontWeight: 700 }}>show me around →</button>
        </div>
      </div>
    </div>
  );
}

function FirstPlantNudge({ isDark, onPlantHere, onPlantWhere, onDismiss, hasLocation }) {
  const T = useTheme(isDark);
  const purple = isDark ? "#a855f7" : "#6d28d9";
  return (
    <div style={{ position: "fixed", bottom: "max(120px, calc(env(safe-area-inset-bottom, 0px) + 120px))", left: "50%", transform: "translateX(-50%)", background: T.panelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: `1px solid ${purple}50`, borderLeft: `3px solid ${purple}`, borderRadius: "0 8px 8px 0", padding: "16px 18px 14px", zIndex: 120, animation: "fadeUp 0.4s ease", width: "min(360px, calc(100vw - 28px))", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)" }}>
      <button onClick={onDismiss} style={{ position: "absolute", top: 8, right: 10, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4, minWidth: 52, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Dismiss">×</button>
      <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: T.textPrimary, marginBottom: 6, paddingRight: 20, fontWeight: 500 }}>you're somewhere right now ✦</div>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", lineHeight: 1.7, marginBottom: 14 }}>This moment will pass. Plant a thought here so you can come back to it.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={onDismiss} style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "9px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.1em", minHeight: 52, fontWeight: 500 }}>not now</button>
        <button onClick={hasLocation ? onPlantHere : onPlantWhere} style={{ background: `${purple}28`, border: `1px solid ${purple}`, color: purple, padding: "9px 18px", borderRadius: 6, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 12.5, letterSpacing: "0.12em", minHeight: 52, fontWeight: 700, flex: 1 }}>
          {hasLocation ? "plant where I am ✦" : "plant first thought →"}
        </button>
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
    const r = target.getBoundingClientRect(); setRect(r);
    setTimeout(() => {
      if (!tipRef.current) return;
      const tipH = tipRef.current.offsetHeight || 170, tipW = 240;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = Math.max(r.width, r.height) / 2 + 12;
      let tipTop = cy + rad + 14;
      if (tipTop + tipH > window.innerHeight - 20) tipTop = Math.max(20, cy - rad - tipH - 14);
      let tipLeft = Math.max(14, Math.min(cx - tipW / 2, window.innerWidth - tipW - 14));
      setTipPos({ top: tipTop, left: tipLeft });
    }, 0);
  }, [step]);
  if (!rect) return null;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, rad = Math.max(rect.width, rect.height) / 2 + 12;
  const { title, desc } = TOUR_STEPS[step];
  return (
    <>
      <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 999, pointerEvents: "none", animation: "fadeIn 0.2s ease" }} />
      <div className="yr-spotlight" style={{ left: cx - rad, top: cy - rad, width: rad * 2, height: rad * 2 }} />
      <div ref={tipRef} className="yr-tour-tip" style={{ top: tipPos.top, left: tipPos.left }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: "rgba(216,180,254,0.9)", letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 6, fontWeight: 600 }}>{step + 1} of {total}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#fff", marginBottom: 8, lineHeight: 1.3, fontWeight: 500 }}>{title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(232,228,217,0.92)", lineHeight: 1.7, fontStyle: "italic", marginBottom: 14 }}>{desc}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => { haptic("light"); onSkip(); }} style={{ background: "transparent", border: "none", color: "rgba(232,228,217,0.6)", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", cursor: "pointer", padding: 4, fontWeight: 500, minHeight: 52, minWidth: 52 }}>skip</button>
          <div style={{ display: "flex", gap: 6 }}>
            {step > 0 && <button onClick={() => { haptic("light"); onPrev(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.18)", color: "rgba(232,228,217,0.85)", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", cursor: "pointer", padding: "7px 14px", borderRadius: 5, minHeight: 52, fontWeight: 500 }}>← back</button>}
            <button onClick={() => { haptic("medium"); onNext(); }} style={{ background: "rgba(168,85,247,0.2)", border: "1px solid rgba(168,85,247,0.7)", color: "rgba(216,180,254,1)", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.18em", cursor: "pointer", padding: "7px 16px", borderRadius: 5, minHeight: 52, fontWeight: 700 }}>{step === total - 1 ? "begin ✦" : "next →"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── FIX: Expandable place search ─────────────────────────────────────────
   Problems fixed:
   1. On mobile, when the input expands, it was causing layout shifts and the
      virtual keyboard would push/reflow the entire fixed toolbar. Now the
      dropdown is rendered via a portal-style fixed div whose position is
      computed in JS, so it never interacts with the toolbar's flex layout.
   2. The input is now contained within the 44px button height — it does NOT
      expand the toolbar width, which was causing controls to overflow on small
      screens. Instead the input overlays the map area using a separate fixed div.
   3. The map-container touch-action is preserved; we explicitly stop propagation
      on the input container so map interactions don't interfere.
────────────────────────────────────────────────────────────────────────────── */
function ExpandableSearch({ isDark }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const inputRef = useRef(null);
  const btnRef = useRef(null);
  const containerRef = useRef(null);
  const timerRef = useRef(null);
  const T = useTheme(isDark);
  const accent = isDark ? "rgba(192,132,252,0.65)" : "rgba(109,40,217,0.65)";

  // Compute dropdown position anchored to the search button
  const updateDropdownPos = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - r.right - 8);
    setDropdownPos({ center: r.bottom, left: r.right + 6, width: w });
  }, []);

  useEffect(() => {
    if (open) {
      updateDropdownPos();
      setTimeout(() => inputRef.current?.focus(), 80);
    } else {
      setQuery(""); setResults([]);
    }
  }, [open, updateDropdownPos]);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    clearTimeout(timerRef.current); setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`, { headers: { "Accept-Language": "en" } });
        setResults(await res.json());
      } catch { setResults([]); } finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [query]);

  const flyTo = (r) => {
    haptic("light");
    window.__yearningMap?.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 12, { duration: 1.5 });
    setQuery(""); setResults([]); setOpen(false);
  };

  const collapse = () => { haptic("light"); setOpen(false); };

  const pillBg = isDark ? "rgba(11,10,17,0.92)" : "#ffffff";
  const pillBorder = isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";

  return (
    <>
      {/* The trigger button — always 44×44, never grows */}
      <div id="search-expand-btn" ref={btnRef} style={{ position: "relative" }}>
        <button
          onClick={() => { haptic("light"); setOpen(o => !o); }}
          style={{
            width: 54, height: 54, borderRadius: 12, background: open ? (isDark ? "rgba(192,132,252,0.15)" : "rgba(109,40,217,0.1)") : pillBg,
            backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
            border: `1px solid ${open ? accent : pillBorder}`,
            color: open ? (isDark ? "#c084fc" : "#6d28d9") : T.toolColor,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, transition: "all 0.18s",
            boxShadow: isDark ? "0 2px 12px rgba(0,0,0,0.4)" : "0 2px 12px rgba(0,0,0,0.12)",
            WebkitTapHighlightColor: "transparent",
          }}
          aria-label="Search places"
        >
          ⌖
        </button>
      </div>

      {/* FIX: Search input rendered as fixed overlay so it never affects layout flow */}
      {open && (
        <>
          {/* Backdrop to close on outside tap — covers map but not UI elements */}
          <div
            onClick={collapse}
            style={{ position: "fixed", inset: 0, zIndex: 490 }}
          />

          {/* Floating search panel — fixed position computed from button rect */}
          <div
            ref={containerRef}
            onClick={e => e.stopPropagation()}
            style={{
              position: "fixed",
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: Math.max(dropdownPos.width, 240),
              zIndex: 491,
              background: pillBg,
              backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
              border: `1px solid ${accent}`,
              borderRadius: 10,
              boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.6)" : "0 8px 32px rgba(0,0,0,0.18)",
              animation: "fadeUp 0.15s ease",
              overflow: "hidden",
            }}
          >
            {/* Input row */}
            <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", gap: 6 }}>
              <span style={{ color: isDark ? "#c084fc" : "#6d28d9", fontSize: 15, flexShrink: 0 }}>⌖</span>
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") collapse(); }}
                placeholder="search a place…"
                autoComplete="off"
                inputMode="search"
                style={{
                  flex: 1, background: "transparent", border: "none", outline: "none",
                  color: T.textPrimary, fontFamily: "'Lora',serif", fontSize: 16,
                  letterSpacing: "0.04em", minWidth: 0,
                }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "0 4px", minWidth: 32, minHeight: 32, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  aria-label="Clear"
                >×</button>
              )}
            </div>

            {/* Results */}
            {(results.length > 0 || loading) && (
              <div style={{ borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`, maxHeight: 200, overflowY: "auto" }}>
                {loading && results.length === 0 && (
                  <div style={{ padding: "12px 14px", fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textMuted, fontStyle: "italic" }}>searching…</div>
                )}
                {results.map((r, i) => (
                  <div
                    key={i}
                    className="yr-search-result"
                    onClick={() => flyTo(r)}
                  >
                    {r.display_name.split(",").slice(0, 3).join(", ")}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/* ─── FIX: Mood filter tray — dual range slider rewritten for all contexts ──
   Root causes of time travel invisibility:
   1. Overlapping <input type="range"> elements have z-index/pointer-event
      conflicts on desktop and tablet — only one thumb was ever reachable.
   2. The track fill div used percentage math that collapsed to 0 width when
      both thumbs were at defaults (same position = 0% range).
   3. yr-slider-track CSS class thumb styles don't inject reliably in PWA /
      add-to-homescreen contexts where the stylesheet order can differ.
   Fix: use a single custom drag-based slider built entirely in inline styles
   with pointer events, so there's no CSS class dependency and no z-index fight.
──────────────────────────────────────────────────────────────────────────── */

function DualRangeSlider({ min, max, valueMin, valueMax, onChange, accent, isDark, T }) {
  const trackRef = useRef(null);
  const dragging = useRef(null);

  const pct = (v) => ((v - min) / (max - min)) * 100;

  const valueFromPct = (clientX) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return min;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return Math.round((min + ratio * (max - min)) / 86400000) * 86400000;
  };

  const onPointerDown = (which, e) => {
    e.preventDefault();
    e.stopPropagation();
    dragging.current = which;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!dragging.current) return;
    const v = valueFromPct(e.clientX);
    if (dragging.current === "min" && v < valueMax && v >= min) onChange([v, valueMax]);
    if (dragging.current === "max" && v > valueMin && v <= max) onChange([valueMin, v]);
  };

  const onPointerUp = () => { dragging.current = null; };

  const onTrackClick = (e) => {
    const v = valueFromPct(e.clientX);
    const dMin = Math.abs(v - valueMin);
    const dMax = Math.abs(v - valueMax);
    if (dMin < dMax) onChange([Math.min(v, valueMax - 86400000), valueMax]);
    else onChange([valueMin, Math.max(v, valueMin + 86400000)]);
  };

  return (
    <div style={{
      padding: "10px 0 4px",
      userSelect: "none",
      WebkitUserSelect: "none",
      width: "100%",
      boxSizing: "border-box",
    }}>
      {/* Tall container — clips nothing, gives thumbs room to exist */}
      <div style={{
        position: "relative",
        height: 32,           // tall enough: 22px thumb + 5px above + 5px below
        margin: "0 11px",
        boxSizing: "border-box",
      }}>
        {/* Track line — centered vertically inside the tall container */}
        <div
          ref={trackRef}
          onClick={onTrackClick}
          style={{
            position: "absolute",
            left: 0, right: 0,
            top: "50%", transform: "translateY(-50%)",
            height: 4, borderRadius: 2,
            background: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
            cursor: "pointer",
          }}
        />

        {/* Filled range */}
        <div style={{
          position: "absolute",
          top: "50%", transform: "translateY(-50%)",
          height: 4, borderRadius: 2,
          left: `${pct(valueMin)}%`,
          width: `${Math.max(0, pct(valueMax) - pct(valueMin))}%`,
          background: accent,
          opacity: 0.8,
          pointerEvents: "none",
        }} />

        {/* Min thumb */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct(valueMin)}%`,
            transform: "translate(-50%, -50%)",
            width: 22, height: 22,
            borderRadius: "50%",
            background: accent,
            border: "2.5px solid rgba(255,255,255,0.9)",
            boxShadow: `0 2px 8px ${accent}88`,
            cursor: "grab",
            touchAction: "none",
            zIndex: 2,
          }}
          onPointerDown={(e) => onPointerDown("min", e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title={fmtMonthYear(valueMin)}
        />

        {/* Max thumb */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct(valueMax)}%`,
            transform: "translate(-50%, -50%)",
            width: 22, height: 22,
            borderRadius: "50%",
            background: accent,
            border: "2.5px solid rgba(255,255,255,0.9)",
            boxShadow: `0 2px 8px ${accent}88`,
            cursor: "grab",
            touchAction: "none",
            zIndex: 3,
          }}
          onPointerDown={(e) => onPointerDown("max", e)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          title={fmtMonthYear(valueMax)}
        />
      </div>

      {/* Year labels */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontFamily: "'Lora',serif",
        fontSize: 9.5,
        color: T.textFaint,
        letterSpacing: "0.06em",
        marginTop: 6,
        padding: "0 11px",
      }}>
        <span>{new Date(min).getFullYear()}</span>
        <span>{new Date(max).getFullYear()}</span>
      </div>
    </div>
  );
}

function MoodFilterTray({ isDark, activeMoodFilters, onToggle, onClear, dateBounds, dateFilterRange, setDateFilterRange }) {
  const [open, setOpen] = useState(false);
  const [trayPos, setTrayPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef(null);
  const T = useTheme(isDark);
  const moods = getMoods(isDark);
  const hasActive = activeMoodFilters.size > 0;
  const accent = isDark ? "#a855f7" : "#6d28d9";

  const dateActive = dateBounds && dateFilterRange &&
    (dateFilterRange[0] !== dateBounds[0] || dateFilterRange[1] !== dateBounds[1]);
  const anyActive = hasActive || dateActive;

  const handleOpen = () => {
    haptic("light");
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setTrayPos({
        top: rect.top,
        left: rect.right + 6,
      });
    }
    setOpen(o => !o);
  };

  return (
    <>
      <div id="btn-filter" ref={btnRef} style={{ position: "relative", zIndex: 115 }}>
        <button
          onClick={handleOpen}
          style={{
            width: 54, height: 54, borderRadius: 12, cursor: "pointer",
            background: open ? `${accent}22` : T.toolBg,
            backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
            border: `1px solid ${open || anyActive ? accent : T.toolBorder}`,
            color: open || anyActive ? accent : T.toolColor,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, transition: "all 0.18s",
            boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
            WebkitTapHighlightColor: "transparent", position: "relative",
          }}
          aria-label="Filter moods"
        >
          <span style={{ fontSize: 16 }}>⊟</span>
          {anyActive && (
            <span style={{
              position: "absolute", top: 7, right: 7,
              width: 7, height: 7, borderRadius: "50%",
              background: accent, boxShadow: `0 0 6px ${accent}cc`,
              border: `1.5px solid ${T.toolBg}`,
            }} />
          )}
        </button>
      </div>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 108 }} />
          <div style={{
            position: "fixed",
            left: trayPos.left,
            top: trayPos.center,
            zIndex: 109,
            background: T.panelBg,
            backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            border: `1px solid ${accent}40`, borderLeft: `3px solid ${accent}`,
            borderRadius: "0 10px 10px 10px",
            padding: "16px 16px 14px",
            width: "min(260px, calc(100vw - 90px))",
            maxHeight: `calc(100dvh - ${trayPos.top}px - 20px)`,
            overflowY: "auto",
            boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
            animation: "fadeUp 0.2s ease",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700 }}>filter moods</div>
              {anyActive && (
                <button
                  onClick={() => { onClear(); if (dateBounds) setDateFilterRange([dateBounds[0], dateBounds[1]]); }}
                  style={{ background: "transparent", border: "none", fontFamily: "'Lora',serif", fontSize: 10.5, color: accent, cursor: "pointer", letterSpacing: "0.1em", fontWeight: 700, padding: "2px 0", minHeight: 52 }}
                >
                  clear all
                </button>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {moods.map(m => {
                const active = activeMoodFilters.has(m.key);
                const dimmed = hasActive && !active;
                return (
                  <button
                    key={m.key}
                    onClick={() => onToggle(m.key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: active ? `${m.color}18` : "transparent",
                      border: `1px solid ${active ? m.color : T.panelBorder}`,
                      borderRadius: 7, padding: "7px 10px", cursor: "pointer",
                      transition: "all 0.14s", opacity: dimmed ? 0.45 : 1,
                      minHeight: 52, WebkitTapHighlightColor: "transparent",
                    }}
                  >
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, boxShadow: active ? `0 0 7px ${m.color}aa` : "none", flexShrink: 0 }} />
                    <span style={{ fontFamily: "'Lora',serif", fontSize: 12.5, color: active ? m.color : T.textSec, fontWeight: active ? 700 : 500, flex: 1, textAlign: "left", letterSpacing: "0.06em" }}>{m.label}</span>
                    {active && <span style={{ fontSize: 11, color: m.color, fontWeight: 700 }}>✓</span>}
                  </button>
                );
              })}
            </div>

            {dateBounds && dateFilterRange && (
              <>
                <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "14px 0 12px" }} />
                <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
                  time travel
                </div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 11.5, color: T.textSec, fontStyle: "italic", marginBottom: 2, minHeight: 18 }}>
                  {fmtMonthYear(dateFilterRange[0])} — {fmtMonthYear(dateFilterRange[1])}
                </div>
                <DualRangeSlider
                  min={dateBounds[0]}
                  max={dateBounds[1]}
                  valueMin={dateFilterRange[0]}
                  valueMax={dateFilterRange[1]}
                  onChange={setDateFilterRange}
                  accent={accent}
                  isDark={isDark}
                  T={T}
                />
                {dateActive && (
                  <button
                    onClick={() => setDateFilterRange([dateBounds[0], dateBounds[1]])}
                    style={{ background: "transparent", border: "none", fontFamily: "'Lora',serif", fontSize: 10, color: T.textFaint, cursor: "pointer", letterSpacing: "0.12em", padding: "4px 0", display: "block", marginTop: 2 }}
                  >
                    reset dates
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}
    </>
  );
}


/* ─── Overflow / hamburger menu ─────────────────────────────────────────── */
function OverflowMenu({ isDark, onLocate, locationStatus, onReset, onRandom, onToggleHeatmap, showHeatmap, onToggleTheme, onExportImport, onTipJar, onHelp, onPlaceMode, placingActive, onSearchMemories }) {
  const [open, setOpen] = useState(false);
  const T = useTheme(isDark);
  const accent = isDark ? "#a855f7" : "#6d28d9";

  const items = [
    { id: "btn-search-mem", icon: "⌕", label: "Search memories", action: onSearchMemories },
    { icon: "+", label: placingActive ? "Cancel placing" : "Tap anywhere +", action: onPlaceMode, active: placingActive },
    { icon: "⌘", label: showHeatmap ? "Hide heatmap" : "Show heatmap", action: onToggleHeatmap, active: showHeatmap },
    null,
    { icon: "◑", label: "Toggle theme", action: onToggleTheme },
    { icon: "⬇", label: "Export / Import", action: onExportImport },
    { icon: "☕", label: "Support", action: onTipJar },
    { icon: "i", label: "Help center", action: onHelp, italic: true },
  ];

  const close = () => setOpen(false);

  return (
    <>
      <button
        id="btn-menu"
        onClick={() => { haptic("light"); setOpen(o => !o); }}
        style={{
          width: 54, height: 54, borderRadius: 12, cursor: "pointer",
          background: open ? `${accent}22` : T.toolBg,
          backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
          border: `1px solid ${open ? accent : T.toolBorder}`,
          color: open ? accent : T.toolColor,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 18, transition: "all 0.18s",
          boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
          WebkitTapHighlightColor: "transparent",
        }}
        aria-label="More options"
      >
        {open ? "×" : "≡"}
      </button>

      {open && (
        <>
          <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 118 }} />
          <div style={{
            position: "absolute", top: 54, right: 0,
            background: T.panelBg,
            backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
            border: `1px solid ${T.panelBorder}`, borderTop: `2px solid ${accent}`,
            borderRadius: "0 0 10px 10px",
            minWidth: 188,
            boxShadow: isDark ? "0 12px 40px rgba(0,0,0,0.6)" : "0 12px 40px rgba(0,0,0,0.18)",
            zIndex: 119,
            animation: "slideDown 0.18s ease",
            overflow: "hidden",
          }}>
            {items.map((item, i) => {
              if (item === null) return <div key={`div-${i}`} style={{ height: 1, background: T.panelBorder, margin: "4px 0" }} />;
              const { id, icon, label, action, active, italic } = item;
              return (
                <button
                  key={label} id={id}
                  onClick={() => { haptic("light"); action(); close(); }}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", gap: 12,
                    background: active ? `${accent}12` : "transparent",
                    border: "none", cursor: "pointer", padding: "14px 16px",
                    transition: "background 0.12s", WebkitTapHighlightColor: "transparent",
                    minHeight: 52,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)"}
                  onMouseLeave={e => e.currentTarget.style.background = active ? `${accent}12` : "transparent"}
                >
                  <span style={{ width: 20, textAlign: "center", fontSize: 15, color: active ? accent : T.textMuted, display: "inline-block", fontStyle: italic ? "italic" : "normal", fontFamily: italic ? "'Lora',serif" : "inherit", flexShrink: 0 }}>{icon}</span>
                  <span style={{ fontFamily: "'Lora',serif", fontSize: 13, color: active ? accent : T.textSec, letterSpacing: "0.06em", fontWeight: active ? 700 : 500 }}>{label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

/* ─── Found popup ───────────────────────────────────────────────────────── */
function FoundPopup({ lat, lng, mapInstance }) {
  const [pos, setPos] = useState(null);
  useEffect(() => {
    if (!mapInstance) return;
    const update = () => { const pt = mapInstance.latLngToContainerPoint([lat, lng]); setPos({ x: pt.x, y: pt.y }); };
    update(); mapInstance.on("move zoom", update);
    return () => mapInstance.off("move zoom", update);
  }, [lat, lng, mapInstance]);
  if (!pos) return null;
  return <div className="yr-found-popup" style={{ left: pos.x, top: pos.y }}>Found you ✦</div>;
}

/* ─── Pin card ──────────────────────────────────────────────────────────── */
function PinCard({ pin, mapInstance, isDark, onClose, onForget, onEdit, onShare }) {
  const T = useTheme(isDark);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });
  const mc = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const moodLabel = pin.moodLabel || getMoodByKey(pin.mood, isDark).label;
  const place = [pin.city, pin.country].filter(Boolean).join(", ");
  const editable = pin.createdAt && (Date.now() - pin.createdAt < EDIT_WINDOW_MS);
  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const pt = mapInstance.latLngToContainerPoint([pin.lat, pin.lng]);
      const cardW = Math.min(340, window.innerWidth - 28);
      const left = Math.max(14, Math.min(pt.x - cardW / 2, window.innerWidth - cardW - 14));
      const cardEstH = 280;
      let top = pt.y + 44;
      if (top + cardEstH > window.innerHeight - 20) top = Math.max(14, pt.y - cardEstH - 24);
      setPos({ left, top, width: cardW });
    };
    update(); mapInstance.on("move zoom", update);
    return () => mapInstance.off("move zoom", update);
  }, [pin, mapInstance]);
  return (
    <div className="yr-pin-card" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      <div style={{ background: T.panelBg, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: `1px solid ${mc}40`, borderLeft: `4px solid ${mc}`, borderRadius: "0 8px 8px 0", padding: "18px 18px 14px", boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)", maxHeight: "min(54vh, 420px)", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1, paddingRight: 10 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: mc, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 5, fontWeight: 700 }}>{moodLabel} · {pin.date}</div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 500, color: T.textPrimary, lineHeight: 1.3 }}>{pin.title}</div>
          </div>
          <button onClick={() => { haptic("light"); onClose(); }} style={{ background: "transparent", border: "none", color: T.textSec, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0, flexShrink: 0, minWidth: 52, minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Close">×</button>
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.85, fontStyle: "italic" }}>{pin.body}</div>
        {pin.editedAt && <div style={{ marginTop: 8, fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, fontStyle: "italic", letterSpacing: "0.04em" }}>edited {new Date(pin.editedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.panelBorder}` }}>
          {place && <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: T.textPrimary, letterSpacing: "0.06em", marginBottom: 2, fontWeight: 600 }}>{place}</div>}
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.06em", fontWeight: 500, marginBottom: 10 }}>{pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {editable && <button onClick={() => { haptic("light"); onEdit(pin); }} style={{ background: "transparent", border: "none", color: isDark ? "#c084fc" : "#6d28d9", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 52, fontWeight: 700 }}>✎ edit</button>}
              <button onClick={() => { haptic("light"); onShare(pin); }} style={{ background: "transparent", border: "none", color: T.textPrimary, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 52, fontWeight: 600 }}>↗ share</button>
            </div>
            <button onClick={() => { haptic("medium"); onForget(pin.id); }} style={{ background: "transparent", border: "none", color: isDark ? "rgba(252,165,165,0.75)" : "rgba(185,28,28,0.85)", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 52, fontWeight: 600 }}>forget this</button>
          </div>
          {!editable && pin.createdAt && <div style={{ marginTop: 6, fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, fontStyle: "italic", letterSpacing: "0.06em" }}>edits closed · 24h window has passed</div>}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export default function Yearning() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const heatmapMarkersRef = useRef([]);
  const leafletRef = useRef(null);
  const pinchActiveRef = useRef(false);
  const lastTouchEndRef = useRef(0);
  const lastNotifTimeRef = useRef(0);
  const lastNotifLocRef = useRef(null);
  const geocodeQueueRef = useRef([]);
  const geocodingRef = useRef(false);
  const homeCenterRef = useRef([20, 0]); // 

  // ── FIX: Long press refs ──
  // Track touch state precisely to distinguish a long-press from a scroll/pan.
  const pressTimerRef = useRef(null);
  const pressStartPosRef = useRef(null);  // { x, y, latlng }
  const pressFiredRef = useRef(false);    // did the long-press action fire?
  const LONG_PRESS_MS = 550;
  const LONG_PRESS_MOVE_PX = 10; // cancel if finger moves more than this

  const [pins, setPins] = useState(loadPinsWithMigration);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [mode, setMode] = useState("idle");
  const [placingCoords, setPlacingCoords] = useState(null);
  const [editingPin, setEditingPin] = useState(null);
  const [sharingPin, setSharingPin] = useState(null);
  const [anniversaryHint, setAnniversaryHint] = useState(null);
  const [isDark, setIsDark] = useState(() => getStoredTheme() === "dark");
  const [mapReady, setMapReady] = useState(false);
  const [toast, setToast] = useState("");
  const [userLatLng, setUserLatLng] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [forgetTargetId, setForgetTargetId] = useState(null);
  const [foundPopup, setFoundPopup] = useState(null);
  const [showTipJar, setShowTipJar] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [showFirstNudge, setShowFirstNudge] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [whatsNewIsFirstAck, setWhatsNewIsFirstAck] = useState(false);
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [notifPermission, setNotifPermission] = useState("default");
  const [onboardPhase, setOnboardPhase] = useState("loading");
  const [tourStep, setTourStep] = useState(0);
  const [showMemorySearch, setShowMemorySearch] = useState(false);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [activeMoodFilters, setActiveMoodFilters] = useState(() => new Set());
  const [dateFilterRange, setDateFilterRange] = useState(null);
  const [lastBackupAt, setLastBackupAtState] = useState(getLastBackupAt());
  const [showBackupNudge, setShowBackupNudge] = useState(false);
  const [onThisDayPin, setOnThisDayPin] = useState(null);
  const T = useTheme(isDark);
  const toastTimer = useRef(null);
  const showToast = useCallback((msg, ms = 2400) => { setToast(msg); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), ms); }, []);

  /* ─── Theme ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    setStoredTheme(isDark ? "dark" : "light");
    document.body.classList.toggle("theme-light", !isDark);
    let m = document.querySelector("meta[name=theme-color]");
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", "theme-color"); document.head.appendChild(m); }
    m.setAttribute("content", isDark ? "#0a0a0f" : "#f5f3ee");
  }, [isDark]);

  useEffect(() => { rawSavePins(pins); }, [pins]);
  useEffect(() => { getFirstRunAt(); }, []);
  useEffect(() => { if ("Notification" in window) setNotifPermission(Notification.permission); }, []);

  /* ─── Onboarding ────────────────────────────────────────────────────── */
  useEffect(() => {
    const onboarded = ls.get(K.ONBOARDED);
    const lastVersion = getLastSeenVersion();
    if (!onboarded) { setOnboardPhase("welcome"); return; }
    if (compareVersions(lastVersion, APP_VERSION) < 0) { setOnboardPhase("idle"); setShowWhatsNew(true); setWhatsNewIsFirstAck(true); }
    else setOnboardPhase("idle");
  }, []);

  useEffect(() => { registerServiceWorker(reg => { window.__yearningWaitingWorker = reg.waiting; setShowUpdateBanner(true); }); }, []);

  useEffect(() => { if (onboardPhase !== "idle" || pins.length > 0) return; const t = setTimeout(() => setShowFirstNudge(true), 1500); return () => clearTimeout(t); }, [onboardPhase, pins.length]);

  useEffect(() => {
    if (onboardPhase !== "idle" || pins.length === 0 || showWhatsNew || showFirstNudge) return;
    if (lastBackupAt && daysBetween(lastBackupAt, Date.now()) < BACKUP_NUDGE_DAYS) return;
    if (!lastBackupAt && pins.length < 5) return;
    const t = setTimeout(() => setShowBackupNudge(true), lastBackupAt ? 3000 : 4500);
    return () => clearTimeout(t);
  }, [onboardPhase, pins.length, lastBackupAt, showWhatsNew, showFirstNudge]);

  useEffect(() => {
    if (onboardPhase !== "idle" || pins.length === 0 || getAnnivDismissed() === todayKey()) return;
    const now = new Date();
    const match = pins.filter(p => p.createdAt && isSameDayOfYear(p.createdAt, now.getTime()))
      .map(p => ({ pin: p, years: now.getFullYear() - new Date(p.createdAt).getFullYear() }))
      .filter(x => [1, 2, 5].includes(x.years)).sort((a, b) => b.years - a.years)[0];
    if (match) { const t = setTimeout(() => setOnThisDayPin(match.pin), 5500); return () => clearTimeout(t); }
  }, [onboardPhase, pins]);

  /* ─── Geocode queue ─────────────────────────────────────────────────── */
  useEffect(() => {
    const needs = pins.filter(p => !p.city && !p.country);
    if (needs.length === 0) return;
    needs.forEach(p => { if (!geocodeQueueRef.current.find(q => q.id === p.id)) geocodeQueueRef.current.push({ id: p.id, lat: p.lat, lng: p.lng }); });
    const drain = async () => {
      if (geocodingRef.current) return; geocodingRef.current = true;
      while (geocodeQueueRef.current.length > 0) {
        const item = geocodeQueueRef.current.shift();
        const res = await reverseGeocode(item.lat, item.lng);
        if (res.city || res.country) setPins(prev => prev.map(p => p.id === item.id ? { ...p, ...res } : p));
        await new Promise(r => setTimeout(r, 1100));
      }
      geocodingRef.current = false;
    };
    drain();
  }, [pins]);

  /* ─── Location reminders ────────────────────────────────────────────── */
  useEffect(() => {
    if (notifPermission !== "granted" || !("geolocation" in navigator)) return;
    let watchId;
    try {
      watchId = navigator.geolocation.watchPosition(({ coords: { latitude, longitude } }) => {
        const now = Date.now();
        if (now - lastNotifTimeRef.current < NOTIF_COOLDOWN_MS) return;
        if (lastNotifLocRef.current && distanceKm(latitude, longitude, lastNotifLocRef.current.lat, lastNotifLocRef.current.lng) < NOTIF_COOLDOWN_KM) return;
        const notify = (title, body, cb) => { if (showNotification(title, body, cb)) { lastNotifTimeRef.current = now; lastNotifLocRef.current = { lat: latitude, lng: longitude }; } };
        const nearby = pins.filter(p => distanceKm(latitude, longitude, p.lat, p.lng) <= NEARBY_KM);
        if (nearby.length > 0) {
          const closest = nearby.reduce((a, b) => distanceKm(latitude, longitude, a.lat, a.lng) < distanceKm(latitude, longitude, b.lat, b.lng) ? a : b);
          notify("a memory is close ✦", `"${closest.title}" — ${closest.moodLabel || "a feeling"} you planted here`, () => { setSelectedPinId(closest.id); mapRef.current?.flyTo([closest.lat, closest.lng], 15, { duration: 1.5 }); });
        } else {
          const locs = loadNotifLocs();
          if (!locs.some(l => distanceKm(latitude, longitude, l.lat, l.lng) < 1) && pins.length > 0) {
            notify("you're somewhere new ✦", "plant a memory here before this moment passes", () => mapRef.current?.flyTo([latitude, longitude], 15, { duration: 1.5 }));
            locs.push({ lat: latitude, lng: longitude, at: now }); saveNotifLocs(locs);
          }
        }
      }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 });
    } catch {}
    return () => { if (watchId !== undefined) try { navigator.geolocation.clearWatch(watchId); } catch {} };
  }, [notifPermission, pins]);

  /* ─── Date bounds & filter range ───────────────────────────────────── */
  const dateBounds = useMemo(() => {
    const stamps = pins.map(p => p.createdAt || 0).filter(Boolean);
    if (stamps.length === 0) return null;
    const min = Math.min(...stamps);
    return [min, Date.now()];
  }, [pins]);

useEffect(() => {
    if (!dateBounds) { setDateFilterRange(null); return; }
    setDateFilterRange(prev => {
      if (!prev) return [dateBounds[0], dateBounds[1]];
      // If the user's max thumb was already at (or near) the previous ceiling,
      // treat it as "pinned to now" and extend it to the new ceiling so that
      // freshly planted pins are never filtered out.
      const prevWasAtCeiling = prev[1] >= dateBounds[1] - 86400000 * 2;
      return [
        Math.max(prev[0], dateBounds[0]),
        prevWasAtCeiling ? dateBounds[1] : Math.min(prev[1], dateBounds[1]),
      ];
    });
  }, [dateBounds]);

  const filteredPins = useMemo(() => pins.filter(p => {
    if (dateFilterRange && p.createdAt && (p.createdAt < dateFilterRange[0] || p.createdAt > dateFilterRange[1])) return false;
    if (activeMoodFilters.size > 0 && !activeMoodFilters.has(p.mood)) return false;
    return true;
  }), [pins, dateFilterRange, activeMoodFilters]);

  const stats = useMemo(() => {
    const citySet = new Set(), countrySet = new Set();
    pins.forEach(p => {
      if (p.city && p.city.trim()) citySet.add(p.city.trim());
      if (p.country && p.country.trim()) countrySet.add(p.country.trim());
    });
    return { cities: citySet.size, countries: countrySet.size };
  }, [pins]);

  const listeningDays = useMemo(() => Math.max(1, daysBetween(getFirstRunAt(), Date.now())), []);

  /* ─── Map initialization ────────────────────────────────────────────── */
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;
    const init = async () => {
      if (!document.getElementById("leaflet-css")) {
        const link = Object.assign(document.createElement("link"), { id: "leaflet-css", rel: "stylesheet", href: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" });
        document.head.appendChild(link);
      }
      const L = (await import("https://esm.sh/leaflet@1.9.4")).default;
      leafletRef.current = L;
      const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
      zoomControl: false, worldCopyJump: true, minZoom: 3, maxZoom: 18,
        attributionControl: true,
        // FIX: tap:false disables Leaflet's own tap handler which interferes with
        // our custom long-press on mobile. We handle all touch events manually.
        tap: false,
        touchZoom: true, doubleClickZoom: false, scrollWheelZoom: true, dragging: true,
      });
      mapRef.current = map; window.__yearningMap = map;
      const tile = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19 });
      tile.addTo(map); tileLayerRef.current = tile;
      map.setMaxBounds([[-90, -Infinity], [90, Infinity]]);
      map.on("drag", () => {
      map.panInsideBounds([[-85, -Infinity], [85, Infinity]], { animate: false });
      });

      /* ── FIX: Long press — rewritten for mobile/tablet reliability ──────
         Root causes of the original failure:
         1. Using map.on("mousedown touchstart") mixes mouse and touch events.
            On iOS/Android, "touchstart" fires but "mousedown" sometimes fires
            too (synthetic), doubling the handler. We listen on the raw DOM node
            to avoid Leaflet's event normalization.
         2. The original detected movement via Leaflet's containerPoint which
            requires a latlng — not always available on touchmove. We use raw
            clientX/Y instead.
         3. Leaflet's internal touch handlers (scroll, pinch) intercept touches
            before our listeners on some Android Chrome versions. We use
            { passive: true } for move/end so we don't block Leaflet but still
            track position.
         4. On iOS Safari, a long-press triggers the system context menu (image
            save, selection handles). We prevent that with -webkit-touch-callout
            on the container and preventDefault on contextmenu.
      ────────────────────────────────────────────────────────────────────── */
      const container = mapContainerRef.current;

      // Prevent iOS long-press system menu
      container.style.webkitTouchCallout = "none";
      container.style.userSelect = "none";
      container.style.webkitUserSelect = "none";
      container.addEventListener("contextmenu", e => e.preventDefault());

      const cancelPress = () => {
        clearTimeout(pressTimerRef.current);
        pressTimerRef.current = null;
        pressStartPosRef.current = null;
      };

      const onTouchStart = (e) => {
        // Only single finger, not pinch
        if (e.touches.length !== 1) { cancelPress(); pinchActiveRef.current = true; return; }
        pinchActiveRef.current = false;
        pressFiredRef.current = false;

        const touch = e.touches[0];
        const startX = touch.clientX, startY = touch.clientY;

        // Convert pixel position to latlng
        const containerRect = container.getBoundingClientRect();
        const px = L.point(startX - containerRect.left, startY - containerRect.top);
        const latlng = map.containerPointToLatLng(px);

        pressStartPosRef.current = { x: startX, y: startY, latlng };

        pressTimerRef.current = setTimeout(() => {
          if (!pressStartPosRef.current) return;
          // Check if a UI element was touched — don't fire on buttons/modals
          const el = document.elementFromPoint(startX, startY);
          if (el && el.closest("button, input, textarea, .yr-pin-card, .yr-overlay, .yr-modal, [data-no-longpress]")) {
            cancelPress();
            return;
          }
          pressFiredRef.current = true;
          cancelPress();
          haptic("medium");
          const { latlng: ll } = pressStartPosRef.current || {};
          // Re-read from ref in case it was cleared right before timeout fires
          const coords = pressStartPosRef.current?.latlng ?? latlng;
          setPlacingCoords({ lat: coords.lat, lng: coords.lng });
          setMode("writing");
          setSelectedPinId(null);
        }, LONG_PRESS_MS);
      };

      const onTouchMove = (e) => {
        if (!pressStartPosRef.current) return;
        if (e.touches.length > 1) { cancelPress(); pinchActiveRef.current = true; return; }
        const t = e.touches[0];
        const dx = t.clientX - pressStartPosRef.current.x;
        const dy = t.clientY - pressStartPosRef.current.y;
        if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_PX) cancelPress();
      };

      const onTouchEnd = (e) => {
        cancelPress();
        lastTouchEndRef.current = Date.now();
        setTimeout(() => { pinchActiveRef.current = false; }, 120);
      };

      container.addEventListener("touchstart", onTouchStart, { passive: true });
      container.addEventListener("touchmove", onTouchMove, { passive: true });
      container.addEventListener("touchend", onTouchEnd, { passive: true });
      container.addEventListener("touchcancel", onTouchEnd, { passive: true });

      // Desktop mouse long-press (click-hold)
      let mouseHoldTimer = null;
      let mouseStartPos = null;
      container.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        mouseStartPos = { x: e.clientX, y: e.clientY };
        const containerRect = container.getBoundingClientRect();
        const px = L.point(e.clientX - containerRect.left, e.clientY - containerRect.top);
        const latlng = map.containerPointToLatLng(px);

        mouseHoldTimer = setTimeout(() => {
          if (!mouseStartPos) return;
          const el = document.elementFromPoint(e.clientX, e.clientY);
          if (el && el.closest("button, input, textarea, .yr-pin-card, .yr-overlay, .yr-modal")) return;
          haptic("medium");
          setPlacingCoords({ lat: latlng.lat, lng: latlng.lng });
          setMode("writing");
          setSelectedPinId(null);
          mouseStartPos = null;
        }, LONG_PRESS_MS);
      });
      container.addEventListener("mousemove", (e) => {
        if (!mouseStartPos) return;
        const dx = e.clientX - mouseStartPos.x, dy = e.clientY - mouseStartPos.y;
        if (Math.sqrt(dx * dx + dy * dy) > LONG_PRESS_MOVE_PX) { clearTimeout(mouseHoldTimer); mouseStartPos = null; }
      });
      container.addEventListener("mouseup", () => { clearTimeout(mouseHoldTimer); mouseStartPos = null; });

      // Tap to place / deselect
      map.on("click", e => {
        if (pinchActiveRef.current || Date.now() - lastTouchEndRef.current < 80) return;
        if (e.originalEvent.target?.closest(".yr-pin-card,.yr-overlay,.yr-modal,button,input,textarea")) return;
        if (modeRef.current === "placing") {
          setPlacingCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
          setMode("writing");
        } else {
          setSelectedPinId(null);
        }
      });

      setMapReady(true);

        getIpCenter().then(center => {
        if (!center) return;
        homeCenterRef.current = center;
        if (mapRef.current?.getZoom() === DEFAULT_ZOOM) {
          mapRef.current.flyTo(center, DEFAULT_ZOOM, { duration: 1.2 });
        }
      });

    };
    init();
    return () => { if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; } window.__yearningMap = null; };
  }, []);

  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current) return;
    const L = leafletRef.current;
    if (tileLayerRef.current) try { mapRef.current.removeLayer(tileLayerRef.current); } catch {}
    const tile = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19 });
    tile.addTo(mapRef.current); tileLayerRef.current = tile;
  }, [isDark, mapReady]);

  /* ─── Markers ───────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current) return;
    const L = leafletRef.current, map = mapRef.current;
    [...markersRef.current, ...heatmapMarkersRef.current].forEach(m => { try { map.removeLayer(m); } catch {} });
    markersRef.current = []; heatmapMarkersRef.current = [];

    if (showHeatmap) {
      filteredPins.forEach(p => {
        const mc = p.moodColor || getMoodByKey(p.mood, isDark).color;
        [28, 42, 56].forEach((r, i) => { const c = L.circleMarker([p.lat, p.lng], { radius: r, fillColor: mc, fillOpacity: 0.18 - i * 0.05, stroke: false, interactive: false }); c.addTo(map); heatmapMarkersRef.current.push(c); });
      });
      return;
    }

    filteredPins.forEach(p => {
      const mc = p.moodColor || getMoodByKey(p.mood, isDark).color;
      const sel = selectedPinId === p.id;
      const w = sel ? 28 : 22, h = sel ? 38 : 30;
      const stroke = isDark ? "rgba(11,10,17,0.95)" : "rgba(252,250,247,0.98)";
      const html = `<div style="position:relative;width:${w}px;height:${h}px;transform:translateY(-${h/2 - w/2}px)"><svg width="${w}" height="${h}" viewBox="0 0 24 32" style="position:absolute;inset:0;filter:drop-shadow(0 0 ${sel ? 12 : 7}px ${mc}dd) drop-shadow(0 0 ${sel ? 22 : 14}px ${mc}88) drop-shadow(0 2px 4px rgba(0,0,0,0.5));transition:all 0.2s" xmlns="http://www.w3.org/2000/svg"><path d="M12 1 C6 1 1.5 5.5 1.5 11 C1.5 15.5 5 20.5 9 25.5 C10.2 27.1 11.1 28.6 12 30.5 C12.9 28.6 13.8 27.1 15 25.5 C19 20.5 22.5 15.5 22.5 11 C22.5 5.5 18 1 12 1 Z" fill="${mc}" stroke="none"/></svg>${sel ? `<div style="position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:${w*.9}px;height:${w*.9}px;border-radius:50%;border:1.5px solid ${mc}88;animation:pulseRing 1.4s ease-out infinite"></div>` : ""}</div>`;
      const icon = L.divIcon({ html, className: "yr-pin-icon", iconSize: [w, h], iconAnchor: [w/2, h - w/2] });
      const marker = L.marker([p.lat, p.lng], { icon, riseOnHover: true });
      marker.on("click", e => { L.DomEvent.stopPropagation(e); haptic("light"); setSelectedPinId(p.id); setMode("idle"); });
      marker.addTo(map); markersRef.current.push(marker);
    });
  }, [filteredPins, selectedPinId, mapReady, isDark, showHeatmap]);

  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current) return;
    const L = leafletRef.current, map = mapRef.current;
    if (userMarkerRef.current) { try { map.removeLayer(userMarkerRef.current); } catch {} userMarkerRef.current = null; }
    if (!userLatLng) return;
    const html = `<div style="position:relative;width:18px;height:18px"><div style="position:absolute;inset:0;background:#22d3ee;border-radius:50%;border:2px solid white;box-shadow:0 0 12px #22d3eecc"></div><div style="position:absolute;inset:-8px;border-radius:50%;background:#22d3ee44;animation:gps-pulse 2s ease-in-out infinite"></div></div>`;
    const icon = L.divIcon({ html, className: "yr-user-marker", iconSize: [18, 18], iconAnchor: [9, 9] });
    const m = L.marker([userLatLng.lat, userLatLng.lng], { icon, interactive: false, zIndexOffset: 1000 });
    m.addTo(map); userMarkerRef.current = m;
  }, [userLatLng, mapReady]);

  /* ─── Actions ───────────────────────────────────────────────────────── */
const locate = useCallback(() => {
  if (!("geolocation" in navigator)) { showToast("location not supported on this device"); return; }
  
  // If browser-level permission is already hard-denied, skip the API call
  // and guide the user directly — navigator.permissions lets us check first.
  if (navigator.permissions) {
    navigator.permissions.query({ name: "geolocation" }).then(status => {
      if (status.state === "denied") {
        showToast("enable location in your browser settings ✦", 4000);
        return;
      }
      doLocate();
    }).catch(() => doLocate());
  } else {
    doLocate();
  }

  function doLocate() {
    haptic("medium"); setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition(
      ({ coords: { latitude, longitude } }) => {
        setUserLatLng({ lat: latitude, lng: longitude }); setLocationStatus("found");
        mapRef.current?.flyTo([latitude, longitude], 14, { duration: 1.6 });
        setFoundPopup({ lat: latitude, lng: longitude });
        setTimeout(() => setFoundPopup(null), 2400);
      },
      (err) => {
        setLocationStatus("denied");
        if (err.code === 1) {
          // PERMISSION_DENIED — browser blocked it
          showToast("enable location in your browser settings ✦", 4000);
        } else if (err.code === 2) {
          showToast("could not determine your position", 3000);
        } else {
          showToast("location request timed out", 3000);
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }
}, [showToast]);

  const tryAnniversary = useCallback((lat, lng) => {
    const week = 7 * 86400000, now = Date.now();
    const near = pins.filter(p => p.createdAt && (now - p.createdAt) > week).map(p => ({ p, d: distanceM(lat, lng, p.lat, p.lng) })).filter(x => x.d <= ANNIV_RADIUS_M).sort((a, b) => a.d - b.d);
    if (near.length > 0) {
      const mo = monthsBetween(near[0].p.createdAt, now);
      const label = mo < 1 ? "earlier this month" : mo === 1 ? "1 month ago" : mo < 12 ? `${mo} months ago` : mo < 24 ? "a year ago" : `${Math.floor(mo / 12)} years ago`;
      const ml = (near[0].p.moodLabel || getMoodByKey(near[0].p.mood, isDark).label).toLowerCase();
      setAnniversaryHint(`${label}, feeling ${ml}`);
    } else setAnniversaryHint(null);
  }, [pins, isDark]);

  const plantHere = useCallback(() => {
    haptic("medium");
    const target = userLatLng || (mapRef.current ? { lat: mapRef.current.getCenter().lat, lng: mapRef.current.getCenter().lng } : null);
    if (!target) return;
    tryAnniversary(target.lat, target.lng);
    setPlacingCoords(target); setMode("writing");
  }, [userLatLng, tryAnniversary]);

  const handleSavePin = (pin) => {
    setPins(prev => [...prev, pin]); setMode("idle"); setPlacingCoords(null); setAnniversaryHint(null);
    showToast("memory planted ✦");
    reverseGeocode(pin.lat, pin.lng).then(r => { if (r.city || r.country) setPins(prev => prev.map(p => p.id === pin.id ? { ...p, ...r } : p)); });
  };
  const handleSaveEdit = (pin) => { setPins(prev => prev.map(p => p.id === pin.id ? pin : p)); setEditingPin(null); showToast("memory updated ✦"); };
  const handleForget = (id) => { setPins(prev => prev.filter(p => p.id !== id)); setSelectedPinId(null); setForgetTargetId(null); showToast("memory forgotten"); };
  const handleImport = (arr) => {
    setPins(prev => { const ids = new Set(prev.map(p => p.id)); return [...prev, ...arr.filter(p => !ids.has(p.id)).map(p => ({ ...p, id: p.id || `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`, createdAt: p.createdAt || Date.now(), city: p.city || "", country: p.country || "" }))]; });
    showToast(`${arr.length} memories imported ✦`);
  };
  const handleExported = () => { const t = Date.now(); setLastBackupAt(t); setLastBackupAtState(t); setShowBackupNudge(false); };
  const resetView = () => { haptic("light"); mapRef.current?.flyTo(homeCenterRef.current, DEFAULT_ZOOM, { duration: 1.4 }); setSelectedPinId(null); setMode("idle"); };
  const randomMemory = () => {
    const pool = filteredPins.length > 0 ? filteredPins : [];
    if (pool.length === 0) {
      showToast(pins.length === 0 ? "plant a memory first ✦" : "no memories match the current filters ✦");
      return;
    }
    haptic("medium");
    const p = pool[Math.floor(Math.random() * pool.length)];
    mapRef.current?.flyTo([p.lat, p.lng], 13, { duration: 1.8 });
    setSelectedPinId(p.id);
  };
  const beginTour = () => { setOnboardPhase("tour"); setTourStep(0); setSelectedPinId(null); };
  const endTour = () => { ls.set(K.ONBOARDED, "1"); setLastSeenVersion(APP_VERSION); setOnboardPhase("idle"); };
  const enableNotifications = async () => { haptic("light"); const granted = await requestNotificationPermission(); setNotifPermission(granted ? "granted" : (Notification?.permission || "denied")); if (granted) showToast("location reminders enabled ✦"); };
  const dismissWhatsNew = () => { setLastSeenVersion(APP_VERSION); setShowWhatsNew(false); setWhatsNewIsFirstAck(false); };
  const applyUpdate = () => { haptic("medium"); try { window.__yearningWaitingWorker?.postMessage({ type: "SKIP_WAITING" }); } catch {} setTimeout(() => window.location.reload(), 600); };
  const toggleMoodFilter = (key) => { haptic("light"); setActiveMoodFilters(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; }); };

  const selectedPin = useMemo(() => pins.find(p => p.id === selectedPinId), [pins, selectedPinId]);
  const showPinCard = selectedPin && !editingPin && !sharingPin && !forgetTargetId;
  const placingActive = mode === "placing";
  const toolStyle = { background: T.toolBg, border: `1px solid ${T.toolBorder}`, color: T.toolColor, boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)" };
  const zoomBtnStyle = { width: 54, height: 54, borderRadius: 12, cursor: "pointer", background: T.toolBg, border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)"}`, color: isDark ? "rgba(232,228,217,0.95)" : "#0a0908", display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)", transition: "all 0.15s", WebkitTapHighlightColor: "transparent" };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div ref={mapContainerRef} style={{ position: "fixed", inset: 0, zIndex: 0 }} />

      {/* Header */}
      <div style={{ position: "fixed", top: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))", left: 14, zIndex: 100 }}>
        <button onClick={resetView} style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "block", textAlign: "left", WebkitTapHighlightColor: "transparent" }} aria-label="Reset map view">
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 700, fontStyle: "italic", color: T.textPrimary, letterSpacing: "0.02em", lineHeight: 1, textShadow: isDark ? "0 2px 12px rgba(0,0,0,0.6)" : "0 1px 6px rgba(255,255,255,0.8)" }}>yearning map</div>
        </button>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, letterSpacing: "0.22em", textTransform: "uppercase", marginTop: 5, fontWeight: 500, fontStyle: "italic", pointerEvents: "none" }}>map of your unspoken thoughts</div>

        <div style={{ marginTop: 10, pointerEvents: "none" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: isDark ? "rgba(168,85,247,0.1)" : "rgba(109,40,217,0.07)", border: `1px solid ${isDark ? "rgba(168,85,247,0.28)" : "rgba(109,40,217,0.22)"}`, borderRadius: 20, padding: "4px 10px 4px 8px" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: isDark ? "#a855f7" : "#6d28d9", boxShadow: isDark ? "0 0 6px #a855f7aa" : "none", flexShrink: 0 }} />
            <span style={{ fontFamily: "'Lora',serif", fontSize: 11.5, fontWeight: 700, color: isDark ? "#c084fc" : "#6d28d9", letterSpacing: "0.06em" }}>{pins.length}</span>
            <span style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.08em", fontWeight: 500 }}>{pins.length === 1 ? "memory" : "memories"}</span>
          </div>
        </div>

        {(stats.cities > 0 || stats.countries > 0) && (
          <div style={{ marginTop: 6, pointerEvents: "none" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {stats.cities > 0 && <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.1em", fontStyle: "italic" }}><span style={{ color: T.textSec, fontWeight: 600, fontStyle: "normal" }}>{stats.cities}</span> {stats.cities === 1 ? "city" : "cities"}</div>}
              {stats.cities > 0 && stats.countries > 0 && <div style={{ width: 2, height: 2, borderRadius: "50%", background: T.textMuted, opacity: 0.5 }} />}
              {stats.countries > 0 && <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.1em", fontStyle: "italic" }}><span style={{ color: T.textSec, fontWeight: 600, fontStyle: "normal" }}>{stats.countries}</span> {stats.countries === 1 ? "country" : "countries"}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Left column: zoom + expandable search */}
      {mapReady && (
       <div style={{ position: "fixed", left: 14, top: "50%", transform: "translateY(-50%)", zIndex: 115, display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start" }}>
  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
    <button aria-label="Zoom in" onClick={() => { haptic("light"); mapRef.current?.zoomIn(); }} style={{ ...zoomBtnStyle, fontSize: 22, fontWeight: 500 }}>+</button>
    <button aria-label="Zoom out" onClick={() => { haptic("light"); mapRef.current?.zoomOut(); }} style={{ ...zoomBtnStyle, fontSize: 24, fontWeight: 500 }}>−</button>
  </div>
  <ExpandableSearch isDark={isDark} />
  <MoodFilterTray
    isDark={isDark}
    activeMoodFilters={activeMoodFilters}
    onToggle={toggleMoodFilter}
    onClear={() => setActiveMoodFilters(new Set())}
    dateBounds={dateBounds}
    dateFilterRange={dateFilterRange}
    setDateFilterRange={setDateFilterRange}
  />
</div>
      )}

      {/* Right toolbar */}
      <div style={{ position: "fixed", top: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))", right: 14, zIndex: 120, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
        <ToolBtn id="btn-locate" title="Locate me" onClick={locate} style={toolStyle}>
          {locationStatus === "locating" ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>◴</span> : "◎"}
        </ToolBtn>
        <ToolBtn id="btn-plant" title="Plant here" onClick={plantHere}
          style={{ background: isDark ? "rgba(168,85,247,0.18)" : "rgba(109,40,217,0.12)", border: `1px solid ${isDark ? "#a855f7" : "#6d28d9"}`, color: isDark ? "#c084fc" : "#6d28d9", boxShadow: isDark ? "0 2px 8px rgba(168,85,247,0.3)" : "0 2px 8px rgba(109,40,217,0.2)" }}>
          ✦
        </ToolBtn>
        <ToolBtn id="btn-reset" title="Reset view" onClick={resetView} style={toolStyle}>⌂</ToolBtn>
        <ToolBtn id="btn-random" title="Random memory" onClick={randomMemory} style={toolStyle}>↝</ToolBtn>
        <div style={{ position: "relative" }}>
          <OverflowMenu
            isDark={isDark}
            onLocate={locate}
            locationStatus={locationStatus}
            onReset={resetView}
            onRandom={randomMemory}
            onToggleHeatmap={() => { haptic("light"); setShowHeatmap(s => !s); }}
            showHeatmap={showHeatmap}
            onToggleTheme={() => setIsDark(d => !d)}
            onExportImport={() => setShowExportImport(true)}
            onTipJar={() => setShowTipJar(true)}
            onHelp={() => setShowHelp(true)}
            onPlaceMode={() => setMode(m => m === "placing" ? "idle" : "placing")}
            placingActive={placingActive}
            onSearchMemories={() => setShowMemorySearch(true)}
          />
        </div>
      </div>

      {/* NOTE: Standalone TimeSlider removed — it now lives inside MoodFilterTray */}

      {foundPopup && mapRef.current && <FoundPopup lat={foundPopup.lat} lng={foundPopup.lng} mapInstance={mapRef.current} />}

      {showPinCard && <PinCard pin={selectedPin} mapInstance={mapRef.current} isDark={isDark} onClose={() => setSelectedPinId(null)} onForget={id => setForgetTargetId(id)} onEdit={p => setEditingPin(p)} onShare={p => setSharingPin(p)} />}

      {mode === "writing" && placingCoords && !editingPin && <WritingModal coords={placingCoords} onSave={handleSavePin} onCancel={() => { setMode("idle"); setPlacingCoords(null); setAnniversaryHint(null); }} isDark={isDark} anniversaryHint={anniversaryHint} />}
      {editingPin && <WritingModal existingPin={editingPin} onSave={handleSaveEdit} onCancel={() => setEditingPin(null)} isDark={isDark} />}
      {sharingPin && <ShareCardModal pin={sharingPin} isDark={isDark} onClose={() => setSharingPin(null)} />}
      {showMemorySearch && <MemorySearchModal pins={pins} isDark={isDark} onClose={() => setShowMemorySearch(false)} onSelect={p => { setShowMemorySearch(false); setSelectedPinId(p.id); mapRef.current?.flyTo([p.lat, p.lng], 14, { duration: 1.6 }); }} />}
      {forgetTargetId && <ForgetModal pin={pins.find(p => p.id === forgetTargetId)} onConfirm={() => handleForget(forgetTargetId)} onCancel={() => setForgetTargetId(null)} isDark={isDark} />}
      {showExportImport && <ExportImportModal pins={pins} onImport={handleImport} onClose={() => setShowExportImport(false)} onExported={handleExported} isDark={isDark} lastBackupAt={lastBackupAt} />}
      {showTipJar && <TipJarModal onClose={() => setShowTipJar(false)} isDark={isDark} />}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} isDark={isDark} onEnableNotifications={enableNotifications} notifPermission={notifPermission} onShowChangelog={() => { setShowHelp(false); setShowWhatsNew(true); setWhatsNewIsFirstAck(false); }} pinCount={pins.length} listeningDays={listeningDays} />}
      {showWhatsNew && <WhatsNewModal entries={CHANGELOG} isFirstAcknowledgement={whatsNewIsFirstAck} onClose={dismissWhatsNew} isDark={isDark} pinCount={pins.length} />}

      {showUpdateBanner && !showWhatsNew && !showBackupNudge && !onThisDayPin && <UpdateBanner isDark={isDark} onApply={applyUpdate} onDismiss={() => setShowUpdateBanner(false)} />}
      {showBackupNudge && !showWhatsNew && !onThisDayPin && <BackupNudge isDark={isDark} daysAgo={lastBackupAt ? daysBetween(lastBackupAt, Date.now()) : Math.min(99, daysBetween(getFirstRunAt(), Date.now()))} onExport={() => { setShowBackupNudge(false); setShowExportImport(true); }} onDismiss={() => { setShowBackupNudge(false); setLastBackupAt(Date.now() - (BACKUP_NUDGE_DAYS - 3) * 86400000); }} />}
      {onThisDayPin && !showWhatsNew && <OnThisDayNudge pin={onThisDayPin} isDark={isDark} onView={() => { const p = onThisDayPin; setOnThisDayPin(null); setAnnivDismissed(); setSelectedPinId(p.id); mapRef.current?.flyTo([p.lat, p.lng], 14, { duration: 1.8 }); }} onDismiss={() => { setOnThisDayPin(null); setAnnivDismissed(); }} />}

      {onboardPhase === "welcome" && <WelcomeModal onStartTour={beginTour} onSkip={endTour} />}
      {onboardPhase === "tour" && <TourOverlay step={tourStep} total={TOUR_STEPS.length} onNext={() => tourStep < TOUR_STEPS.length - 1 ? setTourStep(s => s + 1) : endTour()} onPrev={() => setTourStep(s => Math.max(0, s - 1))} onSkip={endTour} />}

      {showFirstNudge && !showWhatsNew && pins.length === 0 && <FirstPlantNudge isDark={isDark} hasLocation={!!userLatLng} onPlantHere={() => { setShowFirstNudge(false); plantHere(); }} onPlantWhere={() => { setShowFirstNudge(false); setMode("placing"); showToast("tap anywhere on the map ✦", 3000); }} onDismiss={() => setShowFirstNudge(false)} />}

      {placingActive && <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", pointerEvents: "none", zIndex: 90, textAlign: "center", fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: 17, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(10,9,8,0.5)", letterSpacing: "0.08em", animation: "fadeIn 0.3s ease", textShadow: isDark ? "0 2px 12px rgba(0,0,0,0.8)" : "0 2px 12px rgba(255,255,255,0.7)" }}>tap anywhere to plant a thought</div>}

      <Toast msg={toast} isDark={isDark} />
      <SpeedInsights />
      <Analytics />
    </>
  );
}