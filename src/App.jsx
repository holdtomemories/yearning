import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from '@vercel/speed-insights/react';
import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Constants ─────────────────────────────────────────────────────────── */
const STORAGE_KEY   = "yearning_pins_v3";
const ONBOARDED_KEY = "yearning_onboarded_v3";
const KOFI_URL      = "https://ko-fi.com/donatetoyearning";
const DEFAULT_CENTER = [20, 0];
const DEFAULT_ZOOM   = 2;
const TILE_ATTR      = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const TILE_DARK  = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

const MOODS = [
  { key: "wonder",    label: "Wonder",    color: "#c084fc" },
  { key: "peace",     label: "Peace",     color: "#67e8f9" },
  { key: "longing",   label: "Longing",   color: "#fb923c" },
  { key: "joy",       label: "Joy",       color: "#86efac" },
  { key: "ache",      label: "Ache",      color: "#f87171" },
  { key: "gratitude", label: "Gratitude", color: "#fde68a" },
  { key: "other",     label: "Other…",    color: "#a8a29e" },
];

const TOUR_STEPS = [
  { targetId: "btn-locate",        title: "Locate Me",       desc: "Flies to your GPS position on the map and drops a live pulse marker where you are." },
  { targetId: "btn-plant",         title: "Plant Here ✦",    desc: "Instantly plants a memory pin at your GPS location — or at the map center if location is off." },
  { targetId: "btn-place",         title: "Tap Anywhere +",  desc: "Activates placement mode. Tap any spot on the map or long-press to instantly plant a memory." },
  { targetId: "btn-reset",         title: "Reset View ⌂",    desc: "Returns the map to the default world view — handy when you're lost in a zoom." },
  { targetId: "btn-theme",         title: "Light / Dark ◑",  desc: "Toggle between a moody dark map and a clean light map. Colors adapt automatically." },
  { targetId: "search-container",  title: "Search Places",   desc: "Type any city, country, or address to fly the map there instantly." },
  { targetId: "btn-tipjar",        title: "Support ☕",      desc: "Keep Yearning free — buy us a coffee if it brings you joy." },
  { targetId: "btn-help",          title: "Help Center i",   desc: "This button always brings you back here. Your guide lives here permanently." },
];

/* ─── Helpers ───────────────────────────────────────────────────────────── */
const getMood = (key) => MOODS.find((m) => m.key === key) ?? MOODS[0];

function loadPins() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function savePins(pins) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pins)); } catch {}
}
function haptic(style = "light") {
  try {
    if (navigator.vibrate) navigator.vibrate(style === "heavy" ? 30 : style === "medium" ? 15 : 8);
  } catch {}
}

/* ─── CSS ───────────────────────────────────────────────────────────────── */
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Lora:ital,wght@0,400;0,500;1,400;1,500&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a0f; }

  .leaflet-container { background: #0a0a0f !important; }
  .leaflet-control-zoom a {
    background: rgba(12,11,18,0.92) !important;
    color: rgba(232,228,217,0.7) !important;
    border-color: rgba(255,255,255,0.1) !important;
    width: 36px !important; height: 36px !important; line-height: 36px !important;
  }
  .leaflet-control-zoom a:hover { background: rgba(30,28,45,0.95) !important; color: #e8e4d9 !important; }
  .leaflet-control-attribution { background: rgba(10,10,15,0.6) !important; color: rgba(255,255,255,0.22) !important; font-size: 9px !important; }
  .leaflet-control-attribution a { color: rgba(255,255,255,0.32) !important; }
  .leaflet-popup-content-wrapper, .leaflet-popup-tip-container { display: none !important; }

  @keyframes gps-pulse  { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.5);opacity:0} }
  @keyframes fadeUp     { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
  @keyframes fadeIn     { from{opacity:0} to{opacity:1} }
  @keyframes toastIn    { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes spin       { to{transform:rotate(360deg)} }
  @keyframes popIn      { 0%{opacity:0;transform:scale(0.95)} 100%{opacity:1;transform:scale(1)} }
  @keyframes slideDown  { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pulseRing  { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }

  textarea { resize: none; }
  ::-webkit-scrollbar { width: 3px; }
  ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

  .yr-tool-btn {
    width: 48px; height: 48px; border-radius: 6px; cursor: pointer;
    backdrop-filter: blur(10px); display: flex; align-items: center; justify-content: center;
    font-size: 17px; transition: all 0.18s; border: 1px solid;
    -webkit-tap-highlight-color: transparent; user-select: none; flex-shrink: 0;
  }
  .yr-tool-btn:active { transform: scale(0.92); }

  .yr-mood-chip {
    padding: 7px 14px; border-radius: 20px; cursor: pointer; border: 1.5px solid;
    font-family: 'Lora', serif; font-size: 12.5px; letter-spacing: 0.1em;
    transition: all 0.15s; white-space: nowrap; -webkit-tap-highlight-color: transparent;
  }

  .yr-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.62); backdrop-filter: blur(6px);
    display: flex; align-items: center; justify-content: center;
    animation: fadeIn 0.2s ease; z-index: 200;
  }
  .yr-modal { animation: fadeUp 0.28s ease forwards; }

  .yr-spotlight {
    position: absolute; border-radius: 50%;
    border: 2px solid rgba(192,132,252,0.85);
    pointer-events: none; z-index: 1001;
    animation: pulseRing 1.5s ease-out infinite;
  }
  .yr-tour-tip {
    position: absolute;
    background: rgba(11,10,17,0.97);
    border: 1px solid rgba(192,132,252,0.4);
    border-top: 2px solid rgba(192,132,252,0.8);
    border-radius: 0 0 6px 6px;
    padding: 14px 16px 12px; width: 240px;
    z-index: 1002; animation: slideDown 0.25s ease;
    box-shadow: 0 12px 40px rgba(0,0,0,0.65);
  }

  .yr-search-input {
    width: 100%; background: rgba(11,10,17,0.92);
    border: 1px solid rgba(255,255,255,0.1); border-radius: 4px;
    padding: 10px 36px 10px 14px;
    color: #e8e4d9; font-family: 'Lora', serif; font-size: 13px; letter-spacing: 0.06em;
    outline: none; backdrop-filter: blur(12px); transition: border-color 0.2s;
  }
  .yr-search-input::placeholder { color: rgba(232,228,217,0.35); font-style: italic; }
  .yr-search-input:focus { border-color: rgba(192,132,252,0.5); }
  .yr-search-result {
    padding: 10px 14px; cursor: pointer;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    font-family: 'Lora', serif; font-size: 12.5px;
    color: rgba(232,228,217,0.75); letter-spacing: 0.04em; transition: background 0.12s;
  }
  .yr-search-result:hover { background: rgba(192,132,252,0.1); color: #c084fc; }
  .yr-search-result:last-child { border-bottom: none; }

  .yr-found-popup {
    position: absolute; pointer-events: none;
    background: rgba(11,10,17,0.97);
    border: 1px solid rgba(103,232,249,0.4); border-radius: 4px;
    padding: 7px 13px; white-space: nowrap;
    font-family: 'Lora', serif; font-size: 12px;
    color: #67e8f9; letter-spacing: 0.14em; font-style: italic;
    animation: fadeUp 0.3s ease; z-index: 600;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    transform: translate(-50%, calc(-100% - 20px));
  }
  .yr-found-popup::after {
    content: ''; position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
    width: 0; height: 0;
    border-left: 6px solid transparent; border-right: 6px solid transparent;
    border-top: 6px solid rgba(103,232,249,0.4);
  }

  .yr-pin-card {
    position: absolute; z-index: 300;
    animation: popIn 0.25s ease;
  }
`;

/* ─── Theme tokens ──────────────────────────────────────────────────────── */
function useTheme(isDark) {
  return {
    panelBg:     isDark ? "rgba(11,10,17,0.97)"    : "rgba(250,248,244,0.97)",
    panelBorder: isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)",
    textPrimary: isDark ? "#e8e4d9"                : "#1a1814",
    textSec:     isDark ? "rgba(232,228,217,0.72)" : "rgba(26,24,20,0.72)",
    textMuted:   isDark ? "rgba(232,228,217,0.45)" : "rgba(26,24,20,0.45)",
    toolBg:      isDark ? "rgba(11,10,17,0.88)"    : "rgba(250,248,244,0.88)",
    headerGrad:  isDark
      ? "linear-gradient(to bottom,rgba(10,10,15,0.92) 0%,transparent 100%)"
      : "linear-gradient(to bottom,rgba(250,248,244,0.92) 0%,transparent 100%)",
    legendChipBg: isDark ? "rgba(10,10,15,0.65)" : "rgba(250,248,244,0.75)",
  };
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

function Overlay({ zIndex = 200, onClose, children }) {
  return (
    <div
      className="yr-overlay"
      style={{ zIndex }}
      onClick={(e) => e.target === e.currentTarget && onClose?.()}
    >
      {children}
    </div>
  );
}

function ToolBtn({ id, title, onClick, style, children, className = "" }) {
  return (
    <button
      id={id}
      className={`yr-tool-btn ${className}`}
      title={title}
      style={style}
      onClick={() => { haptic("light"); onClick?.(); }}
    >
      {children}
    </button>
  );
}

function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{
      position: "absolute", bottom: 26, left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(11,10,17,0.94)", backdropFilter: "blur(12px)",
      border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4,
      padding: "9px 20px", zIndex: 600,
      fontFamily: "'Lora',serif", fontSize: 12.5,
      color: "rgba(232,228,217,0.72)", letterSpacing: "0.14em", fontStyle: "italic",
      whiteSpace: "nowrap", pointerEvents: "none",
      animation: "toastIn 0.25s ease",
      boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    }}>{msg}</div>
  );
}

/* ─── Writing modal ─────────────────────────────────────────────────────── */
function WritingModal({ coords, onSave, onCancel, isDark }) {
  const T = useTheme(isDark);
  const [draft, setDraft] = useState({ title: "", body: "", mood: "wonder", customMood: "" });
  const mood = getMood(draft.mood);

  const valid = draft.title.trim() && draft.body.trim() &&
    (draft.mood !== "other" || draft.customMood.trim());

  const handleSave = () => {
    if (!valid) return;
    haptic("medium");
    const moodLabel = draft.mood === "other" ? draft.customMood.trim() : mood.label;
    const moodColor = draft.mood === "other" ? MOODS[6].color : mood.color;
    onSave({
      id: Date.now().toString(),
      lat: coords.lat, lng: coords.lng,
      title: draft.title.trim(), body: draft.body.trim(),
      mood: draft.mood, customMood: draft.mood === "other" ? draft.customMood.trim() : "",
      moodLabel, moodColor,
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    });
  };

  return (
    <Overlay zIndex={200} onClose={onCancel}>
      <div
        className="yr-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxWidth: "94vw",
          background: T.panelBg, backdropFilter: "blur(20px)",
          border: `1px solid ${mood.color}22`,
          borderTop: `2px solid ${mood.color}66`,
          borderRadius: "0 0 6px 6px",
          padding: "26px 26px 22px",
          boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
        }}
      >
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 20, fontWeight: 400, color: T.textPrimary, letterSpacing: "0.02em", marginBottom: 4 }}>
          plant a thought here
        </div>
        {coords && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.14em", marginBottom: 20 }}>
            {coords.lat.toFixed(5)}, {coords.lng.toFixed(5)}
          </div>
        )}

        {/* Mood chips */}
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 10 }}>mood</div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: draft.mood === "other" ? 10 : 18 }}>
          {MOODS.map((m) => (
            <button
              key={m.key}
              className="yr-mood-chip"
              onClick={() => { haptic("light"); setDraft((d) => ({ ...d, mood: m.key })); }}
              style={{
                background:  draft.mood === m.key ? `${m.color}18` : "transparent",
                borderColor: draft.mood === m.key ? `${m.color}99` : T.panelBorder,
                color:       draft.mood === m.key ? m.color : T.textMuted,
                fontWeight:  draft.mood === m.key ? 500 : 400,
                boxShadow:   draft.mood === m.key ? `0 0 10px ${m.color}30` : "none",
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Custom mood */}
        {draft.mood === "other" && (
          <input
            autoFocus
            placeholder="how are you feeling?"
            value={draft.customMood}
            onChange={(e) => setDraft((d) => ({ ...d, customMood: e.target.value }))}
            style={{
              width: "100%", background: "transparent", border: "none",
              borderBottom: `1px solid ${MOODS[6].color}55`,
              padding: "7px 0", marginBottom: 14,
              color: T.textSec, fontFamily: "'Lora',serif", fontSize: 14,
              fontStyle: "italic", outline: "none", letterSpacing: "0.06em",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) => e.target.style.borderColor = `${MOODS[6].color}88`}
            onBlur={(e)  => e.target.style.borderColor = `${MOODS[6].color}55`}
          />
        )}

        {/* Title */}
        <input
          autoFocus={draft.mood !== "other"}
          placeholder="Give this moment a name…"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          style={{
            width: "100%", background: "transparent", border: "none",
            borderBottom: `1px solid ${draft.title ? mood.color + "55" : T.panelBorder}`,
            padding: "9px 0", marginBottom: 15,
            color: T.textPrimary, fontFamily: "'Playfair Display',serif", fontSize: 17,
            outline: "none", letterSpacing: "0.04em", transition: "border-color 0.2s",
          }}
          onFocus={(e) => e.target.style.borderColor = `${mood.color}55`}
          onBlur={(e)  => e.target.style.borderColor = draft.title ? `${mood.color}55` : T.panelBorder}
        />

        {/* Body */}
        <textarea
          rows={5}
          placeholder="What do you want to remember about this place?"
          value={draft.body}
          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          style={{
            width: "100%",
            background: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
            border: `1px solid ${T.panelBorder}`, borderRadius: 3,
            padding: 12, marginBottom: 20,
            color: T.textSec, fontFamily: "'Lora',serif",
            fontSize: 14.5, lineHeight: 1.85, fontStyle: "italic",
            outline: "none", letterSpacing: "0.02em",
          }}
          onFocus={(e) => e.target.style.borderColor = `${mood.color}44`}
          onBlur={(e)  => e.target.style.borderColor = T.panelBorder}
        />

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={() => { haptic("light"); onCancel(); }}
            style={{
              background: "transparent", border: `1px solid ${T.panelBorder}`,
              color: T.textMuted, padding: "9px 20px", borderRadius: 3,
              cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.1em",
            }}
          >discard</button>
          <button
            onClick={handleSave}
            disabled={!valid}
            style={{
              background: valid ? `${mood.color}18` : "transparent",
              border: `1px solid ${valid ? mood.color + "77" : T.panelBorder}`,
              color: valid ? mood.color : T.textMuted,
              padding: "9px 24px", borderRadius: 3,
              cursor: valid ? "pointer" : "not-allowed",
              fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.12em", transition: "all 0.2s",
            }}
          >plant it</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Forget modal ──────────────────────────────────────────────────────── */
function ForgetModal({ pin, onConfirm, onCancel, isDark }) {
  const T = useTheme(isDark);
  const moodColor = pin.moodColor || getMood(pin.mood).color;
  const moodLabel = pin.moodLabel || getMood(pin.mood).label;
  return (
    <Overlay zIndex={500} onClose={onCancel}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 400, maxWidth: "90vw",
        background: T.panelBg, backdropFilter: "blur(20px)",
        border: "1px solid rgba(248,113,113,0.14)",
        borderTop: "2px solid rgba(248,113,113,0.4)",
        borderRadius: "0 0 6px 6px",
        padding: "30px 28px 26px", textAlign: "center",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        <div style={{ fontSize: 30, marginBottom: 16, color: moodColor, filter: `blur(0.5px) drop-shadow(0 0 10px ${moodColor}55)`, opacity: 0.6 }}>◈</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: "rgba(248,113,113,0.6)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 12 }}>let go of this memory?</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 19, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.02em", marginBottom: 5, lineHeight: 1.35 }}>{pin.title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: moodColor + "99", letterSpacing: "0.18em", marginBottom: 20 }}>{moodLabel} · {pin.date}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.88, fontStyle: "italic", marginBottom: 20, letterSpacing: "0.02em" }}>
          Once forgotten, this memory will be gone<br />from this earth — quietly and permanently.
          <br /><span style={{ color: T.textMuted, fontSize: 12.5 }}>There is no way to bring it back.</span>
        </div>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(248,113,113,0.07)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 3, padding: "8px 16px", marginBottom: 24 }}>
          <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(248,113,113,0.7)", flexShrink: 0 }} />
          <span style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: "rgba(248,113,113,0.75)", letterSpacing: "0.16em" }}>this cannot be undone</span>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => { haptic("light"); onCancel(); }}
            style={{ background: "transparent", border: `1px solid ${T.panelBorder}`, color: T.textSec, padding: "10px 26px", borderRadius: 3, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", transition: "all 0.18s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = T.textPrimary; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = T.textSec; e.currentTarget.style.borderColor = T.panelBorder; }}
          >keep it</button>
          <button
            onClick={() => { haptic("heavy"); onConfirm(); }}
            style={{ background: "rgba(248,113,113,0.09)", border: "1px solid rgba(248,113,113,0.32)", color: "rgba(248,113,113,0.65)", padding: "10px 26px", borderRadius: 3, cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.14em", transition: "all 0.18s" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.16)"; e.currentTarget.style.color = "rgba(248,113,113,0.9)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.55)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(248,113,113,0.09)"; e.currentTarget.style.color = "rgba(248,113,113,0.65)"; e.currentTarget.style.borderColor = "rgba(248,113,113,0.32)"; }}
          >let it go</button>
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Tip Jar ───────────────────────────────────────────────────────────── */
function TipJarModal({ onClose, isDark }) {
  const T = useTheme(isDark);
  return (
    <Overlay zIndex={300} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 360, maxWidth: "88vw", textAlign: "center",
        background: T.panelBg, backdropFilter: "blur(20px)",
        border: "1px solid rgba(253,230,138,0.18)", borderTop: "2px solid rgba(253,230,138,0.5)",
        borderRadius: "0 0 6px 6px", padding: "30px 28px 26px", position: "relative",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        <div style={{ fontSize: 36, marginBottom: 14, filter: "drop-shadow(0 0 12px rgba(253,230,138,0.45))" }}>☕</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 21, fontWeight: 500, color: T.textPrimary, letterSpacing: "0.03em", marginBottom: 10 }}>help yearning keep memories</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.82, fontStyle: "italic", marginBottom: 22, letterSpacing: "0.02em" }}>
          We built yearning to help you hold onto the moments that matter most. And we want to keep it free, always.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
          {[{ l: "☕ $3", s: "a coffee" }, { l: "☕☕ $6", s: "two coffees" }, { l: "✦ $12", s: "you're amazing" }].map((t) => (
            <a key={t.l} href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
              flex: 1, textDecoration: "none",
              background: "rgba(253,230,138,0.07)", border: "1px solid rgba(253,230,138,0.2)",
              borderRadius: 4, padding: "10px 6px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(253,230,138,0.9)", letterSpacing: "0.06em" }}>{t.l}</div>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: "rgba(253,230,138,0.5)", letterSpacing: "0.14em", fontStyle: "italic" }}>{t.s}</div>
            </a>
          ))}
        </div>
        <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
          display: "block", textDecoration: "none",
          background: "rgba(253,230,138,0.1)", border: "1px solid rgba(253,230,138,0.35)",
          borderRadius: 4, padding: 11,
          fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(253,230,138,0.85)", letterSpacing: "0.14em",
        }}>support yearning on ko-fi →</a>
        <div style={{ marginTop: 14, fontFamily: "'Lora',serif", fontSize: 11, color: T.textMuted, letterSpacing: "0.12em", fontStyle: "italic" }}>
          no account needed · opens in a new tab
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Help modal ────────────────────────────────────────────────────────── */
function HelpModal({ onClose, isDark }) {
  const T = useTheme(isDark);
  const tools = [
    { icon: "◎", col: "#67e8f9",                   label: "Locate Me",      desc: "Flies to your GPS position and shows a live pulse marker." },
    { icon: "✦", col: "#c084fc",                   label: "Plant Here",     desc: "Plants a pin at your GPS location, or at the map center if location is unavailable." },
    { icon: "+", col: T.textSec,                   label: "Tap Anywhere",   desc: "Enter placing mode — tap any spot, or long-press for an instant plant." },
    { icon: "⌂", col: T.textMuted,                 label: "Reset View",     desc: "Flies back to the world view at default zoom." },
    { icon: "↝", col: T.textMuted,                 label: "Random Memory",  desc: "Jumps to a random memory you've planted." },
    { icon: "◑", col: "rgba(253,230,138,0.85)",    label: "Light / Dark",   desc: "Toggle between dark and light map themes. All colors adapt." },
    { icon: "☕", col: "rgba(253,230,138,0.7)",     label: "Support",        desc: "Keep Yearning free with a small tip." },
    { icon: "i", col: "rgba(103,232,249,0.75)",    label: "Help Center",    desc: "This panel — your guide lives here permanently.", italic: true },
  ];
  const Tag = ({ c, children }) => (
    <span style={{
      background: c === "cyan" ? "rgba(103,232,249,0.12)" : "rgba(134,239,172,0.12)",
      color: c === "cyan" ? "rgba(103,232,249,0.9)" : "rgba(134,239,172,0.9)",
      padding: "1px 7px", borderRadius: 2, fontSize: 11.5,
      fontStyle: "normal", fontFamily: "'Lora',serif", letterSpacing: "0.04em",
    }}>{children}</span>
  );
  return (
    <Overlay zIndex={300} onClose={onClose}>
      <div className="yr-modal" onClick={(e) => e.stopPropagation()} style={{
        width: 440, maxWidth: "94vw",
        background: T.panelBg, backdropFilter: "blur(20px)",
        border: "1px solid rgba(103,232,249,0.15)", borderTop: "2px solid rgba(103,232,249,0.5)",
        borderRadius: "0 0 6px 6px", padding: "30px 28px 26px", position: "relative",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
      }}>
        <button onClick={() => { haptic("light"); onClose(); }} style={{ position: "absolute", top: 14, right: 16, background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1 }}>×</button>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 14 }}>help center</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 21, fontWeight: 500, color: T.textPrimary, marginBottom: 22 }}>how to use yearning</div>

        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 14 }}>your tools</div>
        {tools.map(({ icon, col, label, desc, italic }) => (
          <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 4, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
              border: `1px solid ${T.panelBorder}`,
              color: col, fontSize: italic ? 16 : 15,
              fontFamily: italic ? "'Lora',serif" : "inherit",
              fontStyle: italic ? "italic" : "normal",
            }}>{icon}</div>
            <div style={{ paddingTop: 2 }}>
              <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
              <div style={{ fontFamily: "'Lora',serif", fontStyle: "italic", fontSize: 13.5, color: T.textSec, lineHeight: 1.7 }}>{desc}</div>
            </div>
          </div>
        ))}

        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "16px 0 14px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 11 }}>moods</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
          {MOODS.map((m) => (
            <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: m.color, boxShadow: `0 0 5px ${m.color}88` }} />
              <span style={{ fontFamily: "'Lora',serif", fontSize: 12.5, color: T.textSec }}>{m.label}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${T.panelBorder}`, margin: "20px 0 16px" }} />
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: T.textMuted, letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 6 }}>add to homescreen</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, fontStyle: "italic", marginBottom: 14, lineHeight: 1.65 }}>Keep yearning just a tap away — it works like a native app.</div>

        {[
          { bg: "rgba(103,232,249,", label: "iPhone · Safari", col: "cyan", steps: ["Tap the", "Share", "button at the bottom", "Scroll and tap", "Add to Home Screen", "", "Tap", "Add", "in the top right corner"] },
          { bg: "rgba(134,239,172,", label: "Android · Chrome", col: "green", steps: ["Tap the", "⋮", "menu in the top right", "Tap", "Add to Home screen", "", "Tap", "Add", "to confirm"] },
        ].map(({ bg, label, col, steps }) => (
          <div key={label} style={{ background: `${bg}0.05)`, border: `1px solid ${bg}0.15)`, borderLeft: `2px solid ${bg}0.5)`, borderRadius: "0 4px 4px 0", padding: "13px 15px", marginBottom: 10 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: `${bg}0.8)`, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 9 }}>{label}</div>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec, lineHeight: 1.7, fontStyle: "italic", marginBottom: i < 2 ? 5 : 0 }}>
                {i + 1}. {steps[i * 3]} <Tag c={col}>{steps[i * 3 + 1]}</Tag> {steps[i * 3 + 2]}
              </div>
            ))}
          </div>
        ))}
        <div style={{ marginTop: 14, fontFamily: "'Lora',serif", fontSize: 11.5, color: T.textMuted, letterSpacing: "0.1em", fontStyle: "italic", textAlign: "center" }}>
          no download needed · your data stays on your device
        </div>
      </div>
    </Overlay>
  );
}

/* ─── Onboarding welcome ────────────────────────────────────────────────── */
function WelcomeModal({ onStartTour, onSkip }) {
  return (
    <div style={{
      position: "absolute", inset: 0,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)",
      zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center",
      animation: "fadeIn 0.35s ease",
    }}>
      <div className="yr-modal" style={{
        width: 450, maxWidth: "94vw",
        background: "rgba(11,10,17,0.97)",
        border: "1px solid rgba(192,132,252,0.14)", borderTop: "2px solid rgba(192,132,252,0.55)",
        borderRadius: "0 0 6px 6px", padding: "38px 34px 30px",
        boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
      }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: "rgba(232,228,217,0.45)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 16 }}>welcome</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 28, fontWeight: 500, color: "#e8e4d9", letterSpacing: "0.03em", lineHeight: 1, marginBottom: 8 }}>Welcome to Yearning</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(232,228,217,0.45)", fontStyle: "italic", letterSpacing: "0.1em", marginBottom: 24 }}>leave a part of yourself somewhere</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14.5, color: "rgba(232,228,217,0.72)", lineHeight: 1.88, fontStyle: "italic", letterSpacing: "0.02em" }}>
          A quiet place to plant your thoughts, feelings, and memories exactly where they happened — anywhere on earth.
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, background: "rgba(103,232,249,0.05)", border: "1px solid rgba(103,232,249,0.15)", borderLeft: "2px solid rgba(103,232,249,0.55)", padding: "14px 16px", margin: "24px 0 26px" }}>
          <div style={{ fontSize: 15, color: "rgba(103,232,249,0.8)", marginTop: 1, flexShrink: 0 }}>◉</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 13.5, color: "rgba(232,228,217,0.72)", lineHeight: 1.8, letterSpacing: "0.02em" }}>
            <span style={{ color: "#e8e4d9", fontStyle: "italic" }}>Your memories never leave your device.</span><br />
            Everything is stored locally — no servers, no accounts, no tracking.
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "space-between", alignItems: "center" }}>
          <button
            onClick={() => { haptic("light"); onSkip(); }}
            style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(232,228,217,0.45)", fontFamily: "'Lora',serif", fontSize: 12, letterSpacing: "0.16em", cursor: "pointer", padding: "10px 20px", borderRadius: 3, transition: "all 0.15s" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(232,228,217,0.7)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.22)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(232,228,217,0.45)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
          >skip tour</button>
          <button
            onClick={() => { haptic("medium"); onStartTour(); }}
            style={{ background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.5)", color: "rgba(192,132,252,0.92)", fontFamily: "'Lora',serif", fontSize: 13, letterSpacing: "0.2em", padding: "11px 30px", borderRadius: 3, cursor: "pointer", transition: "all 0.18s" }}
          >show me around →</button>
        </div>
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
      const rad = Math.max(r.width, r.height) / 2 + 10;
      let tipTop = cy + rad + 14;
      if (tipTop + tipH > window.innerHeight - 20) tipTop = cy - rad - tipH - 14;
      let tipLeft = cx - tipW / 2;
      tipLeft = Math.max(14, Math.min(tipLeft, window.innerWidth - tipW - 14));
      setTipPos({ top: tipTop, left: tipLeft });
    }, 0);
  }, [step]);

  if (!rect) return null;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const rad = Math.max(rect.width, rect.height) / 2 + 10;
  const { title, desc } = TOUR_STEPS[step];

  return (
    <>
      {/* Dim backdrop */}
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 999, pointerEvents: "none", animation: "fadeIn 0.2s ease" }} />
      {/* Spotlight ring */}
      <div className="yr-spotlight" style={{ left: cx - rad, top: cy - rad, width: rad * 2, height: rad * 2 }} />
      {/* Tooltip */}
      <div ref={tipRef} className="yr-tour-tip" style={{ top: tipPos.top, left: tipPos.left }}>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: "rgba(192,132,252,0.7)", letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 6 }}>{step + 1} of {total}</div>
        <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 16, color: "#e8e4d9", marginBottom: 8, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 13, color: "rgba(232,228,217,0.7)", lineHeight: 1.7, fontStyle: "italic", marginBottom: 14 }}>{desc}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "space-between", alignItems: "center" }}>
          <button onClick={() => { haptic("light"); onSkip(); }} style={{ background: "transparent", border: "none", color: "rgba(232,228,217,0.4)", fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.14em", cursor: "pointer", padding: 0 }}>skip</button>
          <div style={{ display: "flex", gap: 6 }}>
            {step > 0 && (
              <button onClick={() => { haptic("light"); onPrev(); }} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(232,228,217,0.5)", fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.14em", cursor: "pointer", padding: "6px 14px", borderRadius: 3 }}>← back</button>
            )}
            <button onClick={() => { haptic("medium"); onNext(); }} style={{ background: "rgba(192,132,252,0.12)", border: "1px solid rgba(192,132,252,0.5)", color: "rgba(192,132,252,0.92)", fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.18em", cursor: "pointer", padding: "6px 16px", borderRadius: 3 }}>
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
  const T = useTheme(isDark);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const timerRef = useRef(null);
  const mapRef = useRef(null);

  // Get map ref from window (set during Yearning init)
  useEffect(() => { mapRef.current = window.__yearningMap; }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`, { headers: { "Accept-Language": "en" } });
        const data = await res.json();
        setResults(data);
      } catch { setResults([]); }
    }, 400);
  }, [query]);

  const flyTo = (r) => {
    haptic("light");
    const m = window.__yearningMap;
    if (m) m.flyTo([parseFloat(r.lat), parseFloat(r.lon)], 12, { duration: 1.5 });
    setQuery(r.display_name.split(",").slice(0, 2).join(", "));
    setResults([]);
  };

  return (
    <div id="search-container" style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", width: "min(360px, calc(100vw - 120px))", zIndex: 110 }}>
      <div style={{ position: "relative" }}>
        <input
          className="yr-search-input"
          type="text"
          placeholder="search a place…"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { setQuery(""); setResults([]); e.target.blur(); } }}
        />
        {query && (
          <button onClick={() => { haptic("light"); setQuery(""); setResults([]); }} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "rgba(232,228,217,0.4)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 2 }}>×</button>
        )}
      </div>
      {results.length > 0 && (
        <div style={{ background: "rgba(11,10,17,0.97)", border: "1px solid rgba(255,255,255,0.1)", borderTop: "none", borderRadius: "0 0 4px 4px", overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
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

/* ─── Found-you popup (map-anchored) ────────────────────────────────────── */
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
  return (
    <div className="yr-found-popup" style={{ left: pos.x, top: pos.y }}>
      Found you ✦
    </div>
  );
}

/* ─── Pin card (map-anchored below pin) ─────────────────────────────────── */
function PinCard({ pin, mapInstance, isDark, onClose, onForget }) {
  const T = useTheme(isDark);
  const [pos, setPos] = useState({ left: 0, top: 0, width: 320 });
  const moodColor = pin.moodColor || getMood(pin.mood).color;
  const moodLabel = pin.moodLabel || getMood(pin.mood).label;

  useEffect(() => {
    if (!mapInstance) return;
    const update = () => {
      const pt = mapInstance.latLngToContainerPoint([pin.lat, pin.lng]);
      const cardW = Math.min(320, window.innerWidth - 28);
      let left = pt.x - cardW / 2;
      left = Math.max(14, Math.min(left, window.innerWidth - cardW - 14));
      const top = pt.y + 44;
      setPos({ left, top, width: cardW });
    };
    update();
    mapInstance.on("move zoom", update);
    return () => mapInstance.off("move zoom", update);
  }, [pin, mapInstance]);

  return (
    <div className="yr-pin-card" style={{ left: pos.left, top: pos.top, width: pos.width }}>
      <div style={{
        background: T.panelBg, backdropFilter: "blur(18px)",
        border: `1px solid ${moodColor}22`, borderLeft: `3px solid ${moodColor}`,
        borderRadius: "0 4px 4px 0",
        padding: "18px 16px 13px",
        boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
        maxHeight: "48vh", overflowY: "auto",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
          <div style={{ flex: 1, paddingRight: 10 }}>
            <div style={{ fontFamily: "'Lora',serif", fontSize: 10, color: moodColor, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 5 }}>
              {moodLabel} · {pin.date}
            </div>
            <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 17, fontWeight: 500, color: T.textPrimary, lineHeight: 1.3 }}>
              {pin.title}
            </div>
          </div>
          <button onClick={() => { haptic("light"); onClose(); }} style={{ background: "transparent", border: "none", color: T.textMuted, cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ fontFamily: "'Lora',serif", fontSize: 14, color: T.textSec, lineHeight: 1.8, fontStyle: "italic" }}>
          {pin.body}
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.panelBorder}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 9.5, color: T.textMuted, letterSpacing: "0.06em" }}>
            {pin.lat.toFixed(4)}, {pin.lng.toFixed(4)}
          </div>
          <button
            onClick={() => { haptic("medium"); onForget(pin.id); }}
            style={{ background: "transparent", border: "none", color: "rgba(248,113,113,0.45)", cursor: "pointer", fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.1em", transition: "color 0.2s" }}
            onMouseEnter={(e) => e.currentTarget.style.color = "rgba(248,113,113,0.75)"}
            onMouseLeave={(e) => e.currentTarget.style.color = "rgba(248,113,113,0.45)"}
          >forget this</button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export default function Yearning() {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const tileLayerRef    = useRef(null);
  const markersRef      = useRef({});
  const userMarkerRef   = useRef(null);
  const leafletRef      = useRef(null);
  const longPressTimer  = useRef(null);
  const toastTimer      = useRef(null);

  const [pins,          setPins]          = useState(loadPins);
  const [selectedPinId, setSelectedPinId] = useState(null);
  const [mode,          setMode]          = useState("view"); // view | placing | writing
  const [placingCoords, setPlacingCoords] = useState(null);
  const [isDark,        setIsDark]        = useState(true);
  const [mapReady,      setMapReady]      = useState(false);
  const [toast,         setToast]         = useState(null);
  const [userLatLng,    setUserLatLng]    = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [forgetTargetId, setForgetTargetId] = useState(null);
  const [foundPopup,    setFoundPopup]    = useState(null); // { lat, lng }
  const [showTipJar,    setShowTipJar]    = useState(false);
  const [showHelp,      setShowHelp]      = useState(false);

  // Onboarding: null | "welcome" | "tour"
  const [onboardPhase, setOnboardPhase] = useState(() => {
    try { return localStorage.getItem(ONBOARDED_KEY) ? null : "welcome"; } catch { return "welcome"; }
  });
  const [tourStep, setTourStep] = useState(0);

  /* ── Persist ── */
  useEffect(() => { savePins(pins); }, [pins]);

  /* ── Theme token snapshot for map callbacks ── */
  const isDarkRef = useRef(isDark);
  useEffect(() => { isDarkRef.current = isDark; }, [isDark]);

  /* ── Toast ── */
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  /* ── Init Leaflet ── */
  const initMap = useCallback(() => {
    if (mapRef.current || !mapContainerRef.current || !window.L) return;
    const L = window.L;
    leafletRef.current = L;

    const map = L.map(mapContainerRef.current, {
      center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
      zoomControl: false, attributionControl: false,
    });

    tileLayerRef.current = L.tileLayer(TILE_DARK, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    mapRef.current = map;
    window.__yearningMap = map;
    setMapReady(true);

    // Location-based default view (returning users)
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

  /* ── Theme tile swap ── */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [isDark, mapReady]);

  /* ── Pin icons ── */
  const createPinIcon = useCallback((pin, isSelected = false) => {
    const L = leafletRef.current;
    if (!L) return null;
    const color = pin.moodColor || getMood(pin.mood).color;
    const size = isSelected ? 34 : 26;
    const html = `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 10px ${color}55)">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);border:2px solid rgba(255,255,255,0.28);box-shadow:0 0 ${isSelected ? 18 : 8}px ${color}88;transition:all 0.2s"></div>
      <div style="width:2px;height:8px;background:${color};opacity:0.7;margin-top:-1px"></div>
    </div>`;
    return L.divIcon({ html, className: "", iconSize: [size + 4, size + 16], iconAnchor: [(size + 4) / 2, size + 16] });
  }, []);

  /* ── Re-render markers ── */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};
    pins.forEach((pin) => {
      const icon = createPinIcon(pin, pin.id === selectedPinId);
      const marker = L.marker([pin.lat, pin.lng], { icon }).addTo(map);
      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        haptic("light");
        setSelectedPinId((prev) => prev === pin.id ? null : pin.id);
      });
      markersRef.current[pin.id] = marker;
    });
  }, [pins, mapReady, selectedPinId, createPinIcon]);

  /* ── Map click ── */
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handleClick = (e) => {
      if (modeRef.current === "placing") {
        openWriting({ lat: e.latlng.lat, lng: e.latlng.lng });
      } else {
        setSelectedPinId(null);
      }
    };
    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapReady]);

  /* ── Long press ── */
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !mapReady) return;
    let lpStart = null;

    const start = (e) => {
      if (modeRef.current !== "view") return;
      const touch = e.touches?.[0];
      lpStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
      longPressTimer.current = setTimeout(() => {
        const map = mapRef.current;
        if (!map) return;
        const rect = container.getBoundingClientRect();
        const pt = touch
          ? map.containerPointToLatLng([touch.clientX - rect.left, touch.clientY - rect.top])
          : map.getCenter();
        haptic("medium");
        openWriting({ lat: pt.lat, lng: pt.lng });
        showToast("long-press pinned ✦");
      }, 600);
    };
    const move = (e) => {
      if (!lpStart || !e.touches) return;
      const t = e.touches[0];
      if (Math.abs(t.clientX - lpStart.x) > 8 || Math.abs(t.clientY - lpStart.y) > 8) {
        clearTimeout(longPressTimer.current); lpStart = null;
      }
    };
    const cancel = () => { clearTimeout(longPressTimer.current); lpStart = null; };

    container.addEventListener("touchstart", start, { passive: true });
    container.addEventListener("touchmove",  move,  { passive: true });
    container.addEventListener("touchend",   cancel);
    container.addEventListener("mousedown",  start);
    container.addEventListener("mouseup",    cancel);
    container.addEventListener("mousemove",  cancel);
    return () => {
      container.removeEventListener("touchstart", start);
      container.removeEventListener("touchmove",  move);
      container.removeEventListener("touchend",   cancel);
      container.removeEventListener("mousedown",  start);
      container.removeEventListener("mouseup",    cancel);
      container.removeEventListener("mousemove",  cancel);
    };
  }, [mapReady, showToast]);

  /* ── Cursor ── */
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
        const pulseHtml = `<div style="position:relative;width:20px;height:20px;"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(103,232,249,0.18);animation:gps-pulse 2s infinite"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#67e8f9;border:2px solid white;box-shadow:0 0 8px #67e8f9"></div></div>`;
        userMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({ html: pulseHtml, className: "", iconSize: [20, 20], iconAnchor: [10, 10] }),
          zIndexOffset: 1000,
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
    const map = mapRef.current;
    if (!map) return;
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
    setSelectedPinId(null);
    setForgetTargetId(null);
    showToast("gently forgotten ·˚");
  };

  /* ── Onboarding ── */
  const finishOnboarding = () => {
    try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch {}
    setOnboardPhase(null);
    setTourStep(0);
  };
  const skipOnboarding = () => {
    finishOnboarding();
    showToast("help is always in the i button ·˚");
  };

  /* ── Derived ── */
  const T = useTheme(isDark);
  const selectedPin = pins.find((p) => p.id === selectedPinId);
  const forgetTargetPin = pins.find((p) => p.id === forgetTargetId);

  return (
    <div style={{ width: "100%", height: "100vh", background: "#0a0a0f", overflow: "hidden", position: "relative" }}>
      <style>{GLOBAL_CSS}</style>

      {/* Map */}
      <div ref={mapContainerRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "18px 22px 44px",
        background: T.headerGrad,
        pointerEvents: "none",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 26, fontWeight: 400, color: T.textPrimary, letterSpacing: "0.06em", lineHeight: 1 }}>yearning</div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 10.5, color: T.textMuted, letterSpacing: "0.12em", marginTop: 4, fontStyle: "italic" }}>leave a part of yourself somewhere</div>
        </div>
        {pins.length > 0 && (
          <div style={{ fontFamily: "'Lora',serif", fontSize: 11.5, color: T.textMuted, letterSpacing: "0.1em", marginTop: 4 }}>
            {pins.length} {pins.length === 1 ? "memory" : "memories"}
          </div>
        )}
      </div>

      {/* Search */}
      {mapReady && <SearchBox isDark={isDark} />}

      {/* Right toolbar */}
      {mode !== "placing" && (
        <div id="toolbar" style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", zIndex: 100, display: "flex", flexDirection: "column", gap: 8 }}>

          {/* Locate */}
          <button
            id="btn-locate"
            className="yr-tool-btn"
            title="Locate me"
            onClick={requestLocation}
            style={{
              background: locationStatus === "granted" ? "rgba(103,232,249,0.12)" : T.toolBg,
              borderColor: locationStatus === "granted" ? "rgba(103,232,249,0.45)" : T.panelBorder,
              color: locationStatus === "granted" ? "#67e8f9" : T.textSec,
            }}
          >
            {locationStatus === "requesting"
              ? <div style={{ width: 14, height: 14, border: "2px solid rgba(103,232,249,0.3)", borderTopColor: "#67e8f9", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              : "◎"}
          </button>

          {/* Plant here */}
          <ToolBtn id="btn-plant" title={userLatLng ? "Plant at my location" : "Plant at map center"}
            onClick={() => { haptic("medium"); userLatLng ? openWriting(userLatLng) : plantAtCenter(); }}
            style={{ background: "rgba(192,132,252,0.1)", borderColor: "rgba(192,132,252,0.35)", color: "#c084fc" }}>
            ✦
          </ToolBtn>

          {/* Tap anywhere */}
          <ToolBtn id="btn-place" title="Tap anywhere on map"
            onClick={() => { haptic("light"); setMode("placing"); setSelectedPinId(null); }}
            style={{ background: T.toolBg, borderColor: T.panelBorder, color: T.textSec, fontSize: 22 }}>
            +
          </ToolBtn>

          {/* Random memory */}
          {pins.length > 0 && (
            <ToolBtn id="btn-random" title="Jump to a random memory"
              onClick={jumpRandom}
              style={{ background: T.toolBg, borderColor: T.panelBorder, color: T.textMuted, fontSize: 14 }}>
              ↝
            </ToolBtn>
          )}

          {/* Reset view */}
          <ToolBtn id="btn-reset" title="Reset view"
            onClick={resetView}
            style={{ background: T.toolBg, borderColor: T.panelBorder, color: T.textMuted, fontSize: 16 }}>
            ⌂
          </ToolBtn>

          {/* Divider */}
          <div style={{ height: 1, background: T.panelBorder, borderRadius: 1, margin: "2px 6px" }} />

          {/* Theme toggle */}
          <ToolBtn id="btn-theme" title={isDark ? "Switch to light map" : "Switch to dark map"}
            onClick={() => { haptic("light"); setIsDark((v) => !v); }}
            style={{ background: T.toolBg, borderColor: T.panelBorder, color: T.textMuted, fontSize: 14 }}>
            ◑
          </ToolBtn>

          {/* Tip jar */}
          <ToolBtn id="btn-tipjar" title="Support Yearning"
            onClick={() => { haptic("light"); setShowTipJar(true); }}
            style={{ background: T.toolBg, borderColor: T.panelBorder, color: T.textMuted }}>
            ☕
          </ToolBtn>

          {/* Help */}
          <ToolBtn id="btn-help" title="Help"
            onClick={() => { haptic("light"); setShowHelp(true); }}
            style={{ background: T.toolBg, borderColor: T.panelBorder, color: T.textMuted, fontFamily: "'Lora',serif", fontStyle: "italic", fontWeight: 500, fontSize: 16 }}>
            i
          </ToolBtn>
        </div>
      )}

      {/* Cancel placing */}
      {mode === "placing" && (
        <button
          className="yr-tool-btn"
          onClick={() => { haptic("light"); setMode("view"); }}
          style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", zIndex: 100, background: "rgba(248,113,113,0.09)", borderColor: "rgba(248,113,113,0.32)", color: "rgba(248,113,113,0.75)", fontSize: 20 }}
        >×</button>
      )}

      {/* Mood legend */}
      <div style={{ position: "absolute", left: 14, bottom: 56, zIndex: 100, display: "flex", flexDirection: "column", gap: 6 }}>
        {MOODS.filter((m) => m.key !== "other").map((m) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, flexShrink: 0, boxShadow: `0 0 4px ${m.color}88` }} />
            <span style={{
              fontFamily: "'Lora',serif", fontSize: 11, letterSpacing: "0.14em",
              color: T.textPrimary,
              background: T.legendChipBg,
              padding: "1px 6px", borderRadius: 3, backdropFilter: "blur(4px)",
            }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Placing hint */}
      {mode === "placing" && (
        <div style={{
          position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)",
          background: T.panelBg, backdropFilter: "blur(12px)",
          border: `1px solid ${T.panelBorder}`, borderRadius: 4,
          padding: "10px 22px", zIndex: 100,
          fontFamily: "'Lora',serif", fontSize: 13, color: T.textSec,
          letterSpacing: "0.12em", fontStyle: "italic",
          animation: "fadeUp 0.25s ease", whiteSpace: "nowrap",
        }}>
          tap anywhere · or long-press to plant instantly
        </div>
      )}

      {/* Empty state */}
      {pins.length === 0 && mode === "view" && mapReady && !selectedPinId && (
        <div style={{
          position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)",
          background: T.panelBg, backdropFilter: "blur(12px)",
          border: `1px solid ${T.panelBorder}`, borderRadius: 4,
          padding: "12px 22px", zIndex: 100, textAlign: "center",
          animation: "fadeUp 0.4s ease",
          boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontFamily: "'Playfair Display',serif", fontSize: 15, color: T.textPrimary, letterSpacing: "0.04em", marginBottom: 4 }}>
            the map is waiting
          </div>
          <div style={{ fontFamily: "'Lora',serif", fontSize: 12, color: T.textMuted, fontStyle: "italic", letterSpacing: "0.08em" }}>
            tap <strong style={{ fontStyle: "normal", color: "#c084fc" }}>✦</strong> or <strong style={{ fontStyle: "normal", color: T.textSec }}>+</strong> to plant your first memory
          </div>
        </div>
      )}

      {/* Pin card anchored to map */}
      {selectedPin && mode === "view" && mapRef.current && (
        <PinCard
          pin={selectedPin}
          mapInstance={mapRef.current}
          isDark={isDark}
          onClose={() => setSelectedPinId(null)}
          onForget={setForgetTargetId}
        />
      )}

      {/* Found-you popup */}
      {foundPopup && mapRef.current && (
        <FoundPopup lat={foundPopup.lat} lng={foundPopup.lng} mapInstance={mapRef.current} />
      )}

      {/* Writing modal */}
      {mode === "writing" && (
        <WritingModal coords={placingCoords} onSave={handleSave} onCancel={cancelWrite} isDark={isDark} />
      )}

      {/* Forget modal */}
      {forgetTargetId && forgetTargetPin && (
        <ForgetModal pin={forgetTargetPin} onConfirm={confirmForget} onCancel={() => setForgetTargetId(null)} isDark={isDark} />
      )}

      {/* Tip jar */}
      {showTipJar && <TipJarModal onClose={() => setShowTipJar(false)} isDark={isDark} />}

      {/* Help */}
      {showHelp && <HelpModal onClose={() => setShowHelp(false)} isDark={isDark} />}

      {/* Onboarding welcome */}
      {onboardPhase === "welcome" && (
        <WelcomeModal
          onStartTour={() => { setOnboardPhase("tour"); setTourStep(0); }}
          onSkip={skipOnboarding}
        />
      )}

      {/* Tour */}
      {onboardPhase === "tour" && (
        <TourOverlay
          step={tourStep}
          total={TOUR_STEPS.length}
          onNext={() => {
            if (tourStep >= TOUR_STEPS.length - 1) { finishOnboarding(); showToast("you're all set ✦"); }
            else setTourStep((s) => s + 1);
          }}
          onPrev={() => setTourStep((s) => Math.max(0, s - 1))}
          onSkip={skipOnboarding}
        />
      )}

      {/* Toast */}
      <Toast msg={toast} />
       <SpeedInsights />
        <Analytics />
    </div>
  );
}