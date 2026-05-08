import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

/* ─── App version & changelog ───────────────────────────────────────────── */
const APP_VERSION = "1.3.0";
const CHANGELOG = [
  {
    version: "1.3.0",
    date: "May 2026",
    title: "A richer sense of place",
    notes: [
      "Memories now remember the city and country they were planted in — automatically.",
      "Time travel: drag the slider at the bottom to filter memories by date range.",
      "Mood filters: tap any mood chip to see only those memories. Tap more to combine.",
      "Search through everything you've ever written — title, body, place, mood.",
      "Heatmap view: press the new ⌘ button to see where you think the most.",
      "On this day: gentle resurfacing of memories from a year, two, or five years ago.",
      "Anniversary loops: planting near an old memory quietly tells you who you were here before.",
      "Edit memories within 24 hours of planting — for second thoughts and small fixes.",
      "Share a memory as a paper-textured card with its own hand-carved seal.",
      "A new stat in the help center: how long you've been listening to yourself.",
      "Light/dark theme preference now persists across sessions.",
      "Backup nudge: gentle reminder if you haven't exported in 15 days.",
    ],
  },
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
const THEME_KEY       = "yearning_theme";
const LAST_BACKUP_KEY = "yearning_last_backup_at";
const ANNIV_DISMISS_KEY = "yearning_anniv_dismissed_today";
const GEOCACHE_KEY    = "yearning_geocache_v1";
const FIRST_RUN_KEY   = "yearning_first_run_at";
const KOFI_URL        = "https://ko-fi.com/donatetoyearning";
const DEFAULT_CENTER  = [20, 0];
const DEFAULT_ZOOM    = 2;
const TILE_ATTR       = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const TILE_DARK       = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT      = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const NEARBY_RADIUS_KM   = 5;
const NOTIF_COOLDOWN_KM  = 1.0;
const NOTIF_COOLDOWN_MS  = 30 * 60 * 1000;
const CURRENT_SCHEMA     = 3;
const MAX_BACKUPS        = 3;
const BACKUP_NUDGE_DAYS  = 15;
const EDIT_WINDOW_MS     = 24 * 60 * 60 * 1000;
const ANNIVERSARY_RADIUS_M = 50;

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
  { targetId: "btn-search",        title: "Search Memories", desc: "Search through every memory you've ever planted — by title, body, mood, or place." },
  { targetId: "btn-heatmap",       title: "Heatmap ⌘",       desc: "Toggle a soft density view — see where you think the most." },
  { targetId: "btn-reset",         title: "Reset View ⌂",    desc: "Returns the map to the default world view — handy when you're lost in a zoom." },
  { targetId: "btn-theme",         title: "Light / Dark ◑",  desc: "Toggle between a moody dark map and a clean light map. Your choice persists." },
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

const safeGetItem = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSetItem = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

/* ─── Reverse geocoding (cached) ────────────────────────────────────────── */
function loadGeocache() {
  try { return JSON.parse(safeGetItem(GEOCACHE_KEY) || "{}"); } catch { return {}; }
}
function saveGeocache(cache) {
  try {
    const entries = Object.entries(cache);
    if (entries.length > 500) {
      const trimmed = Object.fromEntries(entries.slice(-400));
      safeSetItem(GEOCACHE_KEY, JSON.stringify(trimmed));
    } else {
      safeSetItem(GEOCACHE_KEY, JSON.stringify(cache));
    }
  } catch {}
}
function geocacheKey(lat, lng) {
  // round to ~1km precision so nearby pins share cache
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}
async function reverseGeocode(lat, lng) {
  const cache = loadGeocache();
  const key = geocacheKey(lat, lng);
  if (cache[key]) return cache[key];
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=10&addressdetails=1`,
      { headers: { "Accept-Language": "en" } }
    );
    if (!res.ok) throw new Error("geocode failed");
    const data = await res.json();
    const a = data.address || {};
    const city = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || a.state || "";
    const country = a.country || "";
    const result = { city, country };
    cache[key] = result;
    saveGeocache(cache);
    return result;
  } catch {
    return { city: "", country: "" };
  }
}

/* ─── Seal/glyph generation (deterministic from coords + time) ──────────── */
// Hash function: turn lat/lng/timestamp into a stable seed
function makeSeed(lat, lng, timestamp, city = "") {
  const str = `${lat.toFixed(4)}|${lng.toFixed(4)}|${timestamp}|${city}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
// Mulberry32 PRNG — small, good enough
function makeRng(seed) {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// Generate an organic wax-seal SVG path from a seed
function generateSeal(seed, color = "#a855f7", size = 120) {
  const rng = makeRng(seed);
  const cx = size / 2, cy = size / 2;
  const baseR = size * 0.32;
  const points = 12 + Math.floor(rng() * 4); // 12-15 points
  const path = [];
  for (let i = 0; i < points; i++) {
    const ang = (i / points) * Math.PI * 2;
    const wob = 0.78 + rng() * 0.34; // organic radius wobble
    const r = baseR * wob;
    const x = cx + Math.cos(ang) * r;
    const y = cy + Math.sin(ang) * r;
    path.push([x, y]);
  }
  // Close with smooth curves
  let d = `M ${path[0][0].toFixed(1)} ${path[0][1].toFixed(1)}`;
  for (let i = 0; i < path.length; i++) {
    const cur = path[i];
    const next = path[(i + 1) % path.length];
    const mx = (cur[0] + next[0]) / 2;
    const my = (cur[1] + next[1]) / 2;
    d += ` Q ${cur[0].toFixed(1)} ${cur[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += " Z";

  // Inner mark — 2-3 strokes that feel like a chop
  const marks = [];
  const markCount = 2 + Math.floor(rng() * 2);
  for (let i = 0; i < markCount; i++) {
    const a1 = rng() * Math.PI * 2;
    const a2 = a1 + (Math.PI * 0.4) + rng() * Math.PI * 0.6;
    const r1 = baseR * (0.25 + rng() * 0.35);
    const r2 = baseR * (0.25 + rng() * 0.35);
    const x1 = cx + Math.cos(a1) * r1;
    const y1 = cy + Math.sin(a1) * r1;
    const x2 = cx + Math.cos(a2) * r2;
    const y2 = cy + Math.sin(a2) * r2;
    marks.push({ x1, y1, x2, y2 });
  }
  // Tiny dot
  const dotAng = rng() * Math.PI * 2;
  const dotR = baseR * 0.5;
  const dotX = cx + Math.cos(dotAng) * dotR;
  const dotY = cy + Math.sin(dotAng) * dotR;

  return { path: d, marks, dot: { x: dotX, y: dotY }, size };
}

/* ─── Migration & persistence ──────────────────────────────────────────── */
function rawLoadPins() {
  try {
    const txt = safeGetItem(STORAGE_KEY);
    if (!txt) return [];
    const parsed = JSON.parse(txt);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function rawSavePins(pins) {
  safeSetItem(STORAGE_KEY, JSON.stringify(pins));
}

function getStoredSchemaVersion() {
  const v = safeGetItem(SCHEMA_KEY);
  return v ? parseInt(v, 10) : 1;
}

function setStoredSchemaVersion(v) {
  safeSetItem(SCHEMA_KEY, String(v));
}

function pushBackup(pins) {
  try {
    const existing = JSON.parse(safeGetItem(BACKUP_KEY) || "[]");
    existing.unshift({ at: Date.now(), version: APP_VERSION, pins });
    safeSetItem(BACKUP_KEY, JSON.stringify(existing.slice(0, MAX_BACKUPS)));
  } catch {}
}

function getBackups() {
  try { return JSON.parse(safeGetItem(BACKUP_KEY) || "[]"); } catch { return []; }
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
  // schema 2 → 3: add empty city/country fields (filled later by reverse geocoding)
  2: (pins) => pins.map((p) => ({
    ...p,
    city: p.city || "",
    country: p.country || "",
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
  try { return JSON.parse(safeGetItem(NOTIF_LOCS_KEY)) || []; } catch { return []; }
}
function saveNotifLocs(locs) {
  safeSetItem(NOTIF_LOCS_KEY, JSON.stringify(locs.slice(-30)));
}

function getLastSeenVersion() { return safeGetItem(VERSION_KEY); }
function setLastSeenVersion(v) { safeSetItem(VERSION_KEY, v); }

function getStoredTheme() {
  const v = safeGetItem(THEME_KEY);
  if (v === "light" || v === "dark") return v;
  return "dark"; // default
}
function setStoredTheme(t) { safeSetItem(THEME_KEY, t); }

function getLastBackupAt() {
  const v = safeGetItem(LAST_BACKUP_KEY);
  return v ? parseInt(v, 10) : null;
}
function setLastBackupAt(t) { safeSetItem(LAST_BACKUP_KEY, String(t)); }

function getFirstRunAt() {
  let v = safeGetItem(FIRST_RUN_KEY);
  if (!v) { v = String(Date.now()); safeSetItem(FIRST_RUN_KEY, v); }
  return parseInt(v, 10);
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}
function getAnnivDismissed() { return safeGetItem(ANNIV_DISMISS_KEY); }
function setAnnivDismissed() { safeSetItem(ANNIV_DISMISS_KEY, todayKey()); }

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
function distanceM(lat1, lng1, lat2, lng2) {
  return distanceKm(lat1, lng1, lat2, lng2) * 1000;
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

/* ─── Service worker registration ──────────────────────────────────────── */
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

/* ─── Date formatting ──────────────────────────────────────────────────── */
function fmtMonthYear(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}
function fmtFullDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function daysBetween(a, b) {
  return Math.floor(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}
function monthsBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
}
function isSameDayOfYear(a, b) {
  const da = new Date(a), db = new Date(b);
  return da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
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

  .leaflet-control-zoom { display: none !important; }
  .leaflet-control-attribution {
    background: rgba(10,10,15,0.7) !important;
    color: rgba(255,255,255,0.45) !important;
    font-size: 9px !important; padding: 2px 6px !important;
  }
  .leaflet-control-attribution a { color: rgba(255,255,255,0.65) !important; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip-container { display: none !important; }

  body.theme-light .leaflet-control-attribution {
    background: rgba(252,250,247,0.92) !important; color: rgba(26,24,20,0.7) !important;
  }
  body.theme-light .leaflet-control-attribution a { color: rgba(26,24,20,0.9) !important; }

  @keyframes gps-pulse  { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.5);opacity:0} }
  @keyframes fadeUp     { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
  @keyframes toastIn    { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes spin       { to{transform:rotate(360deg)} }
  @keyframes popIn      { 0%{opacity:0;transform:scale(0.95)} 100%{opacity:1;transform:scale(1)} }
  @keyframes slideDown  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulseRing  { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
  @keyframes slideUpIn  { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
  @keyframes sealStamp  { 0%{opacity:0;transform:scale(0.6) rotate(-8deg)} 60%{opacity:1;transform:scale(1.08) rotate(0deg)} 100%{opacity:1;transform:scale(1) rotate(0deg)} }

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

  /* Time travel slider */
  .yr-slider-track { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; background: transparent; outline: none; pointer-events: none; position: absolute; }
  .yr-slider-track::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 18px; height: 18px; border-radius: 50%;
    background: #c084fc; border: 2px solid rgba(255,255,255,0.9);
    cursor: pointer; pointer-events: auto;
    box-shadow: 0 2px 8px rgba(192,132,252,0.6);
  }
  .yr-slider-track::-moz-range-thumb {
    width: 18px; height: 18px; border-radius: 50%;
    background: #c084fc; border: 2px solid rgba(255,255,255,0.9);
    cursor: pointer; pointer-events: auto;
    box-shadow: 0 2px 8px rgba(192,132,252,0.6);
  }
  body.theme-light .yr-slider-track::-webkit-slider-thumb { background: #6d28d9; border-color: #fff; }
  body.theme-light .yr-slider-track::-moz-range-thumb { background: #6d28d9; border-color: #fff; }

  /* Paper texture for share card */
  .yr-paper {
    background-image:
      radial-gradient(circle at 20% 30%, rgba(0,0,0,0.018) 1px, transparent 1px),
      radial-gradient(circle at 70% 60%, rgba(0,0,0,0.022) 1px, transparent 1px),
      radial-gradient(circle at 40% 80%, rgba(0,0,0,0.015) 1px, transparent 1px),
      radial-gradient(circle at 90% 20%, rgba(0,0,0,0.018) 1px, transparent 1px);
    background-size: 25px 25px, 30px 30px, 35px 35px, 40px 40px;
  }

  @media screen and (max-width: 768px) {
    .yr-tool-btn { width: 46px; height: 46px; font-size: 17px; border-radius: 10px; }
    .yr-mood-chip { padding: 9px 16px; font-size: 13.5px; min-height: 40px; }
  }
  @media screen and (max-width: 380px) {
    .yr-tool-btn { width: 44px; height: 44px; }
  }

  input, textarea { font-size: 16px !important; }
`;

/* ─── Theme tokens ──────────────────────────────────────────────────────── */
function useTheme(isDark) {
  return {
    panelBg:      isDark ? "rgba(11,10,17,0.97)"     : "#ffffff",
    panelBorder:  isDark ? "rgba(255,255,255,0.12)"  : "rgba(0,0,0,0.22)",
    textPrimary:  isDark ? "#ffffff"                 : "#0a0908",
    textSec:      isDark ? "rgba(232,228,217,0.92)"  : "rgba(10,9,8,0.92)",
    textMuted:    isDark ? "rgba(232,228,217,0.62)"  : "rgba(10,9,8,0.7)",
    textFaint:    isDark ? "rgba(232,228,217,0.45)"  : "rgba(10,9,8,0.55)",
    toolBg:       isDark ? "rgba(11,10,17,0.92)"     : "#ffffff",
    toolBorder:   isDark ? "rgba(255,255,255,0.16)"  : "rgba(0,0,0,0.22)",
    toolColor:    isDark ? "rgba(232,228,217,0.92)"  : "#0a0908",
    headerGrad:   isDark
      ? "linear-gradient(to bottom,rgba(10,10,15,0.95) 0%,rgba(10,10,15,0.5) 60%,transparent 100%)"
      : "linear-gradient(to bottom,rgba(245,243,238,0.98) 0%,rgba(245,243,238,0.6) 60%,transparent 100%)",
    legendChipBg:     isDark ? "rgba(11,10,17,0.85)"    : "#ffffff",
    legendChipBorder: isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.2)",
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
      position: "fixed", bottom: "max(86px, calc(env(safe-area-inset-bottom, 0px) + 86px))",
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

/* ─── Seal SVG component ────────────────────────────────────────────────── */
function SealGlyph({ pin, color, size = 88, animate = false }) {
  const seed = useMemo(
    () => makeSeed(pin.lat, pin.lng, pin.createdAt || 0, pin.city || ""),
    [pin.lat, pin.lng, pin.createdAt, pin.city]
  );
  const seal = useMemo(() => generateSeal(seed, color, size), [seed, color, size]);
  return (
    <svg
      width={size} height={size} viewBox={`0 0 ${size} ${size}`}
      style={{ animation: animate ? "sealStamp 0.6s ease-out" : "none", display: "block" }}
    >
      <defs>
        <filter id={`seal-rough-${seed}`} x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed % 100} />
          <feDisplacementMap in="SourceGraphic" scale="1.2" />
        </filter>
      </defs>
      <path
        d={seal.path}
        fill={color}
        fillOpacity="0.18"
        stroke={color}
        strokeWidth="1.6"
        strokeOpacity="0.85"
        filter={`url(#seal-rough-${seed})`}
      />
      {seal.marks.map((m, i) => (
        <line
          key={i}
          x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2}
          stroke={color} strokeWidth="1.4" strokeOpacity="0.7" strokeLinecap="round"
          filter={`url(#seal-rough-${seed})`}
        />
      ))}
      <circle cx={seal.dot.x} cy={seal.dot.y} r="1.4" fill={color} fillOpacity="0.85" />
    </svg>
  );
}

/* ─── Writing modal (also handles edit) ─────────────────────────────────── */
function WritingModal({ coords, existingPin, onSave, onCancel, isDark, anniversaryHint }) {
  const T = useTheme(isDark);
  const isEdit = !!existingPin;
  const [draft, setDraft] = useState(() => existingPin ? {
    title: existingPin.title,
    body: existingPin.body,
    mood: existingPin.mood,
    customMood: existingPin.customMood || "",
  } : { title: "", body: "", mood: "wonder", customMood: "" });

  const mood = T.moods.find((m) => m.key === draft.mood) ?? T.moods[0];
  const valid = draft.title.trim() && draft.body.trim() && (draft.mood !== "other" || draft.customMood.trim());

  const handleSave = () => {
    if (!valid) return;
    haptic("success"); playSound("plant");
    const moodLabel = draft.mood === "other" ? draft.customMood.trim() : mood.label;
    if (isEdit) {
      onSave({
        ...existingPin,
        title: draft.title.trim(),
        body: draft.body.trim(),
        mood: draft.mood,
        customMood: draft.mood === "other" ? draft.customMood.trim() : "",
        moodLabel,
        moodColor: mood.color,
        editedAt: Date.now(),
      });
    } else {
      onSave({
        id: Date.now().toString(),
        lat: coords.lat, lng: coords.lng,
        title: draft.title.trim(), body: draft.body.trim(),
        mood: draft.mood, customMood: draft.mood === "other" ? draft.customMood.trim() : "",
        moodLabel, moodColor: mood.color,
        date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
        createdAt: Date.now(),
        appVersion: APP_VERSION,
        city: "", country: "",
      });
    }
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
          {isEdit ? "edit this memory" : "plant a thought here"}
        </div>
        {(coords || existingPin) && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.14em", marginBottom: anniversaryHint ? 12 : 20, fontWeight: 500 }}>
            {(coords || existingPin).lat.toFixed(5)}, {(coords || existingPin).lng.toFixed(5)}
          </div>
        )}

        {anniversaryHint && !isEdit && (
          <div style={{
            background: isDark ? "rgba(168,85,247,0.1)" : "rgba(109,40,217,0.07)",
            border: `1px solid ${isDark ? "rgba(168,85,247,0.3)" : "rgba(109,40,217,0.25)"}`,
            borderLeft: `3px solid ${isDark ? "rgba(168,85,247,0.7)" : "rgba(109,40,217,0.6)"}`,
            borderRadius: "0 6px 6px 0", padding: "10px 14px", marginBottom: 18,
            fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textSec, fontStyle: "italic", lineHeight: 1.6,
          }}>
            ✦ You were here before — {anniversaryHint}
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
          <input autoFocus={!isEdit} placeholder="how are you feeling?" value={draft.customMood}
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
        <input autoFocus={!isEdit && draft.mood !== "other"} placeholder="Give this moment a name…" value={draft.title}
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
          >{isEdit ? "cancel" : "discard"}</button>
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
          >{isEdit ? "save changes ✦" : "plant it ✦"}</button>
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
function ExportImportModal({ pins, onImport, onClose, onExported, isDark, lastBackupAt }) {
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
    onExported?.();
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
  const daysSinceBackup = lastBackupAt ? daysBetween(lastBackupAt, Date.now()) : null;

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
            <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.8, fontStyle: "italic", marginBottom: 16 }}>
              Download all your memories as a JSON file. You can import this file later to restore your memories, or move them to another device.
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, background: `${accent}10`, border: `1px solid ${accent}30`, borderRadius: 6, padding: "12px 16px", marginBottom: 14 }}>
              <div style={{ fontSize: 24, color: accent }}>◈</div>
              <div>
                <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: T.textPrimary, fontWeight: 500 }}>{pins.length} {pins.length === 1 ? "memory" : "memories"}</div>
                <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic" }}>ready to export</div>
              </div>
            </div>
            {lastBackupAt && (
              <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic", marginBottom: 16, letterSpacing: "0.04em" }}>
                Last backup: {daysSinceBackup === 0 ? "today" : daysSinceBackup === 1 ? "yesterday" : `${daysSinceBackup} days ago`}
              </div>
            )}
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

/* ─── Memory search modal (full-text) ───────────────────────────────────── */
function MemorySearchModal({ pins, onSelect, onClose, isDark }) {
  const T = useTheme(isDark);
  const [query, setQuery] = useState("");
  const accent = isDark ? "#a855f7" : "#6d28d9";

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pins.slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 30);
    return pins.filter((p) => {
      const hay = `${p.title} ${p.body} ${p.moodLabel || ""} ${p.city || ""} ${p.country || ""}`.toLowerCase();
      return hay.includes(q);
    }).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }, [pins, query]);

  return (
    <Overlay zIndex={300} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 480, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", display: "flex", flexDirection: "column",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${accent}33`, borderTop: `2px solid ${accent}`,
        borderRadius: "0 0 8px 8px", padding: "26px 26px 16px", position: "relative",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>search memories</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: T.textPrimary, marginBottom: 16, fontWeight: 500, fontStyle: "italic" }}>
          what are you looking for…
        </div>
        <input
          autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="a word, a feeling, a place…"
          style={{
            width: "100%", background: "transparent", border: "none",
            borderBottom: `1px solid ${query ? accent : T.panelBorder}`,
            padding: "10px 0", marginBottom: 14,
            color: T.textPrimary, fontFamily: "'Playfair Display',serif",
            fontStyle: "italic", outline: "none", letterSpacing: "0.02em", fontSize: 17,
          }}
        />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.16em", marginBottom: 10, fontStyle: "italic", fontWeight: 500 }}>
          {query ? `${results.length} found` : `your last ${Math.min(30, results.length)} memories`}
        </div>
        <div style={{ flex: 1, overflowY: "auto", marginRight: -8, paddingRight: 8 }}>
          {results.length === 0 && query && (
            <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: T.textMuted, fontStyle: "italic", padding: "20px 0", textAlign: "center" }}>
              nothing matches that — yet.
            </div>
          )}
          {results.map((p) => {
            const moodColor = p.moodColor || getMoodByKey(p.mood, isDark).color;
            const place = [p.city, p.country].filter(Boolean).join(", ");
            return (
              <button key={p.id} onClick={() => { haptic("light"); onSelect(p); }} style={{
                width: "100%", textAlign: "left", padding: "12px 0",
                background: "transparent", border: "none", borderBottom: `1px solid ${T.panelBorder}`,
                cursor: "pointer", display: "block",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: moodColor, flexShrink: 0, boxShadow: `0 0 4px ${moodColor}aa` }} />
                  <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15.5, color: T.textPrimary, fontWeight: 500, flex: 1, lineHeight: 1.3 }}>{p.title}</div>
                </div>
                <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", lineHeight: 1.55, marginBottom: 4, paddingLeft: 15, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {p.body}
                </div>
                <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.1em", paddingLeft: 15, fontWeight: 500 }}>
                  {p.date}{place ? ` · ${place}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Share card modal ─────────────────────────────────────────────────── */
function ShareCardModal({ pin, isDark, onClose }) {
  const T = useTheme(isDark);
  const cardRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const moodColor = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const moodLabel = pin.moodLabel || getMoodByKey(pin.mood, isDark).label;
  const place = [pin.city, pin.country].filter(Boolean).join(", ");

  // Render the share card to canvas using SVG → image
  const renderToCanvas = useCallback(async () => {
    const W = 1080, H = 1350;
    const canvas = document.createElement("canvas");
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext("2d");

    // Paper background
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, "#faf6ee");
    grad.addColorStop(1, "#f0e9d8");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Subtle paper noise
    for (let i = 0; i < 800; i++) {
      const x = Math.random() * W;
      const y = Math.random() * H;
      const r = Math.random() * 1.5;
      ctx.fillStyle = `rgba(0,0,0,${0.015 + Math.random() * 0.025})`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }

    // Vignette
    const vg = ctx.createRadialGradient(W/2, H/2, W*0.35, W/2, H/2, W*0.7);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.06)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);

    // Mood color band (top)
    ctx.fillStyle = moodColor;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(80, 80, 4, 80);
    ctx.globalAlpha = 1;

    // Mood label
    ctx.fillStyle = moodColor;
    ctx.font = "700 28px 'Lora', serif";
    ctx.textAlign = "left";
    ctx.fillText(moodLabel.toUpperCase(), 110, 130);

    // Date subtle
    ctx.fillStyle = "rgba(60,50,40,0.55)";
    ctx.font = "italic 22px 'Lora', serif";
    ctx.fillText(pin.date, 110, 165);

    // Title (Playfair) — wrap
    ctx.fillStyle = "#1a1410";
    ctx.font = "500 64px 'Playfair Display', serif";
    const wrapText = (text, x, y, maxW, lh) => {
      const words = text.split(" ");
      let line = "", yy = y, drawn = 0;
      for (const w of words) {
        const test = line + w + " ";
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line.trim(), x, yy);
          line = w + " "; yy += lh; drawn++;
          if (drawn >= 3) { ctx.fillText(line.trim() + (words.indexOf(w) < words.length - 1 ? "…" : ""), x, yy); return yy + lh; }
        } else line = test;
      }
      if (line) ctx.fillText(line.trim(), x, yy);
      return yy + lh;
    };
    let yPos = wrapText(pin.title, 110, 260, W - 220, 78);

    // Divider
    ctx.strokeStyle = "rgba(60,50,40,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(110, yPos + 20); ctx.lineTo(260, yPos + 20); ctx.stroke();
    yPos += 70;

    // Body (italic Lora) — wrap
    ctx.fillStyle = "rgba(40,30,20,0.85)";
    ctx.font = "italic 34px 'Lora', serif";
    const wrapBody = (text, x, y, maxW, lh, maxLines) => {
      const words = text.split(/\s+/);
      let line = "", yy = y, drawn = 0;
      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const test = line + w + " ";
        if (ctx.measureText(test).width > maxW && line) {
          ctx.fillText(line.trim(), x, yy);
          line = w + " "; yy += lh; drawn++;
          if (drawn >= maxLines - 1) {
            // Last line — add ellipsis if needed
            let last = line;
            const remaining = words.slice(i + 1).join(" ");
            if (remaining) {
              while (ctx.measureText(last + "…").width > maxW && last.length > 1) last = last.slice(0, -1);
              ctx.fillText(last.trim() + "…", x, yy);
            } else {
              ctx.fillText(line.trim(), x, yy);
            }
            return yy + lh;
          }
        } else line = test;
      }
      if (line) ctx.fillText(line.trim(), x, yy);
      return yy + lh;
    };
    yPos = wrapBody(pin.body, 110, yPos, W - 220, 50, 10);

    // Place line
    if (place) {
      ctx.fillStyle = "rgba(60,50,40,0.6)";
      ctx.font = "500 24px 'Lora', serif";
      ctx.fillText(place, 110, yPos + 30);
      yPos += 55;
    }

    // Coords
    ctx.fillStyle = "rgba(60,50,40,0.45)";
    ctx.font = "500 18px 'Lora', serif";
    ctx.fillText(`${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)}`, 110, yPos + 30);

    // Generate seal SVG and draw to canvas
    const seed = makeSeed(pin.lat, pin.lng, pin.createdAt || 0, pin.city || "");
    const sealData = generateSeal(seed, moodColor, 200);
    const sealSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
      <path d="${sealData.path}" fill="${moodColor}" fill-opacity="0.22" stroke="${moodColor}" stroke-width="2.4" stroke-opacity="0.85"/>
      ${sealData.marks.map(m => `<line x1="${m.x1}" y1="${m.y1}" x2="${m.x2}" y2="${m.y2}" stroke="${moodColor}" stroke-width="2.2" stroke-opacity="0.75" stroke-linecap="round"/>`).join("")}
      <circle cx="${sealData.dot.x}" cy="${sealData.dot.y}" r="2.2" fill="${moodColor}" fill-opacity="0.9"/>
    </svg>`;
    const sealImg = new Image();
    const sealUrl = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(sealSvg)));
    await new Promise((res, rej) => { sealImg.onload = res; sealImg.onerror = rej; sealImg.src = sealUrl; });
    ctx.save();
    ctx.translate(W - 240, H - 320);
    ctx.rotate(-0.08);
    ctx.globalAlpha = 0.92;
    ctx.drawImage(sealImg, 0, 0, 180, 180);
    ctx.restore();

    // Footer — branding
    ctx.fillStyle = "rgba(40,30,20,0.55)";
    ctx.font = "700 20px 'Lora', serif";
    ctx.textAlign = "left";
    ctx.fillText("YEARNINGMAP", 110, H - 100);
    ctx.fillStyle = "rgba(60,50,40,0.5)";
    ctx.font = "italic 22px 'Lora', serif";
    ctx.fillText("leave a part of yourself somewhere", 110, H - 70);

    return canvas;
  }, [pin, moodColor, moodLabel, place]);

  const downloadShare = async () => {
    haptic("medium");
    setBusy(true); setStatusMsg("");
    try {
      const canvas = await renderToCanvas();
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png", 0.95));
      if (!blob) throw new Error("could not render");

      // Try Web Share API with file first (mobile)
      const file = new File([blob], `yearning-${pin.id}.png`, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: pin.title });
          setStatusMsg("shared ✦");
          setBusy(false);
          return;
        } catch (e) {
          // user cancelled or share unsupported — fall through to download
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `yearning-${pin.id}.png`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setStatusMsg("saved to your device ✦");
    } catch (err) {
      console.error(err);
      setStatusMsg("could not generate card");
    } finally {
      setBusy(false);
    }
  };

  const accent = isDark ? "#a855f7" : "#6d28d9";

  return (
    <Overlay zIndex={400} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 440, maxWidth: "100%", maxHeight: "calc(100dvh - 40px)", overflowY: "auto",
        background: T.panelBg, backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        border: `1px solid ${moodColor}40`, borderTop: `2px solid ${moodColor}`,
        borderRadius: "0 0 8px 8px", padding: "26px 26px 22px", position: "relative",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.22)",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 4 }} aria-label="Close">×</button>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>share memory</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, color: T.textPrimary, marginBottom: 18, fontWeight: 500 }}>a page from your diary</div>

        {/* Preview card — paper feel */}
        <div ref={cardRef} className="yr-paper" style={{
          background: "linear-gradient(180deg, #faf6ee 0%, #f0e9d8 100%)",
          borderRadius: 4,
          padding: "22px 22px 18px",
          marginBottom: 18,
          boxShadow: "0 8px 32px rgba(40,30,20,0.25), inset 0 0 60px rgba(60,40,20,0.04)",
          position: "relative", overflow: "hidden",
        }}>
          <div style={{ width: 3, height: 32, background: moodColor, marginBottom: 10, opacity: 0.85 }} />
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: moodColor, letterSpacing: "0.24em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>
            {moodLabel}
          </div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: "rgba(60,50,40,0.55)", fontStyle: "italic", marginBottom: 14 }}>{pin.date}</div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, color: "#1a1410", fontWeight: 500, lineHeight: 1.25, marginBottom: 14 }}>{pin.title}</div>
          <div style={{ width: 60, height: 1, background: "rgba(60,50,40,0.25)", marginBottom: 14 }} />
          <div style={{
            fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(40,30,20,0.85)",
            fontStyle: "italic", lineHeight: 1.7, marginBottom: 14,
            display: "-webkit-box", WebkitLineClamp: 5, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}>{pin.body}</div>
          {place && (
            <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: "rgba(60,50,40,0.7)", fontWeight: 600, letterSpacing: "0.04em" }}>{place}</div>
          )}
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: "rgba(60,50,40,0.5)", marginTop: 2, fontWeight: 500 }}>
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </div>

          {/* Seal in corner */}
          <div style={{ position: "absolute", right: 16, bottom: 50, transform: "rotate(-6deg)", opacity: 0.92 }}>
            <SealGlyph pin={pin} color={moodColor} size={70} animate />
          </div>

          {/* Footer */}
          <div style={{ marginTop: 18, paddingTop: 12, borderTop: "1px solid rgba(60,50,40,0.15)", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: "rgba(40,30,20,0.55)", letterSpacing: "0.18em", fontWeight: 700 }}>YEARNINGMAP</div>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 9, color: "rgba(60,50,40,0.5)", fontStyle: "italic" }}>leave a part of yourself somewhere</div>
          </div>
        </div>

        <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: T.textMuted, fontStyle: "italic", lineHeight: 1.6, marginBottom: 14 }}>
          Each memory has its own seal — generated from where and when you planted it. No two are alike.
        </div>

        <button onClick={downloadShare} disabled={busy} style={{
          width: "100%", padding: "13px 0", borderRadius: 6,
          background: `${accent}22`, border: `1px solid ${accent}`,
          color: accent, fontFamily: "'Lora',serif", fontSize: 13.5, letterSpacing: "0.14em",
          cursor: busy ? "wait" : "pointer", fontWeight: 700, minHeight: 48,
        }}>
          {busy ? "preparing…" : "↗ share or save card"}
        </button>
        {statusMsg && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", marginTop: 10, textAlign: "center" }}>{statusMsg}</div>
        )}
      </div>
    </Overlay>
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
    { icon: "◎", col: cyan,    label: "Locate Me",      desc: "Flies to your GPS position and shows a live pulse marker." },
    { icon: "✦", col: purple,  label: "Plant Here",     desc: "Plants a pin at your GPS location, or at the map center if unavailable." },
    { icon: "+", col: T.textPrimary, label: "Tap Anywhere",   desc: "Enter placing mode — tap any spot, or long-press for an instant plant." },
    { icon: "⌕", col: purple,  label: "Search Memories", desc: "Full-text search through every memory you've planted — title, body, mood, place." },
    { icon: "⌘", col: T.textSec, label: "Heatmap",        desc: "Toggle a soft density view that shows where you think the most." },
    { icon: "⌂", col: T.textSec,     label: "Reset View",     desc: "Flies back to the world view at default zoom." },
    { icon: "↝", col: T.textSec,     label: "Random Memory",  desc: "Jumps to a random memory you've planted." },
    { icon: "◑", col: gold,    label: "Light / Dark",   desc: "Toggle between dark and light map themes. Your choice persists across sessions." },
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

        {/* Listening stat — quiet, not gamified */}
        {listeningDays > 0 && (
          <div style={{
            background: isDark ? "rgba(168,85,247,0.07)" : "rgba(109,40,217,0.05)",
            border: `1px solid ${isDark ? "rgba(168,85,247,0.22)" : "rgba(109,40,217,0.18)"}`,
            borderLeft: `3px solid ${purple}`,
            borderRadius: "0 6px 6px 0", padding: "11px 14px", marginBottom: 22,
          }}>
            <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: 14.5, color: T.textPrimary, lineHeight: 1.45 }}>
              You've been listening to yourself for <strong style={{ color: purple, fontStyle: "normal", fontWeight: 600 }}>{listeningDays} {listeningDays === 1 ? "day" : "days"}</strong>.
            </div>
          </div>
        )}

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

        {/* Editing memories */}
        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "16px 0 14px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>editing memories</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", lineHeight: 1.75 }}>
          For 24 hours after planting, you can edit a memory's title, body, or mood — for second thoughts and small fixes.
          After that, the moment is set in stone. The location and time it was planted are never editable.
        </div>

        {/* Time travel */}
        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "16px 0 14px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 8, fontWeight: 600 }}>time travel</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", lineHeight: 1.75 }}>
          Drag the slider at the bottom to filter memories by date. See "March 2025" or "everything before I moved." Tap mood chips to combine — the map listens.
        </div>

        {/* Moods */}
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

/* ─── Update banner ─────────────────────────────────────────────────────── */
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

/* ─── Welcome modal ─────────────────────────────────────────────────────── */
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
      position: "fixed", bottom: "max(120px, calc(env(safe-area-inset-bottom, 0px) + 120px))",
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

/* ─── Backup nudge ──────────────────────────────────────────────────────── */
function BackupNudge({ isDark, daysAgo, onExport, onDismiss }) {
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
      width: "min(400px, calc(100vw - 28px))",
      boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
      display: "flex", alignItems: "center", gap: 12,
    }}>
      <div style={{ fontSize: 18, color: cyan, flexShrink: 0 }}>↓</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: T.textPrimary, fontWeight: 500, marginBottom: 2 }}>
          you haven't backed up in {daysAgo} days
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic", lineHeight: 1.5 }}>
          export now for peace of mind ·˚
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onDismiss} style={{
          background: "transparent", border: "none", color: T.textMuted,
          fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.1em", cursor: "pointer",
          padding: "8px 6px", minHeight: 36, fontWeight: 500,
        }}>later</button>
        <button onClick={onExport} style={{
          background: `${cyan}22`, border: `1px solid ${cyan}`,
          color: cyan, padding: "8px 14px", borderRadius: 5, cursor: "pointer",
          fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.14em", fontWeight: 700, minHeight: 36,
        }}>export</button>
      </div>
    </div>
  );
}

/* ─── On This Day nudge ─────────────────────────────────────────────────── */
function OnThisDayNudge({ pin, isDark, onView, onDismiss }) {
  const T = useTheme(isDark);
  const moodColor = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const years = new Date().getFullYear() - new Date(pin.createdAt).getFullYear();
  const yearLabel = years === 1 ? "a year ago" : `${years} years ago`;

  return (
    <div style={{
      position: "fixed", top: "max(72px, calc(env(safe-area-inset-top, 0px) + 72px))",
      left: "50%", transform: "translateX(-50%)",
      background: T.panelBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
      border: `1px solid ${moodColor}55`, borderLeft: `3px solid ${moodColor}`,
      borderRadius: "0 8px 8px 0",
      padding: "14px 18px 12px 16px", zIndex: 130,
      animation: "slideUpIn 0.5s ease",
      width: "min(420px, calc(100vw - 28px))",
      boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.55)" : "0 8px 32px rgba(0,0,0,0.18)",
    }}>
      <button onClick={onDismiss} style={{ position: "absolute", top: 6, right: 10, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 4 }} aria-label="Dismiss">×</button>
      <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: moodColor, letterSpacing: "0.28em", textTransform: "uppercase", fontWeight: 700, marginBottom: 4 }}>on this day</div>
      <div style={{ fontFamily: "'Playfair Display',serif", fontStyle: "italic", fontSize: 15, color: T.textPrimary, fontWeight: 500, lineHeight: 1.4, marginBottom: 8, paddingRight: 20 }}>
        {yearLabel}, you wrote here…
      </div>
      <button onClick={onView} style={{
        width: "100%", background: "transparent", border: "none", textAlign: "left",
        cursor: "pointer", padding: 0,
      }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 14, color: T.textPrimary, fontWeight: 500, marginBottom: 3 }}>
          {pin.title}
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textSec, fontStyle: "italic", lineHeight: 1.55, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {pin.body}
        </div>
        <div style={{ marginTop: 6, fontFamily: "'Lora',serif", fontSize: 11, color: moodColor, letterSpacing: "0.14em", fontWeight: 700 }}>
          revisit →
        </div>
      </button>
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

/* ─── Place search box ──────────────────────────────────────────────────── */
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
function PinCard({ pin, mapInstance, isDark, onClose, onForget, onEdit, onShare }) {
  const T = useTheme(isDark);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });
  const moodColor = pin.moodColor || getMoodByKey(pin.mood, isDark).color;
  const moodLabel = pin.moodLabel || getMoodByKey(pin.mood, isDark).label;
  const place = [pin.city, pin.country].filter(Boolean).join(", ");
  const editable = pin.createdAt && (Date.now() - pin.createdAt < EDIT_WINDOW_MS);
  const editedAt = pin.editedAt;

  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const pt = mapInstance.latLngToContainerPoint([pin.lat, pin.lng]);
      const cardW = Math.min(340, window.innerWidth - 28);
      let left = pt.x - cardW / 2;
      left = Math.max(14, Math.min(left, window.innerWidth - cardW - 14));
      const cardEstHeight = 280;
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
        maxHeight: "min(54vh, 420px)", overflowY: "auto",
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
        {editedAt && (
          <div style={{ marginTop: 8, fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, fontStyle: "italic", letterSpacing: "0.04em" }}>
            edited {new Date(editedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </div>
        )}
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.panelBorder}` }}>
          {place && (
            <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: T.textPrimary, letterSpacing: "0.06em", marginBottom: 2, fontWeight: 600 }}>
              {place}
            </div>
          )}
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.06em", fontWeight: 500, marginBottom: 10 }}>
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
            <div style={{ display: "flex", gap: 12 }}>
              {editable && (
                <button onClick={() => { haptic("light"); onEdit(pin); }}
                  style={{ background: "transparent", border: "none", color: isDark ? "#c084fc" : "#6d28d9", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 32, fontWeight: 700 }}
                >✎ edit</button>
              )}
              <button onClick={() => { haptic("light"); onShare(pin); }}
                style={{ background: "transparent", border: "none", color: T.textPrimary, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 32, fontWeight: 600 }}
              >↗ share</button>
            </div>
            <button onClick={() => { haptic("medium"); onForget(pin.id); }}
              style={{ background: "transparent", border: "none", color: isDark ? "rgba(252,165,165,0.75)" : "rgba(185,28,28,0.85)", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11.5, letterSpacing: "0.1em", padding: "6px 0", minHeight: 32, fontWeight: 600 }}
            >forget this</button>
          </div>
          {!editable && pin.createdAt && (
            <div style={{ marginTop: 6, fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, fontStyle: "italic", letterSpacing: "0.06em" }}>
              edits closed · 24h window has passed
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Time travel slider ───────────────────────────────────────────────── */
function TimeSlider({ minTs, maxTs, range, setRange, isDark }) {
  const T = useTheme(isDark);
  const [minVal, maxVal] = range;
  if (minTs >= maxTs) return null;

  const pct = (v) => ((v - minTs) / (maxTs - minTs)) * 100;
  const accent = isDark ? "#c084fc" : "#6d28d9";

  return (
    <div style={{
      position: "fixed", bottom: "max(14px, calc(env(safe-area-inset-bottom, 0px) + 14px))",
      left: "50%", transform: "translateX(-50%)",
      width: "min(420px, calc(100vw - 240px))", zIndex: 100,
      background: T.panelBg, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)",
      border: `1px solid ${T.panelBorder}`,
      borderRadius: 8, padding: "9px 14px 12px",
      boxShadow: isDark ? "0 4px 18px rgba(0,0,0,0.4)" : "0 4px 18px rgba(0,0,0,0.12)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 7, gap: 8 }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>time travel</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 11.5, color: T.textPrimary, fontStyle: "italic", textAlign: "right" }}>
          {fmtMonthYear(minVal)} — {fmtMonthYear(maxVal)}
        </div>
      </div>
      <div style={{ position: "relative", height: 18 }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: 8, height: 3, background: isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)", borderRadius: 2 }} />
        <div style={{
          position: "absolute", top: 8, height: 3, borderRadius: 2,
          left: `${pct(minVal)}%`, right: `${100 - pct(maxVal)}%`,
          background: accent, opacity: 0.7,
        }} />
        <input className="yr-slider-track" type="range"
          min={minTs} max={maxTs} step={86400000} value={minVal}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (v <= maxVal) setRange([v, maxVal]);
          }}
          style={{ top: 0, zIndex: 2 }}
        />
        <input className="yr-slider-track" type="range"
          min={minTs} max={maxTs} step={86400000} value={maxVal}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (v >= minVal) setRange([minVal, v]);
          }}
          style={{ top: 0, zIndex: 3 }}
        />
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
  const longPressTimer = useRef(null);
  const toastTimer = useRef(null);
  const pinchActiveRef = useRef(false);
  const lastTouchEndRef = useRef(0);
  const locationWatchRef = useRef(null);
  const lastNotifTimeRef = useRef(0);
  const lastNotifLocRef = useRef(null);
  const geocodeQueueRef = useRef([]);
  const geocodingRef = useRef(false);

  const [pins, setPins] = useState(loadPinsWithMigration);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [mode, setMode] = useState("idle");
  const [placingCoords, setPlacingCoords] = useState(null);
  const [editingPin, setEditingPin] = useState(null);
  const [sharingPin, setSharingPin] = useState(null);
  const [anniversaryHint, setAnniversaryHint] = useState(null);
  // FIX: theme persists from storage
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
  const mobile = useMemo(() => isMobileDevice(), []);

  /* ─── Theme persistence + body class ───────────────────────────────── */
  useEffect(() => {
    setStoredTheme(isDark ? "dark" : "light");
    document.body.classList.toggle("theme-light", !isDark);
    let metaTheme = document.querySelector("meta[name=theme-color]");
    if (!metaTheme) {
      metaTheme = document.createElement("meta");
      metaTheme.setAttribute("name", "theme-color");
      document.head.appendChild(metaTheme);
    }
    metaTheme.setAttribute("content", isDark ? "#0a0a0f" : "#f5f3ee");
  }, [isDark]);

  /* ─── Persist pins ─────────────────────────────────────────────────── */
  useEffect(() => { rawSavePins(pins); }, [pins]);

  /* ─── Track first run ──────────────────────────────────────────────── */
  useEffect(() => { getFirstRunAt(); }, []);

  /* ─── Notification permission state ────────────────────────────────── */
  useEffect(() => {
    if ("Notification" in window) setNotifPermission(Notification.permission);
  }, []);

  /* ─── Onboarding decision (welcome / what's new / nothing) ────────── */
  useEffect(() => {
    const onboarded = safeGetItem(ONBOARDED_KEY);
    const lastVersion = getLastSeenVersion();
    if (!onboarded) {
      setOnboardPhase("welcome");
    } else {
      const cmp = compareVersions(lastVersion, APP_VERSION);
      if (cmp < 0) {
        setOnboardPhase("idle");
        setShowWhatsNew(true);
        setWhatsNewIsFirstAck(true);
      } else {
        setOnboardPhase("idle");
      }
    }
  }, []);

  /* ─── Service worker registration ─────────────────────────────────── */
  useEffect(() => {
    registerServiceWorker((reg) => {
      window.__yearningWaitingWorker = reg.waiting || (reg.installing && reg.installing.state === "installed" ? reg.installing : null);
      setShowUpdateBanner(true);
    });
  }, []);

  /* ─── First-plant nudge after welcome ──────────────────────────────── */
  useEffect(() => {
    if (onboardPhase !== "idle") return;
    if (pins.length > 0) return;
    const t = setTimeout(() => setShowFirstNudge(true), 1500);
    return () => clearTimeout(t);
  }, [onboardPhase, pins.length]);

  /* ─── Backup nudge check ───────────────────────────────────────────── */
  useEffect(() => {
    if (onboardPhase !== "idle") return;
    if (pins.length === 0) return;
    if (showWhatsNew || showFirstNudge) return;
    const last = lastBackupAt;
    if (last && daysBetween(last, Date.now()) < BACKUP_NUDGE_DAYS) return;
    if (!last) {
      // never backed up but has many pins → nudge after a delay
      if (pins.length >= 5) {
        const t = setTimeout(() => setShowBackupNudge(true), 4500);
        return () => clearTimeout(t);
      }
    } else {
      const t = setTimeout(() => setShowBackupNudge(true), 3000);
      return () => clearTimeout(t);
    }
  }, [onboardPhase, pins.length, lastBackupAt, showWhatsNew, showFirstNudge]);

  /* ─── On this day check ────────────────────────────────────────────── */
  useEffect(() => {
    if (onboardPhase !== "idle") return;
    if (pins.length === 0) return;
    const dismissedKey = getAnnivDismissed();
    if (dismissedKey === todayKey()) return;
    const now = new Date();
    const matches = pins
      .filter((p) => p.createdAt && isSameDayOfYear(p.createdAt, now.getTime()))
      .map((p) => {
        const yrs = now.getFullYear() - new Date(p.createdAt).getFullYear();
        return { pin: p, years: yrs };
      })
      .filter((x) => [1, 2, 5].includes(x.years))
      .sort((a, b) => b.years - a.years);
    if (matches.length > 0) {
      const t = setTimeout(() => setOnThisDayPin(matches[0].pin), 5500);
      return () => clearTimeout(t);
    }
  }, [onboardPhase, pins]);

  /* ─── Reverse geocode pins missing city/country ──────────────────── */
  useEffect(() => {
    const needs = pins.filter((p) => !p.city && !p.country);
    if (needs.length === 0) return;
    needs.forEach((p) => {
      if (!geocodeQueueRef.current.find((q) => q.id === p.id)) {
        geocodeQueueRef.current.push({ id: p.id, lat: p.lat, lng: p.lng });
      }
    });
    const drainQueue = async () => {
      if (geocodingRef.current) return;
      geocodingRef.current = true;
      while (geocodeQueueRef.current.length > 0) {
        const item = geocodeQueueRef.current.shift();
        const result = await reverseGeocode(item.lat, item.lng);
        if (result.city || result.country) {
          setPins((prev) => prev.map((p) => p.id === item.id ? { ...p, city: result.city, country: result.country } : p));
        }
        // respect Nominatim rate limit
        await new Promise((r) => setTimeout(r, 1100));
      }
      geocodingRef.current = false;
    };
    drainQueue();
  }, [pins]);

  /* ─── Toast helper ─────────────────────────────────────────────────── */
  const showToast = useCallback((msg, ms = 2400) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), ms);
  }, []);

  /* ─── Location reminders ───────────────────────────────────────────── */
  useEffect(() => {
    if (notifPermission !== "granted") return;
    if (!("geolocation" in navigator)) return;
    let watchId;
    try {
      watchId = navigator.geolocation.watchPosition((position) => {
        const { latitude, longitude } = position.coords;
        const now = Date.now();
        if (now - lastNotifTimeRef.current < NOTIF_COOLDOWN_MS) return;
        if (lastNotifLocRef.current) {
          const d = distanceKm(latitude, longitude, lastNotifLocRef.current.lat, lastNotifLocRef.current.lng);
          if (d < NOTIF_COOLDOWN_KM) return;
        }
        const nearby = pins.filter((p) => distanceKm(latitude, longitude, p.lat, p.lng) <= NEARBY_RADIUS_KM);
        if (nearby.length > 0) {
          const closest = nearby.reduce((a, b) => distanceKm(latitude, longitude, a.lat, a.lng) < distanceKm(latitude, longitude, b.lat, b.lng) ? a : b);
          if (showNotification("a memory is close ✦", `"${closest.title}" — ${closest.moodLabel || "a feeling"} you planted here`, () => {
            setSelectedPinId(closest.id);
            mapRef.current?.flyTo([closest.lat, closest.lng], 15, { duration: 1.5 });
          })) {
            lastNotifTimeRef.current = now;
            lastNotifLocRef.current = { lat: latitude, lng: longitude };
          }
        } else {
          const notifLocs = loadNotifLocs();
          const hasNotifiedHere = notifLocs.some((l) => distanceKm(latitude, longitude, l.lat, l.lng) < 1);
          if (!hasNotifiedHere && pins.length > 0) {
            if (showNotification("you're somewhere new ✦", "plant a memory here before this moment passes", () => {
              mapRef.current?.flyTo([latitude, longitude], 15, { duration: 1.5 });
            })) {
              notifLocs.push({ lat: latitude, lng: longitude, at: now });
              saveNotifLocs(notifLocs);
              lastNotifTimeRef.current = now;
              lastNotifLocRef.current = { lat: latitude, lng: longitude };
            }
          }
        }
      }, () => {}, { enableHighAccuracy: false, maximumAge: 60000, timeout: 30000 });
      locationWatchRef.current = watchId;
    } catch {}
    return () => { if (watchId !== undefined) try { navigator.geolocation.clearWatch(watchId); } catch {} };
  }, [notifPermission, pins]);

  /* ─── Date range bounds for slider ─────────────────────────────────── */
  const dateBounds = useMemo(() => {
    if (pins.length === 0) return null;
    const stamps = pins.map((p) => p.createdAt || 0).filter((x) => x > 0);
    if (stamps.length === 0) return null;
    const min = Math.min(...stamps);
    const max = Math.max(...stamps, Date.now());
    if (max - min < 86400000 * 14) return null; // less than 2 weeks span — not useful
    return [min, max];
  }, [pins]);

  // Initialize/clamp slider range whenever bounds change
  useEffect(() => {
    if (!dateBounds) { setDateFilterRange(null); return; }
    setDateFilterRange((prev) => {
      if (!prev) return [dateBounds[0], dateBounds[1]];
      return [Math.max(prev[0], dateBounds[0]), Math.min(prev[1], dateBounds[1])];
    });
  }, [dateBounds]);

  /* ─── Filtered pins (date + mood filters) ──────────────────────────── */
  const filteredPins = useMemo(() => {
    return pins.filter((p) => {
      if (dateFilterRange && p.createdAt) {
        if (p.createdAt < dateFilterRange[0] || p.createdAt > dateFilterRange[1]) return false;
      }
      if (activeMoodFilters.size > 0 && !activeMoodFilters.has(p.mood)) return false;
      return true;
    });
  }, [pins, dateFilterRange, activeMoodFilters]);

  /* ─── Stats ────────────────────────────────────────────────────────── */
  const stats = useMemo(() => {
    const cities = new Set();
    const countries = new Set();
    pins.forEach((p) => {
      if (p.city) cities.add(p.city);
      if (p.country) countries.add(p.country);
    });
    return { cities: cities.size, countries: countries.size };
  }, [pins]);

  const listeningDays = useMemo(() => {
    const first = getFirstRunAt();
    return Math.max(1, daysBetween(first, Date.now()));
  }, []);

  /* ─── Map initialization ───────────────────────────────────────────── */
  useEffect(() => {
    if (mapRef.current || !mapContainerRef.current) return;

    const init = async () => {
      if (!document.getElementById("leaflet-css")) {
        const link = document.createElement("link");
        link.id = "leaflet-css"; link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        document.head.appendChild(link);
      }
      const L = (await import("https://esm.sh/leaflet@1.9.4")).default;
      leafletRef.current = L;

      const map = L.map(mapContainerRef.current, {
        center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, zoomControl: false,
        worldCopyJump: true, minZoom: 2, maxZoom: 18,
        attributionControl: true, tap: false, touchZoom: true,
        doubleClickZoom: false, scrollWheelZoom: true, dragging: true,
      });
      // Custom zoom buttons rendered separately — see ZoomControls component below
      mapRef.current = map;
      window.__yearningMap = map;

      const tile = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19 });
      tile.addTo(map);
      tileLayerRef.current = tile;

      let pressTimer = null;
      let pressStartLatLng = null;
      const PRESS_THRESHOLD_MS = 600;
      const PRESS_MOVE_THRESHOLD_PX = 14;

      map.on("mousedown touchstart", (e) => {
        if (pinchActiveRef.current) return;
        if (e.originalEvent.touches && e.originalEvent.touches.length > 1) {
          pinchActiveRef.current = true;
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          return;
        }
        pressStartLatLng = e.latlng;
        const startPt = e.containerPoint || map.latLngToContainerPoint(e.latlng);
        pressTimer = setTimeout(() => {
          if (pinchActiveRef.current) return;
          if (e.originalEvent.target?.closest(".yr-pin-card, .yr-overlay, .yr-modal, button, input, textarea")) return;
          haptic("medium");
          setPlacingCoords({ lat: pressStartLatLng.lat, lng: pressStartLatLng.lng });
          setMode("writing");
          setSelectedPinId(null);
        }, PRESS_THRESHOLD_MS);

        const onMove = (mv) => {
          if (!pressTimer) return;
          const pt = mv.containerPoint || map.latLngToContainerPoint(mv.latlng);
          const dx = pt.x - startPt.x;
          const dy = pt.y - startPt.y;
          if (Math.sqrt(dx * dx + dy * dy) > PRESS_MOVE_THRESHOLD_PX) {
            clearTimeout(pressTimer); pressTimer = null;
            map.off("mousemove touchmove", onMove);
          }
        };
        map.on("mousemove touchmove", onMove);
      });
      map.on("mouseup touchend touchcancel", () => {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        if (pinchActiveRef.current) {
          setTimeout(() => { pinchActiveRef.current = false; }, 100);
        }
        lastTouchEndRef.current = Date.now();
      });

      map.on("click", (e) => {
        if (pinchActiveRef.current) return;
        if (Date.now() - lastTouchEndRef.current < 50) return;
        if (e.originalEvent.target?.closest(".yr-pin-card, .yr-overlay, .yr-modal, button, input, textarea")) return;
        if (modeRef.current === "placing") {
          setPlacingCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
          setMode("writing");
        } else {
          setSelectedPinId(null);
        }
      });

      setMapReady(true);
    };
    init();

    return () => {
      if (mapRef.current) { try { mapRef.current.remove(); } catch {} mapRef.current = null; }
      window.__yearningMap = null;
    };
  }, []);

  // Keep mode in a ref for click handler
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  /* ─── Tile layer swap on theme change ──────────────────────────────── */
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current) return;
    const L = leafletRef.current;
    if (tileLayerRef.current) try { mapRef.current.removeLayer(tileLayerRef.current); } catch {}
    const tile = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19 });
    tile.addTo(mapRef.current);
    tileLayerRef.current = tile;
  }, [isDark, mapReady]);

  /* ─── Render markers ───────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;

    // Clear old markers
    markersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    markersRef.current = [];
    heatmapMarkersRef.current.forEach((m) => { try { map.removeLayer(m); } catch {} });
    heatmapMarkersRef.current = [];

    if (showHeatmap) {
      // Soft density: stack circle markers with low opacity per pin
      filteredPins.forEach((p) => {
        const moodColor = p.moodColor || getMoodByKey(p.mood, isDark).color;
        for (let i = 0; i < 3; i++) {
          const radius = 28 + i * 14;
          const opacity = 0.18 - i * 0.05;
          const c = L.circleMarker([p.lat, p.lng], {
            radius, fillColor: moodColor, fillOpacity: opacity,
            stroke: false, interactive: false, pane: "overlayPane",
          });
          c.addTo(map);
          heatmapMarkersRef.current.push(c);
        }
      });
      return;
    }

    filteredPins.forEach((p) => {
      const moodColor = p.moodColor || getMoodByKey(p.mood, isDark).color;
      const isSelected = selectedPinId === p.id;
      const w = isSelected ? 28 : 22;
      const h = isSelected ? 38 : 30;
      const stroke = isDark ? "rgba(11,10,17,0.95)" : "rgba(252,250,247,0.98)";
      const html = `
        <div style="position:relative;width:${w}px;height:${h}px;transform:translateY(-${h/2 - w/2}px);">
          <svg width="${w}" height="${h}" viewBox="0 0 24 32" style="position:absolute;inset:0;filter:drop-shadow(0 0 ${isSelected ? 10 : 6}px ${moodColor}cc) drop-shadow(0 2px 3px rgba(0,0,0,0.4));transition:all 0.2s;" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 1 C5.5 1 1 5.5 1 11 C1 18 12 31 12 31 C12 31 23 18 23 11 C23 5.5 18.5 1 12 1 Z"
              fill="${moodColor}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/>
            <circle cx="12" cy="11" r="3.6" fill="${stroke}" opacity="0.92"/>
          </svg>
          ${isSelected ? `<div style="position:absolute;left:50%;bottom:-3px;transform:translateX(-50%);width:${w*0.9}px;height:${w*0.9}px;border-radius:50%;border:1.5px solid ${moodColor}88;animation:pulseRing 1.4s ease-out infinite;"></div>` : ""}
        </div>
      `;
      const icon = L.divIcon({ html, className: "yr-pin-icon", iconSize: [w, h], iconAnchor: [w/2, h - w/2] });
      const marker = L.marker([p.lat, p.lng], { icon, riseOnHover: true });
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        haptic("light");
        setSelectedPinId(p.id);
        setMode("idle");
      });
      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [filteredPins, selectedPinId, mapReady, isDark, showHeatmap]);

  /* ─── User marker ──────────────────────────────────────────────────── */
  useEffect(() => {
    if (!mapReady || !leafletRef.current || !mapRef.current) return;
    const L = leafletRef.current;
    const map = mapRef.current;
    if (userMarkerRef.current) { try { map.removeLayer(userMarkerRef.current); } catch {} userMarkerRef.current = null; }
    if (!userLatLng) return;
    const html = `
      <div style="position:relative;width:18px;height:18px;">
        <div style="position:absolute;inset:0;background:#22d3ee;border-radius:50%;
          border:2px solid white; box-shadow:0 0 12px #22d3eecc;"></div>
        <div style="position:absolute;inset:-8px;border-radius:50%;background:#22d3ee44;animation:gps-pulse 2s ease-in-out infinite;"></div>
      </div>
    `;
    const icon = L.divIcon({ html, className: "yr-user-marker", iconSize: [18, 18], iconAnchor: [9, 9] });
    const m = L.marker([userLatLng.lat, userLatLng.lng], { icon, interactive: false, zIndexOffset: 1000 });
    m.addTo(map);
    userMarkerRef.current = m;
  }, [userLatLng, mapReady]);

  /* ─── Locate me ────────────────────────────────────────────────────── */
  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      showToast("location not supported on this device");
      return;
    }
    haptic("medium");
    setLocationStatus("locating");
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude, longitude } = pos.coords;
      setUserLatLng({ lat: latitude, lng: longitude });
      setLocationStatus("found");
      mapRef.current?.flyTo([latitude, longitude], 14, { duration: 1.6 });
      setFoundPopup({ lat: latitude, lng: longitude });
      setTimeout(() => setFoundPopup(null), 2400);
    }, () => {
      setLocationStatus("denied");
      showToast("could not access your location");
    }, { enableHighAccuracy: true, timeout: 10000 });
  }, [showToast]);

  /* ─── Plant here (GPS or center) ───────────────────────────────────── */
  const plantHere = useCallback(() => {
    haptic("medium");
    if (userLatLng) {
      tryAnniversary(userLatLng.lat, userLatLng.lng);
      setPlacingCoords(userLatLng);
      setMode("writing");
    } else if (mapRef.current) {
      const c = mapRef.current.getCenter();
      tryAnniversary(c.lat, c.lng);
      setPlacingCoords({ lat: c.lat, lng: c.lng });
      setMode("writing");
    }
  }, [userLatLng]);

  /* ─── Anniversary detection ────────────────────────────────────────── */
  const tryAnniversary = useCallback((lat, lng) => {
    const week = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const nearby = pins
      .filter((p) => p.createdAt && (now - p.createdAt) > week)
      .map((p) => ({ p, d: distanceM(lat, lng, p.lat, p.lng) }))
      .filter((x) => x.d <= ANNIVERSARY_RADIUS_M)
      .sort((a, b) => a.d - b.d);
    if (nearby.length > 0) {
      const old = nearby[0].p;
      const months = monthsBetween(old.createdAt, now);
      const label = months < 1 ? "earlier this month" :
                    months === 1 ? "1 month ago" :
                    months < 12 ? `${months} months ago` :
                    months < 24 ? "a year ago" :
                    `${Math.floor(months / 12)} years ago`;
      const moodLabel = (old.moodLabel || getMoodByKey(old.mood, isDark).label).toLowerCase();
      setAnniversaryHint(`${label}, feeling ${moodLabel}`);
    } else {
      setAnniversaryHint(null);
    }
  }, [pins, isDark]);

  /* ─── Save (new pin) ───────────────────────────────────────────────── */
  const handleSavePin = (pin) => {
    setPins((prev) => [...prev, pin]);
    setMode("idle");
    setPlacingCoords(null);
    setAnniversaryHint(null);
    showToast("memory planted ✦");
    // kick off geocoding for this pin
    reverseGeocode(pin.lat, pin.lng).then((result) => {
      if (result.city || result.country) {
        setPins((prev) => prev.map((p) => p.id === pin.id ? { ...p, city: result.city, country: result.country } : p));
      }
    });
  };

  /* ─── Save (edit) ──────────────────────────────────────────────────── */
  const handleSaveEdit = (updatedPin) => {
    setPins((prev) => prev.map((p) => p.id === updatedPin.id ? updatedPin : p));
    setEditingPin(null);
    showToast("memory updated ✦");
  };

  /* ─── Forget ───────────────────────────────────────────────────────── */
  const handleForget = (id) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
    setSelectedPinId(null);
    setForgetTargetId(null);
    showToast("memory forgotten");
  };

  /* ─── Import ───────────────────────────────────────────────────────── */
  const handleImport = (importedPins) => {
    setPins((prev) => {
      const existingIds = new Set(prev.map((p) => p.id));
      const merged = [...prev];
      importedPins.forEach((p) => {
        if (!existingIds.has(p.id)) {
          merged.push({
            ...p,
            id: p.id || `imported-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            createdAt: p.createdAt || Date.now(),
            city: p.city || "",
            country: p.country || "",
          });
        }
      });
      return merged;
    });
    showToast(`${importedPins.length} memories imported ✦`);
  };

  /* ─── Backup tracking ──────────────────────────────────────────────── */
  const handleExported = () => {
    const now = Date.now();
    setLastBackupAt(now);
    setLastBackupAtState(now);
    setShowBackupNudge(false);
  };

  /* ─── Reset view ───────────────────────────────────────────────────── */
  const resetView = () => {
    haptic("light");
    mapRef.current?.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1.4 });
    setSelectedPinId(null);
    setMode("idle");
  };

  /* ─── Random memory ────────────────────────────────────────────────── */
  const randomMemory = () => {
    if (pins.length === 0) { showToast("plant a memory first ✦"); return; }
    haptic("medium");
    const p = pins[Math.floor(Math.random() * pins.length)];
    mapRef.current?.flyTo([p.lat, p.lng], 13, { duration: 1.8 });
    setSelectedPinId(p.id);
  };

  /* ─── Tour ─────────────────────────────────────────────────────────── */
  const beginTour = () => {
    setOnboardPhase("tour");
    setTourStep(0);
    setSelectedPinId(null);
  };
  const endTour = () => {
    safeSetItem(ONBOARDED_KEY, "1");
    setLastSeenVersion(APP_VERSION);
    setOnboardPhase("idle");
  };
  const advanceTour = () => {
    if (tourStep < TOUR_STEPS.length - 1) setTourStep((s) => s + 1);
    else endTour();
  };

  /* ─── Notifications enable ─────────────────────────────────────────── */
  const enableNotifications = async () => {
    haptic("light");
    const granted = await requestNotificationPermission();
    setNotifPermission(granted ? "granted" : (Notification?.permission || "denied"));
    if (granted) showToast("location reminders enabled ✦");
  };

  /* ─── What's new dismiss ───────────────────────────────────────────── */
  const dismissWhatsNew = () => {
    setLastSeenVersion(APP_VERSION);
    setShowWhatsNew(false);
    setWhatsNewIsFirstAck(false);
  };

  /* ─── Update banner ────────────────────────────────────────────────── */
  const applyUpdate = () => {
    haptic("medium");
    const w = window.__yearningWaitingWorker;
    if (w) try { w.postMessage({ type: "SKIP_WAITING" }); } catch {}
    setTimeout(() => window.location.reload(), 600);
  };

  const selectedPin = useMemo(() => pins.find((p) => p.id === selectedPinId), [pins, selectedPinId]);
  const showPinCard = selectedPin && !editingPin && !sharingPin && !forgetTargetId;

  const toggleMoodFilter = (key) => {
    haptic("light");
    setActiveMoodFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toolBg = T.toolBg, toolBorder = T.toolBorder, toolColor = T.toolColor;
  const toolBtnStyle = {
    background: toolBg,
    border: `1px solid ${toolBorder}`,
    color: toolColor,
    boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
  };
  const placingActive = mode === "placing";

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <div ref={mapContainerRef} style={{ position: "fixed", inset: 0, zIndex: 0 }} />

      {/* Header — top left */}
      <div style={{
        position: "fixed", top: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))",
        left: 14, zIndex: 100, pointerEvents: "none",
        background: T.headerGrad,
        padding: "8px 14px 18px 4px", borderRadius: 8,
      }}>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 22, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.04em", lineHeight: 1 }}>
          Yearning
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontStyle: "italic", fontSize: 11, color: T.textMuted, letterSpacing: "0.14em", marginTop: 4, fontWeight: 500 }}>
          leave a part of yourself somewhere
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 11, color: T.textSec, letterSpacing: "0.08em", marginTop: 8, fontWeight: 600 }}>
          {pins.length} {pins.length === 1 ? "memory" : "memories"}
        </div>
        {(stats.cities > 0 || stats.countries > 0) && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.06em", marginTop: 2, fontStyle: "italic" }}>
            {stats.cities} {stats.cities === 1 ? "city" : "cities"} · {stats.countries} {stats.countries === 1 ? "country" : "countries"}
          </div>
        )}
      </div>

      {/* Place search */}
      {mapReady && <SearchBox isDark={isDark} />}

      {/* Zoom controls — mid-left, vertically centered */}
      {mapReady && (
        <div style={{
          position: "fixed", left: 14, top: "50%", transform: "translateY(-50%)",
          zIndex: 110, display: "flex", flexDirection: "column", gap: 6,
        }}>
          <button aria-label="Zoom in" title="Zoom in"
            onClick={() => { haptic("light"); mapRef.current?.zoomIn(); }}
            style={{
              width: 44, height: 44, borderRadius: 8, cursor: "pointer",
              background: isDark ? "rgba(11,10,17,0.92)" : "#ffffff",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)"}`,
              color: isDark ? "rgba(232,228,217,0.95)" : "#0a0908",
              fontSize: 22, fontWeight: 500, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
              transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
            }}
          >+</button>
          <button aria-label="Zoom out" title="Zoom out"
            onClick={() => { haptic("light"); mapRef.current?.zoomOut(); }}
            style={{
              width: 44, height: 44, borderRadius: 8, cursor: "pointer",
              background: isDark ? "rgba(11,10,17,0.92)" : "#ffffff",
              border: `1px solid ${isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.22)"}`,
              color: isDark ? "rgba(232,228,217,0.95)" : "#0a0908",
              fontSize: 24, fontWeight: 500, lineHeight: 1,
              display: "flex", alignItems: "center", justifyContent: "center",
              backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 2px 8px rgba(0,0,0,0.12)",
              transition: "all 0.15s", WebkitTapHighlightColor: "transparent",
            }}
          >−</button>
        </div>
      )}

      {/* Right toolbar */}
      <div style={{
        position: "fixed", top: "max(14px, calc(env(safe-area-inset-top, 0px) + 14px))",
        right: 14, zIndex: 110,
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        <ToolBtn id="btn-locate" title="Locate me" onClick={locate} style={toolBtnStyle}>
          {locationStatus === "locating" ? <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>◴</span> : "◎"}
        </ToolBtn>
        <ToolBtn id="btn-plant" title="Plant here" onClick={plantHere}
          style={{ background: isDark ? "rgba(168,85,247,0.18)" : "rgba(109,40,217,0.12)", border: `1px solid ${isDark ? "#a855f7" : "#6d28d9"}`, color: isDark ? "#c084fc" : "#6d28d9" }}>
          ✦
        </ToolBtn>
        <ToolBtn id="btn-place" title={placingActive ? "Cancel placing" : "Tap anywhere to plant"}
          onClick={() => setMode((m) => (m === "placing" ? "idle" : "placing"))}
          style={placingActive
            ? { background: isDark ? "rgba(168,85,247,0.32)" : "rgba(109,40,217,0.2)", border: `1px solid ${isDark ? "#a855f7" : "#6d28d9"}`, color: isDark ? "#c084fc" : "#6d28d9" }
            : toolBtnStyle}>
          +
        </ToolBtn>
        <ToolBtn id="btn-search" title="Search memories" onClick={() => setShowMemorySearch(true)} style={toolBtnStyle}>⌕</ToolBtn>
        <ToolBtn id="btn-heatmap" title={showHeatmap ? "Hide heatmap" : "Show heatmap"}
          onClick={() => { haptic("light"); setShowHeatmap((s) => !s); }}
          style={showHeatmap
            ? { background: isDark ? "rgba(168,85,247,0.28)" : "rgba(109,40,217,0.18)", border: `1px solid ${isDark ? "#a855f7" : "#6d28d9"}`, color: isDark ? "#c084fc" : "#6d28d9" }
            : toolBtnStyle}>
          ⌘
        </ToolBtn>
        <ToolBtn id="btn-reset" title="Reset view" onClick={resetView} style={toolBtnStyle}>⌂</ToolBtn>
        <ToolBtn id="btn-random" title="Random memory" onClick={randomMemory} style={toolBtnStyle}>↝</ToolBtn>
        <ToolBtn id="btn-theme" title="Toggle theme" onClick={() => setIsDark((d) => !d)} style={toolBtnStyle}>◑</ToolBtn>
        <ToolBtn id="btn-exportimport" title="Export / Import" onClick={() => setShowExportImport(true)} style={toolBtnStyle}>⬇</ToolBtn>
        <ToolBtn id="btn-tipjar" title="Support" onClick={() => setShowTipJar(true)} style={toolBtnStyle}>☕</ToolBtn>
        <ToolBtn id="btn-help" title="Help" onClick={() => setShowHelp(true)} style={toolBtnStyle}>i</ToolBtn>
      </div>

      {/* Mood legend / filter chips */}
      <div style={{
        position: "fixed", left: 14,
        bottom: dateBounds ? "max(86px, calc(env(safe-area-inset-bottom, 0px) + 86px))" : "max(14px, calc(env(safe-area-inset-bottom, 0px) + 14px))",
        zIndex: 100,
        display: "flex", flexWrap: "wrap", gap: 6, maxWidth: "min(320px, calc(100vw - 28px))",
      }}>
        {T.moods.map((m) => {
          const active = activeMoodFilters.has(m.key);
          const dimmed = activeMoodFilters.size > 0 && !active;
          return (
            <button key={m.key} onClick={() => toggleMoodFilter(m.key)} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              background: active ? `${m.color}28` : T.legendChipBg,
              border: `1px solid ${active ? m.color : T.legendChipBorder}`,
              borderRadius: 14, padding: "5px 10px",
              cursor: "pointer", transition: "all 0.15s",
              backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
              opacity: dimmed ? 0.45 : 1,
              minHeight: 28, fontFamily: "'Lora',serif",
              boxShadow: isDark ? "0 2px 6px rgba(0,0,0,0.35)" : "0 2px 6px rgba(0,0,0,0.1)",
            }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, boxShadow: `0 0 5px ${m.color}aa`, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: active ? m.color : T.textSec, letterSpacing: "0.08em", fontWeight: active ? 700 : 500 }}>
                {m.label}
              </span>
            </button>
          );
        })}
        {(activeMoodFilters.size > 0 || (dateFilterRange && dateBounds && (dateFilterRange[0] !== dateBounds[0] || dateFilterRange[1] !== dateBounds[1]))) && (
          <button onClick={() => { haptic("light"); setActiveMoodFilters(new Set()); if (dateBounds) setDateFilterRange([dateBounds[0], dateBounds[1]]); }}
            style={{
              background: "transparent", border: `1px dashed ${T.panelBorder}`,
              borderRadius: 14, padding: "5px 10px", cursor: "pointer",
              fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted,
              letterSpacing: "0.1em", fontStyle: "italic", minHeight: 28, fontWeight: 500,
            }}>
            clear filters
          </button>
        )}
      </div>

      {/* Time travel slider */}
      {dateBounds && dateFilterRange && (
        <TimeSlider minTs={dateBounds[0]} maxTs={dateBounds[1]} range={dateFilterRange} setRange={setDateFilterRange} isDark={isDark} />
      )}

      {/* Found-you popup */}
      {foundPopup && mapRef.current && <FoundPopup lat={foundPopup.lat} lng={foundPopup.lng} mapInstance={mapRef.current} />}

      {/* Pin card */}
      {showPinCard && (
        <PinCard
          pin={selectedPin}
          mapInstance={mapRef.current}
          isDark={isDark}
          onClose={() => setSelectedPinId(null)}
          onForget={(id) => setForgetTargetId(id)}
          onEdit={(p) => setEditingPin(p)}
          onShare={(p) => setSharingPin(p)}
        />
      )}

      {/* Writing modal — new pin */}
      {mode === "writing" && placingCoords && !editingPin && (
        <WritingModal
          coords={placingCoords}
          onSave={handleSavePin}
          onCancel={() => { setMode("idle"); setPlacingCoords(null); setAnniversaryHint(null); }}
          isDark={isDark}
          anniversaryHint={anniversaryHint}
        />
      )}

      {/* Edit modal */}
      {editingPin && (
        <WritingModal
          existingPin={editingPin}
          onSave={handleSaveEdit}
          onCancel={() => setEditingPin(null)}
          isDark={isDark}
        />
      )}

      {/* Share card */}
      {sharingPin && (
        <ShareCardModal pin={sharingPin} isDark={isDark} onClose={() => setSharingPin(null)} />
      )}

      {/* Memory search */}
      {showMemorySearch && (
        <MemorySearchModal
          pins={pins}
          isDark={isDark}
          onClose={() => setShowMemorySearch(false)}
          onSelect={(p) => {
            setShowMemorySearch(false);
            setSelectedPinId(p.id);
            mapRef.current?.flyTo([p.lat, p.lng], 14, { duration: 1.6 });
          }}
        />
      )}

      {/* Forget modal */}
      {forgetTargetId && (
        <ForgetModal
          pin={pins.find((p) => p.id === forgetTargetId)}
          onConfirm={() => handleForget(forgetTargetId)}
          onCancel={() => setForgetTargetId(null)}
          isDark={isDark}
        />
      )}

      {/* Export/Import */}
      {showExportImport && (
        <ExportImportModal
          pins={pins}
          onImport={handleImport}
          onClose={() => setShowExportImport(false)}
          onExported={handleExported}
          isDark={isDark}
          lastBackupAt={lastBackupAt}
        />
      )}

      {/* Tip Jar */}
      {showTipJar && <TipJarModal onClose={() => setShowTipJar(false)} isDark={isDark} />}

      {/* Help */}
      {showHelp && (
        <HelpModal
          onClose={() => setShowHelp(false)}
          isDark={isDark}
          onEnableNotifications={enableNotifications}
          notifPermission={notifPermission}
          onShowChangelog={() => { setShowHelp(false); setShowWhatsNew(true); setWhatsNewIsFirstAck(false); }}
          pinCount={pins.length}
          listeningDays={listeningDays}
        />
      )}

      {/* What's new */}
      {showWhatsNew && (
        <WhatsNewModal
          entries={CHANGELOG}
          isFirstAcknowledgement={whatsNewIsFirstAck}
          onClose={dismissWhatsNew}
          isDark={isDark}
          pinCount={pins.length}
        />
      )}

      {/* Update banner */}
      {showUpdateBanner && !showWhatsNew && !showBackupNudge && !onThisDayPin && (
        <UpdateBanner isDark={isDark} onApply={applyUpdate} onDismiss={() => setShowUpdateBanner(false)} />
      )}

      {/* Backup nudge */}
      {showBackupNudge && !showWhatsNew && !onThisDayPin && (
        <BackupNudge
          isDark={isDark}
          daysAgo={lastBackupAt ? daysBetween(lastBackupAt, Date.now()) : Math.min(99, daysBetween(getFirstRunAt(), Date.now()))}
          onExport={() => { setShowBackupNudge(false); setShowExportImport(true); }}
          onDismiss={() => { setShowBackupNudge(false); setLastBackupAt(Date.now() - (BACKUP_NUDGE_DAYS - 3) * 86400000); /* snooze ~3 days */ }}
        />
      )}

      {/* On this day */}
      {onThisDayPin && !showWhatsNew && (
        <OnThisDayNudge
          pin={onThisDayPin}
          isDark={isDark}
          onView={() => {
            const p = onThisDayPin;
            setOnThisDayPin(null);
            setAnnivDismissed();
            setSelectedPinId(p.id);
            mapRef.current?.flyTo([p.lat, p.lng], 14, { duration: 1.8 });
          }}
          onDismiss={() => { setOnThisDayPin(null); setAnnivDismissed(); }}
        />
      )}

      {/* Welcome / Tour */}
      {onboardPhase === "welcome" && (
        <WelcomeModal onStartTour={beginTour} onSkip={endTour} />
      )}
      {onboardPhase === "tour" && (
        <TourOverlay
          step={tourStep}
          total={TOUR_STEPS.length}
          onNext={advanceTour}
          onPrev={() => setTourStep((s) => Math.max(0, s - 1))}
          onSkip={endTour}
        />
      )}

      {/* First plant nudge */}
      {showFirstNudge && !showWhatsNew && pins.length === 0 && (
        <FirstPlantNudge
          isDark={isDark}
          hasLocation={!!userLatLng}
          onPlantHere={() => { setShowFirstNudge(false); plantHere(); }}
          onPlantWhere={() => { setShowFirstNudge(false); setMode("placing"); showToast("tap anywhere on the map ✦", 3000); }}
          onDismiss={() => setShowFirstNudge(false)}
        />
      )}

      {/* Placing mode hint */}
      {placingActive && (
        <div style={{
          position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
          pointerEvents: "none", zIndex: 90, textAlign: "center",
          fontFamily: "'Playfair Display',serif", fontStyle: "italic",
          fontSize: 17, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(10,9,8,0.5)",
          letterSpacing: "0.08em", animation: "fadeIn 0.3s ease",
          textShadow: isDark ? "0 2px 12px rgba(0,0,0,0.8)" : "0 2px 12px rgba(255,255,255,0.7)",
        }}>
          tap anywhere to plant a thought
        </div>
      )}

      <Toast msg={toast} isDark={isDark} />
      <SpeedInsights />
      <Analytics />
    </>
  );
}