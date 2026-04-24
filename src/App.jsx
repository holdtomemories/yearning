import { useState, useEffect, useRef, useCallback } from "react";

/* ─── Constants ──────────────────────────────────────────────────────────── */
const STORAGE_KEY   = "yearning_pins_v3";
const ONBOARDED_KEY = "yearning_onboarded_v2";
const TILE_THEMES = {
  dark:    { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",         label: "Dark" },
  dim:     { url: "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",    label: "Dim" },
  minimal: { url: "https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png",   label: "Minimal" },
  light:   { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",        label: "Light" },
};
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';
const KOFI_URL  = "https://ko-fi.com/donatetoyearning";
const DEFAULT_CENTER = [20, 0];
const DEFAULT_ZOOM   = 2;

const MOODS = [
  { key: "wonder",    label: "Wonder",    color: "#c084fc" },
  { key: "peace",     label: "Peace",     color: "#67e8f9" },
  { key: "longing",   label: "Longing",   color: "#fb923c" },
  { key: "joy",       label: "Joy",       color: "#86efac" },
  { key: "ache",      label: "Ache",      color: "#f87171" },
  { key: "gratitude", label: "Gratitude", color: "#fde68a" },
];

const getMood = (key) => MOODS.find((m) => m.key === key) ?? MOODS[0];

function loadPins() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
}
function savePins(pins) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pins)); } catch {}
}

/* ─── Tiny sub-components ────────────────────────────────────────────────── */
const Tag = ({ c, children }) => (
  <span style={{
    background: c === "cyan" ? "rgba(103,232,249,0.12)" : "rgba(134,239,172,0.12)",
    color:      c === "cyan" ? "rgba(103,232,249,0.9)"  : "rgba(134,239,172,0.9)",
    padding: "1px 7px", borderRadius: 2, fontSize: 11.5,
    fontStyle: "normal", fontFamily: "'Lora',serif", letterSpacing: "0.04em",
  }}>{children}</span>
);

const Step = ({ n, c, children }) => (
  <div style={{ display:"flex", gap:10, alignItems:"flex-start", marginBottom:7 }}>
    <div style={{ fontFamily:"'Lora',serif", fontSize:11, color:c, minWidth:14, marginTop:2 }}>{n}</div>
    <div style={{ fontFamily:"'Lora',serif", fontSize:13.5, color:"rgba(232,228,217,0.72)", lineHeight:1.55, fontStyle:"italic" }}>{children}</div>
  </div>
);

/* ─── Overlay backdrop ───────────────────────────────────────────────────── */
const Overlay = ({ zIndex = 200, onClose, children }) => (
  <div
    onClick={(e) => e.target === e.currentTarget && onClose?.()}
    style={{
      position:"absolute", inset:0,
      background:"rgba(0,0,0,0.6)", backdropFilter:"blur(6px)",
      zIndex, display:"flex", alignItems:"center", justifyContent:"center",
      animation:"fadeIn 0.2s ease",
    }}
  >{children}</div>
);

/* ─── Main component ─────────────────────────────────────────────────────── */
export default function Yearning() {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const tileLayerRef    = useRef(null);
  const markersRef      = useRef({});
  const userMarkerRef   = useRef(null);
  const leafletRef      = useRef(null);
  const longPressTimer  = useRef(null);

  const [pins,        setPins]        = useState(loadPins);
  const [selectedPin, setSelectedPin] = useState(null);
  const [mode,        setMode]        = useState("view");   // view | placing | writing
  const [placingCoords, setPlacingCoords] = useState(null);
  const [draft,       setDraft]       = useState({ title:"", body:"", mood:"wonder" });
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle"); // idle|requesting|granted|denied
  const [mapReady,    setMapReady]    = useState(false);
  const [toast,       setToast]       = useState(null);
  const [mapTheme,    setMapTheme]    = useState("dark");
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showTipJar,  setShowTipJar]  = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);
  const [forgetTarget, setForgetTarget] = useState(null); // pin id to confirm delete
  const [onboardingStep, setOnboardingStep] = useState(() => {
    try { return localStorage.getItem(ONBOARDED_KEY) ? null : "welcome"; } catch { return "welcome"; }
  });
  // PWA install nudge
  const [showInstallNudge, setShowInstallNudge] = useState(false);

  const toastTimer = useRef(null);
  const showToast = useCallback((msg) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  const dismissOnboarding = () => {
    try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch {}
    setOnboardingStep(null);
    setShowHelp(false);
  };

  /* ── Persist pins ── */
  useEffect(() => { savePins(pins); }, [pins]);

  /* ── PWA nudge: show after 2 visits if not standalone ── */
  useEffect(() => {
    const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    if (!isStandalone) {
      const visitCount = parseInt(localStorage.getItem("yearning_visits") || "0") + 1;
      localStorage.setItem("yearning_visits", visitCount);
      if (visitCount >= 2 && !localStorage.getItem("yearning_nudge_dismissed")) {
        setTimeout(() => setShowInstallNudge(true), 4000);
      }
    }
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

    const theme = TILE_THEMES["dark"];
    tileLayerRef.current = L.tileLayer(theme.url, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    mapRef.current = map;
    setMapReady(true);
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

  /* ── Swap tile layer when theme changes ── */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    if (tileLayerRef.current) map.removeLayer(tileLayerRef.current);
    tileLayerRef.current = L.tileLayer(TILE_THEMES[mapTheme].url, {
      attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19,
    }).addTo(map);
    tileLayerRef.current.bringToBack();
  }, [mapTheme, mapReady]);

  /* ── Pin icons ── */
  const createPinIcon = useCallback((mood, isSelected = false) => {
    const L = leafletRef.current;
    if (!L) return null;
    const m = getMood(mood);
    const size = isSelected ? 34 : 26;
    const html = `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 10px ${m.color}55)">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${m.color};transform:rotate(-45deg);border:2px solid rgba(255,255,255,0.28);box-shadow:0 0 ${isSelected?18:8}px ${m.color}88;transition:all 0.2s"></div>
      <div style="width:2px;height:8px;background:${m.color};opacity:0.7;margin-top:-1px"></div>
    </div>`;
    return L.divIcon({ html, className:"", iconSize:[size+4,size+16], iconAnchor:[(size+4)/2,size+16] });
  }, []);

  /* ── Re-render markers ── */
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    if (!L || !map || !mapReady) return;
    Object.values(markersRef.current).forEach((m) => map.removeLayer(m));
    markersRef.current = {};
    pins.forEach((pin) => {
      const icon = createPinIcon(pin.mood, pin.id === selectedPin);
      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(map)
        .on("click", () => setSelectedPin((s) => s === pin.id ? null : pin.id));
      markersRef.current[pin.id] = marker;
    });
  }, [pins, mapReady, selectedPin, createPinIcon]);

  /* ── Map click → place pin ── */
  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const handleClick = (e) => {
      if (modeRef.current !== "placing") return;
      openWriting({ lat: e.latlng.lat, lng: e.latlng.lng });
    };
    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapReady]);

  /* ── Long-press on map ── */
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || !mapReady) return;

    const start = (e) => {
      if (modeRef.current !== "view") return;
      const touch = e.touches?.[0];
      longPressTimer.current = setTimeout(() => {
        const map = mapRef.current;
        if (!map) return;
        const point = touch
          ? map.containerPointToLatLng([touch.clientX - container.getBoundingClientRect().left, touch.clientY - container.getBoundingClientRect().top])
          : map.getCenter();
        openWriting({ lat: point.lat, lng: point.lng });
        showToast("long-press pinned ✦");
      }, 600);
    };
    const cancel = () => { if (longPressTimer.current) clearTimeout(longPressTimer.current); };

    container.addEventListener("touchstart", start, { passive: true });
    container.addEventListener("touchend",   cancel);
    container.addEventListener("touchmove",  cancel);
    container.addEventListener("mousedown",  start);
    container.addEventListener("mouseup",    cancel);
    container.addEventListener("mousemove",  cancel);
    return () => {
      container.removeEventListener("touchstart", start);
      container.removeEventListener("touchend",   cancel);
      container.removeEventListener("touchmove",  cancel);
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

  /* ── Open writing modal ── */
  const openWriting = (coords) => {
    setPlacingCoords(coords);
    setDraft({ title:"", body:"", mood:"wonder" });
    setMode("writing");
  };

  /* ── Locate me ── */
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) { showToast("Geolocation not supported"); return; }
    setLocationStatus("requesting");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setUserLocation({ lat, lng });
        setLocationStatus("granted");
        const L = leafletRef.current;
        const map = mapRef.current;
        if (!L || !map) return;
        if (userMarkerRef.current) map.removeLayer(userMarkerRef.current);
        const pulseHtml = `<div style="position:relative;width:20px;height:20px;"><div style="position:absolute;inset:0;border-radius:50%;background:rgba(103,232,249,0.18);animation:gps-pulse 2s infinite"></div><div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#67e8f9;border:2px solid white;box-shadow:0 0 8px #67e8f9"></div></div>`;
        userMarkerRef.current = L.marker([lat, lng], {
          icon: L.divIcon({ html: pulseHtml, className:"", iconSize:[20,20], iconAnchor:[10,10] }),
          zIndexOffset: 1000,
        }).addTo(map);
        map.flyTo([lat, lng], 15, { duration: 2 });
        showToast("Found you ✦");
      },
      () => { setLocationStatus("denied"); showToast("Location access denied"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [showToast]);

  /* ── Plant at map center (GPS-free fallback) ── */
  const plantAtCenter = () => {
    const map = mapRef.current;
    if (!map) return;
    const c = map.getCenter();
    openWriting({ lat: c.lat, lng: c.lng });
  };

  /* ── Plant at GPS location ── */
  const dropAtLocation = () => {
    if (!userLocation) return;
    openWriting(userLocation);
  };

  /* ── Save pin ── */
  const handleSave = () => {
    if (!draft.title.trim() || !draft.body.trim() || !placingCoords) return;
    const newPin = {
      id: Date.now().toString(),
      lat: placingCoords.lat, lng: placingCoords.lng,
      title: draft.title, body: draft.body, mood: draft.mood,
      date: new Date().toLocaleDateString("en-US", { month:"long", day:"numeric", year:"numeric" }),
    };
    setPins((p) => [...p, newPin]);
    setMode("view");
    setPlacingCoords(null);
    setSelectedPin(newPin.id);
    if (mapRef.current) mapRef.current.flyTo([newPin.lat, newPin.lng], 16, { duration: 1.2 });
    showToast("Memory planted ✦");
  };

  const cancelWrite = () => { setMode("view"); setPlacingCoords(null); };

  /* ── Forget flow ── */
  const forgetPin = (id) => setForgetTarget(id);
  const confirmForget = () => {
    setPins((p) => p.filter((x) => x.id !== forgetTarget));
    setSelectedPin(null);
    setForgetTarget(null);
    showToast("gently forgotten ·˚");
  };

  /* ── Reset view ── */
  const resetView = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo(DEFAULT_CENTER, DEFAULT_ZOOM, { duration: 1.4 });
    showToast("view restored");
  };

  /* ── Jump to random memory ── */
  const jumpRandom = () => {
    if (!pins.length) return;
    const pin = pins[Math.floor(Math.random() * pins.length)];
    setSelectedPin(pin.id);
    mapRef.current?.flyTo([pin.lat, pin.lng], 14, { duration: 1.6 });
  };

  const selected = pins.find((p) => p.id === selectedPin);
  const forgetTargetPin = pins.find((p) => p.id === forgetTarget);
  const isDark = mapTheme === "dark" || mapTheme === "dim";

  /* ─── Derived text colors for light/dark map theme ─── */
  const textPrimary   = isDark ? "#e8e4d9"               : "#1a1814";
  const textSecondary = isDark ? "rgba(232,228,217,0.72)" : "rgba(26,24,20,0.72)";
  const textMuted     = isDark ? "rgba(232,228,217,0.45)" : "rgba(26,24,20,0.45)";
  const panelBg       = isDark ? "rgba(11,10,17,0.97)"    : "rgba(250,248,244,0.97)";
  const panelBorder   = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  /* ─── Styles scoped to component ─── */
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Lora:ital,wght@0,400;0,500;1,400;1,500&display=swap');
    * { box-sizing: border-box; }
    .leaflet-container { background: #0a0a0f !important; }
    .leaflet-control-zoom a { background: rgba(12,11,18,0.92) !important; color: rgba(232,228,217,0.7) !important; border-color: rgba(255,255,255,0.1) !important; width:36px!important; height:36px!important; line-height:36px!important; }
    .leaflet-control-zoom a:hover { background: rgba(30,28,45,0.95) !important; color: #e8e4d9 !important; }
    .leaflet-control-attribution { background: rgba(10,10,15,0.6) !important; color: rgba(255,255,255,0.22) !important; font-size: 9px !important; }
    .leaflet-control-attribution a { color: rgba(255,255,255,0.32) !important; }
    @keyframes gps-pulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.5);opacity:0} }
    @keyframes fadeUp    { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
    @keyframes fadeIn    { from{opacity:0} to{opacity:1} }
    @keyframes toastIn   { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
    @keyframes spin      { to{transform:rotate(360deg)} }
    @keyframes ghostPin  { 0%{opacity:0;transform:scale(0.5)} 60%{opacity:1;transform:scale(1.15)} 100%{transform:scale(1)} }
    .modal-card { animation: fadeUp 0.28s ease forwards; }
    textarea  { resize:none; }
    ::-webkit-scrollbar { width:3px; }
    ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:2px; }
    .tool-btn {
      width:48px; height:48px; border-radius:6px; cursor:pointer;
      backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center;
      font-size:17px; transition:all 0.18s; border:1px solid;
      -webkit-tap-highlight-color: transparent;
    }
    .tool-btn:active { transform:scale(0.92); }
    .mood-chip {
      padding: 7px 14px; border-radius: 20px; cursor: pointer; border: 1.5px solid;
      font-family: 'Lora', serif; font-size: 12.5px; letter-spacing: 0.1em;
      transition: all 0.15s; white-space: nowrap;
    }
    .theme-btn {
      padding: 5px 12px; border-radius: 4px; cursor:pointer; border:1px solid;
      font-family:'Lora',serif; font-size:11px; letter-spacing:0.1em;
      transition:all 0.15s; white-space:nowrap;
    }
  `;

  return (
    <div style={{ width:"100%", height:"100vh", background:"#0a0a0f", overflow:"hidden", position:"relative" }}>
      <style>{css}</style>

      {/* Map */}
      <div ref={mapContainerRef} style={{ position:"absolute", inset:0, zIndex:0 }} />

      {/* Header */}
      <div style={{
        position:"absolute", top:0, left:0, right:0, zIndex:100,
        padding:"18px 22px 44px",
        background: isDark
          ? "linear-gradient(to bottom, rgba(10,10,15,0.92) 0%, transparent 100%)"
          : "linear-gradient(to bottom, rgba(250,248,244,0.92) 0%, transparent 100%)",
        pointerEvents:"none",
        display:"flex", alignItems:"flex-start", justifyContent:"space-between",
      }}>
        <div>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:26, fontWeight:400, color:textPrimary, letterSpacing:"0.06em", lineHeight:1 }}>yearning</div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:10.5, color:textMuted, letterSpacing:"0.12em", marginTop:4, fontStyle:"italic" }}>leave a part of you somewhere</div>
        </div>
        {pins.length > 0 && (
          <div style={{ fontFamily:"'Lora',serif", fontSize:11.5, color:textMuted, letterSpacing:"0.1em", marginTop:4 }}>
            {pins.length} {pins.length === 1 ? "memory" : "memories"}
          </div>
        )}
      </div>

      {/* ── Right sidebar — FUNCTIONAL tools ── */}
      <div style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", zIndex:100, display:"flex", flexDirection:"column", gap:8 }}>

        {/* Locate */}
        <button className="tool-btn" onClick={requestLocation} title="Locate me"
          style={{
            background: locationStatus === "granted" ? "rgba(103,232,249,0.12)" : (isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)"),
            borderColor: locationStatus === "granted" ? "rgba(103,232,249,0.45)" : panelBorder,
            color: locationStatus === "granted" ? "#67e8f9" : textSecondary,
          }}>
          {locationStatus === "requesting"
            ? <div style={{ width:14, height:14, border:"2px solid rgba(103,232,249,0.3)", borderTopColor:"#67e8f9", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
            : "◎"}
        </button>

        {/* Plant here (GPS) — always visible; falls back to map center */}
        {mode === "view" && (
          <button className="tool-btn"
            onClick={locationStatus === "granted" ? dropAtLocation : plantAtCenter}
            title={locationStatus === "granted" ? "Plant at my location" : "Plant at map center"}
            style={{
              background: "rgba(192,132,252,0.1)", borderColor:"rgba(192,132,252,0.35)", color:"#c084fc",
            }}>✦</button>
        )}

        {/* Tap-anywhere mode toggle */}
        {mode === "view" && (
          <button className="tool-btn" onClick={() => { setMode("placing"); setSelectedPin(null); }}
            title="Tap anywhere on map"
            style={{ background: isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)", borderColor: panelBorder, color: textSecondary, fontSize:22 }}>
            +
          </button>
        )}

        {/* Cancel placing */}
        {mode === "placing" && (
          <button className="tool-btn" onClick={() => setMode("view")}
            style={{ background:"rgba(248,113,113,0.09)", borderColor:"rgba(248,113,113,0.32)", color:"rgba(248,113,113,0.75)", fontSize:20 }}>
            ×
          </button>
        )}

        {/* Reset view */}
        {mode === "view" && (
          <button className="tool-btn" onClick={resetView} title="Reset view"
            style={{ background: isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)", borderColor: panelBorder, color: textMuted, fontSize:15 }}>
            ⊙
          </button>
        )}

        {/* Jump to random memory */}
        {mode === "view" && pins.length > 0 && (
          <button className="tool-btn" onClick={jumpRandom} title="Jump to a random memory"
            style={{ background: isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)", borderColor: panelBorder, color: textMuted, fontSize:14 }}>
            ↝
          </button>
        )}

        {/* Divider */}
        {mode === "view" && (
          <div style={{ height:1, background: isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)", borderRadius:1, margin:"2px 6px" }} />
        )}

        {/* Theme picker */}
        {mode === "view" && (
          <button className="tool-btn" onClick={() => setShowThemePicker((v) => !v)} title="Map theme"
            style={{
              background: showThemePicker ? "rgba(253,230,138,0.12)" : (isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)"),
              borderColor: showThemePicker ? "rgba(253,230,138,0.4)" : panelBorder,
              color: showThemePicker ? "rgba(253,230,138,0.9)" : textMuted,
              fontSize:14,
            }}>◐</button>
        )}

        {/* Tip jar */}
        {mode === "view" && (
          <button className="tool-btn" onClick={() => setShowTipJar(true)} title="Support Yearning"
            style={{ background: isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)", borderColor: panelBorder, color: textMuted }}>
            ☕
          </button>
        )}

        {/* Help */}
        {mode === "view" && (
          <button className="tool-btn" onClick={() => { setShowHelp(true); }} title="Help"
            style={{
              background: isDark ? "rgba(11,10,17,0.88)" : "rgba(250,248,244,0.88)",
              borderColor: panelBorder, color: textMuted,
              fontFamily:"'Lora',serif", fontStyle:"italic", fontWeight:500, fontSize:16,
            }}>i</button>
        )}
      </div>

      {/* Theme picker popover */}
      {showThemePicker && (
        <div style={{
          position:"absolute", right:74, top:"50%", transform:"translateY(-50%)",
          zIndex:150, background: panelBg, border:`1px solid ${panelBorder}`,
          borderRadius:6, padding:"10px 12px", backdropFilter:"blur(16px)",
          display:"flex", flexDirection:"column", gap:6,
          animation:"fadeUp 0.18s ease",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.15)",
        }}>
          <div style={{ fontFamily:"'Lora',serif", fontSize:9.5, color:textMuted, letterSpacing:"0.26em", textTransform:"uppercase", marginBottom:4 }}>map theme</div>
          {Object.entries(TILE_THEMES).map(([key, t]) => (
            <button key={key} className="theme-btn"
              onClick={() => { setMapTheme(key); setShowThemePicker(false); }}
              style={{
                background: mapTheme === key ? "rgba(192,132,252,0.14)" : "transparent",
                borderColor: mapTheme === key ? "rgba(192,132,252,0.55)" : panelBorder,
                color: mapTheme === key ? "#c084fc" : textSecondary,
              }}>
              {t.label}
            </button>
          ))}
        </div>
      )}

      {/* Mood legend */}
      <div style={{ position:"absolute", left:14, bottom:56, zIndex:100, display:"flex", flexDirection:"column", gap:6 }}>
        {MOODS.map((m) => (
          <div key={m.key} style={{ display:"flex", alignItems:"center", gap:8 }}>
            <div style={{ width:7, height:7, borderRadius:"50%", background:m.color, flexShrink:0, boxShadow:`0 0 4px ${m.color}88` }} />
            <span style={{
              fontFamily:"'Lora',serif", fontSize:11, letterSpacing:"0.14em",
              color: textPrimary,
              background: isDark ? "rgba(10,10,15,0.65)" : "rgba(250,248,244,0.75)",
              padding:"1px 6px", borderRadius:3, backdropFilter:"blur(4px)",
            }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Placing instruction */}
      {mode === "placing" && (
        <div style={{
          position:"absolute", bottom:30, left:"50%", transform:"translateX(-50%)",
          background: panelBg, backdropFilter:"blur(12px)",
          border:`1px solid ${panelBorder}`, borderRadius:4,
          padding:"10px 22px", zIndex:100,
          fontFamily:"'Lora',serif", fontSize:13, color:textSecondary,
          letterSpacing:"0.12em", fontStyle:"italic",
          animation:"fadeUp 0.25s ease", whiteSpace:"nowrap",
        }}>
          tap anywhere · or long-press to plant instantly
        </div>
      )}

      {/* Empty state */}
      {pins.length === 0 && mode === "view" && mapReady && (
        <div style={{
          position:"absolute", bottom:30, left:"50%", transform:"translateX(-50%)",
          background: panelBg, backdropFilter:"blur(12px)",
          border:`1px solid ${panelBorder}`, borderRadius:4,
          padding:"12px 22px", zIndex:100, textAlign:"center",
          animation:"fadeUp 0.4s ease",
          boxShadow: isDark ? "0 4px 20px rgba(0,0,0,0.4)" : "0 4px 20px rgba(0,0,0,0.1)",
        }}>
          <div style={{ fontFamily:"'Playfair Display',serif", fontSize:15, color:textPrimary, letterSpacing:"0.04em", marginBottom:4 }}>
            the map is waiting
          </div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:12, color:textMuted, fontStyle:"italic", letterSpacing:"0.08em" }}>
            tap <strong style={{ fontStyle:"normal", color: "#c084fc" }}>✦</strong> or <strong style={{ fontStyle:"normal", color:textSecondary }}>+</strong> to plant your first memory
          </div>
        </div>
      )}

      {/* Selected pin card */}
      {selected && mode === "view" && (
        <div className="modal-card" style={{
          position:"absolute", bottom:26, left:14,
          width: Math.min(340, (typeof window !== "undefined" ? window.innerWidth : 400) - 28),
          background: panelBg, backdropFilter:"blur(18px)",
          border:`1px solid ${getMood(selected.mood).color}22`,
          borderLeft:`3px solid ${getMood(selected.mood).color}`,
          borderRadius:"0 4px 4px 0",
          padding:"20px 18px 15px", zIndex:100,
          maxHeight:"52vh", overflow:"auto",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
        }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:11 }}>
            <div style={{ flex:1, paddingRight:10 }}>
              <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:getMood(selected.mood).color, letterSpacing:"0.24em", textTransform:"uppercase", marginBottom:5 }}>
                {getMood(selected.mood).label} · {selected.date}
              </div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:18, fontWeight:500, color:textPrimary, lineHeight:1.3 }}>
                {selected.title}
              </div>
            </div>
            <button onClick={() => setSelectedPin(null)} style={{ background:"transparent", border:"none", color:textMuted, cursor:"pointer", fontSize:20, lineHeight:1, padding:0, flexShrink:0 }}>×</button>
          </div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:14.5, color:textSecondary, lineHeight:1.82, fontStyle:"italic" }}>
            {selected.body}
          </div>
          <div style={{ marginTop:14, paddingTop:11, borderTop:`1px solid ${panelBorder}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontFamily:"'Lora',serif", fontSize:9.5, color:textMuted, letterSpacing:"0.06em" }}>
              {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
            </div>
            <button onClick={() => forgetPin(selected.id)} style={{
              background:"transparent", border:"none", color:"rgba(248,113,113,0.45)", cursor:"pointer",
              fontFamily:"'Lora',serif", fontSize:11, letterSpacing:"0.1em", transition:"color 0.2s",
            }}
              onMouseEnter={(e) => e.target.style.color = "rgba(248,113,113,0.75)"}
              onMouseLeave={(e) => e.target.style.color = "rgba(248,113,113,0.45)"}
            >forget this</button>
          </div>
        </div>
      )}

      {/* ── Writing modal ── */}
      {mode === "writing" && (
        <Overlay zIndex={200} onClose={cancelWrite}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{
            width:480, maxWidth:"94vw",
            background: panelBg, backdropFilter:"blur(20px)",
            border:`1px solid ${getMood(draft.mood).color}22`,
            borderTop:`2px solid ${getMood(draft.mood).color}66`,
            borderRadius:"0 0 6px 6px",
            padding:"26px 26px 22px",
            boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
          }}>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:20, fontWeight:400, color:textPrimary, letterSpacing:"0.02em", marginBottom:4 }}>
              plant a thought here
            </div>
            {placingCoords && (
              <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.14em", marginBottom:20 }}>
                {placingCoords.lat.toFixed(5)}, {placingCoords.lng.toFixed(5)}
              </div>
            )}

            {/* Mood chips */}
            <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.22em", textTransform:"uppercase", marginBottom:10 }}>mood</div>
            <div style={{ display:"flex", gap:7, flexWrap:"wrap", marginBottom:18 }}>
              {MOODS.map((m) => (
                <button key={m.key} className="mood-chip"
                  onClick={() => setDraft((d) => ({ ...d, mood: m.key }))}
                  style={{
                    background:   draft.mood === m.key ? `${m.color}18` : "transparent",
                    borderColor:  draft.mood === m.key ? `${m.color}99` : panelBorder,
                    color:        draft.mood === m.key ? m.color : textMuted,
                    fontWeight:   draft.mood === m.key ? 500 : 400,
                    boxShadow:    draft.mood === m.key ? `0 0 10px ${m.color}30` : "none",
                  }}>{m.label}</button>
              ))}
            </div>

            {/* Title */}
            <input autoFocus
              placeholder="Give this moment a name…"
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              style={{
                width:"100%", background:"transparent", border:"none",
                borderBottom:`1px solid ${draft.title ? getMood(draft.mood).color+"55" : panelBorder}`,
                padding:"9px 0", marginBottom:15,
                color:textPrimary, fontFamily:"'Playfair Display',serif", fontSize:17,
                outline:"none", letterSpacing:"0.04em", transition:"border-color 0.2s",
              }}
            />

            {/* Body */}
            <textarea rows={5}
              placeholder="What do you want to remember about this place?"
              value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
              style={{
                width:"100%", background: isDark ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.025)",
                border:`1px solid ${panelBorder}`, borderRadius:3,
                padding:12, marginBottom:20,
                color:textSecondary, fontFamily:"'Lora',serif",
                fontSize:14.5, lineHeight:1.85, fontStyle:"italic",
                outline:"none", letterSpacing:"0.02em",
              }}
              onFocus={(e) => e.target.style.borderColor = getMood(draft.mood).color + "44"}
              onBlur={(e)  => e.target.style.borderColor = panelBorder}
            />

            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={cancelWrite} style={{
                background:"transparent", border:`1px solid ${panelBorder}`,
                color:textMuted, padding:"9px 20px", borderRadius:3,
                cursor:"pointer", fontFamily:"'Lora',serif", fontSize:13, letterSpacing:"0.1em",
              }}>discard</button>
              <button onClick={handleSave}
                disabled={!draft.title.trim() || !draft.body.trim()}
                style={{
                  background: draft.title.trim() && draft.body.trim() ? `${getMood(draft.mood).color}18` : "transparent",
                  border:`1px solid ${draft.title.trim() && draft.body.trim() ? getMood(draft.mood).color+"77" : panelBorder}`,
                  color: draft.title.trim() && draft.body.trim() ? getMood(draft.mood).color : textMuted,
                  padding:"9px 24px", borderRadius:3,
                  cursor: draft.title.trim() && draft.body.trim() ? "pointer" : "not-allowed",
                  fontFamily:"'Lora',serif", fontSize:13, letterSpacing:"0.12em", transition:"all 0.2s",
                }}>plant it</button>
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Forget confirmation ── */}
      {forgetTarget && forgetTargetPin && (() => {
        const m = getMood(forgetTargetPin.mood);
        return (
          <Overlay zIndex={500} onClose={() => setForgetTarget(null)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{
              width:400, maxWidth:"90vw",
              background: panelBg, backdropFilter:"blur(20px)",
              border:`1px solid rgba(248,113,113,0.14)`,
              borderTop:`2px solid rgba(248,113,113,0.4)`,
              borderRadius:"0 0 6px 6px",
              padding:"30px 28px 26px",
              textAlign:"center",
              boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
            }}>
              <div style={{ fontSize:30, marginBottom:16, color:m.color, filter:`blur(0.5px) drop-shadow(0 0 10px ${m.color}55)`, opacity:0.6 }}>◈</div>
              <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:"rgba(248,113,113,0.6)", letterSpacing:"0.3em", textTransform:"uppercase", marginBottom:12 }}>let go of this memory?</div>
              <div style={{ fontFamily:"'Playfair Display',serif", fontSize:19, fontWeight:500, color:textPrimary, letterSpacing:"0.02em", marginBottom:5, lineHeight:1.35 }}>
                {forgetTargetPin.title}
              </div>
              <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:m.color+"99", letterSpacing:"0.18em", marginBottom:20 }}>
                {m.label} · {forgetTargetPin.date}
              </div>
              <div style={{ fontFamily:"'Lora',serif", fontSize:14, color:textSecondary, lineHeight:1.88, fontStyle:"italic", marginBottom:20, letterSpacing:"0.02em" }}>
                Once forgotten, this memory will be gone<br/>from this earth — quietly and permanently.
                <br/><span style={{ color:textMuted, fontSize:12.5 }}>There is no way to bring it back.</span>
              </div>
              <div style={{ display:"inline-flex", alignItems:"center", gap:7, background:"rgba(248,113,113,0.07)", border:"1px solid rgba(248,113,113,0.2)", borderRadius:3, padding:"8px 16px", marginBottom:24 }}>
                <div style={{ width:5, height:5, borderRadius:"50%", background:"rgba(248,113,113,0.7)", flexShrink:0 }} />
                <span style={{ fontFamily:"'Lora',serif", fontSize:11.5, color:"rgba(248,113,113,0.75)", letterSpacing:"0.16em" }}>this cannot be undone</span>
              </div>
              <div style={{ display:"flex", gap:10, justifyContent:"center" }}>
                <button onClick={() => setForgetTarget(null)} style={{
                  background:"transparent", border:`1px solid ${panelBorder}`,
                  color:textSecondary, padding:"10px 26px", borderRadius:3,
                  cursor:"pointer", fontFamily:"'Lora',serif", fontSize:13, letterSpacing:"0.14em", transition:"all 0.18s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.color=textPrimary; e.currentTarget.style.borderColor="rgba(255,255,255,0.25)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color=textSecondary; e.currentTarget.style.borderColor=panelBorder; }}
                >keep it</button>
                <button onClick={confirmForget} style={{
                  background:"rgba(248,113,113,0.09)", border:"1px solid rgba(248,113,113,0.32)",
                  color:"rgba(248,113,113,0.65)", padding:"10px 26px", borderRadius:3,
                  cursor:"pointer", fontFamily:"'Lora',serif", fontSize:13, letterSpacing:"0.14em", transition:"all 0.18s",
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background="rgba(248,113,113,0.16)"; e.currentTarget.style.color="rgba(248,113,113,0.9)"; e.currentTarget.style.borderColor="rgba(248,113,113,0.55)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background="rgba(248,113,113,0.09)"; e.currentTarget.style.color="rgba(248,113,113,0.65)"; e.currentTarget.style.borderColor="rgba(248,113,113,0.32)"; }}
                >let it go</button>
              </div>
            </div>
          </Overlay>
        );
      })()}

      {/* ── Tip jar ── */}
      {showTipJar && (
        <Overlay zIndex={300} onClose={() => setShowTipJar(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{
            width:360, maxWidth:"88vw", textAlign:"center",
            background: panelBg, backdropFilter:"blur(20px)",
            border:"1px solid rgba(253,230,138,0.18)", borderTop:"2px solid rgba(253,230,138,0.5)",
            borderRadius:"0 0 6px 6px", padding:"30px 28px 26px", position:"relative",
            boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
          }}>
            <button onClick={() => setShowTipJar(false)} style={{ position:"absolute", top:14, right:16, background:"transparent", border:"none", color:textMuted, cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>
            <div style={{ fontSize:36, marginBottom:14, filter:"drop-shadow(0 0 12px rgba(253,230,138,0.45))" }}>☕</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:21, fontWeight:500, color:textPrimary, letterSpacing:"0.03em", marginBottom:10 }}>help yearning keep memories</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:14, color:textSecondary, lineHeight:1.82, fontStyle:"italic", marginBottom:22, letterSpacing:"0.02em" }}>
              We built yearning to help you hold onto the moments that matter most. And we want to keep it free, always.
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:16 }}>
              {[{ label:"☕ $3", sub:"a coffee" }, { label:"☕☕ $6", sub:"two coffees" }, { label:"✦ $12", sub:"you're amazing" }].map((t) => (
                <a key={t.label} href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
                  flex:1, textDecoration:"none",
                  background:"rgba(253,230,138,0.07)", border:"1px solid rgba(253,230,138,0.2)",
                  borderRadius:4, padding:"10px 6px",
                  display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                }}>
                  <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:"rgba(253,230,138,0.9)", letterSpacing:"0.06em" }}>{t.label}</div>
                  <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:"rgba(253,230,138,0.5)", letterSpacing:"0.14em", fontStyle:"italic" }}>{t.sub}</div>
                </a>
              ))}
            </div>
            <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
              display:"block", textDecoration:"none",
              background:"rgba(253,230,138,0.1)", border:"1px solid rgba(253,230,138,0.35)",
              borderRadius:4, padding:11,
              fontFamily:"'Lora',serif", fontSize:13.5, color:"rgba(253,230,138,0.85)", letterSpacing:"0.14em",
            }}>support yearning on ko-fi →</a>
            <div style={{ marginTop:14, fontFamily:"'Lora',serif", fontSize:11, color:textMuted, letterSpacing:"0.12em", fontStyle:"italic" }}>
              no account needed · opens in a new tab
            </div>
          </div>
        </Overlay>
      )}

      {/* ── Help center ── */}
      {showHelp && (
        <Overlay zIndex={onboardingStep === "guide" ? 500 : 300} onClose={() => onboardingStep !== "guide" && setShowHelp(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{
            width:440, maxWidth:"94vw",
            background: panelBg, backdropFilter:"blur(20px)",
            border:`1px solid rgba(103,232,249,0.15)`, borderTop:"2px solid rgba(103,232,249,0.5)",
            borderRadius:"0 0 6px 6px", padding:"30px 28px 26px", position:"relative",
            maxHeight:"90vh", overflowY:"auto",
            boxShadow: isDark ? "0 24px 64px rgba(0,0,0,0.7)" : "0 24px 64px rgba(0,0,0,0.18)",
          }}>
            {onboardingStep !== "guide" && (
              <button onClick={() => setShowHelp(false)} style={{ position:"absolute", top:14, right:16, background:"transparent", border:"none", color:textMuted, cursor:"pointer", fontSize:20, lineHeight:1 }}>×</button>
            )}
            <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.3em", textTransform:"uppercase", marginBottom:14 }}>help center</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:21, fontWeight:500, color:textPrimary, marginBottom:22 }}>how to use yearning</div>

            {/* Tools */}
            <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.26em", textTransform:"uppercase", marginBottom:14 }}>your tools</div>
            {[
              { icon:"◎", col:"#67e8f9", label:"Locate Me",     desc:"Flies to your GPS position and shows a live pulse marker." },
              { icon:"✦", col:"#c084fc", label:"Plant Here",     desc:"Plants a pin at your GPS location, or at the map center if location is unavailable." },
              { icon:"+", col:textSecondary, label:"Tap Anywhere",  desc:"Enter placing mode — tap any spot on the map, or long-press for an instant plant." },
              { icon:"⊙", col:textMuted,    label:"Reset View",    desc:"Flies back to the world view at default zoom." },
              { icon:"↝", col:textMuted,    label:"Random Memory", desc:"Jumps to a random memory you've planted." },
              { icon:"◐", col:"rgba(253,230,138,0.85)", label:"Map Theme", desc:"Switch between Dark, Dim, Minimal, and Light map styles." },
              { icon:"☕", col:"rgba(253,230,138,0.7)",  label:"Support",    desc:"Keep Yearning free and alive with a small tip." },
              { icon:"i",  col:"rgba(103,232,249,0.75)", label:"Install",    desc:"Add Yearning to your homescreen to use it like a native app.", italic:true },
            ].map(({ icon, col, label, desc, italic }) => (
              <div key={label} style={{ display:"flex", alignItems:"flex-start", gap:14, marginBottom:14 }}>
                <div style={{
                  width:38, height:38, borderRadius:4, flexShrink:0,
                  display:"flex", alignItems:"center", justifyContent:"center",
                  background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
                  border:`1px solid ${panelBorder}`,
                  color:col, fontSize:italic ? 16 : 15,
                  fontFamily: italic ? "'Lora',serif" : "inherit",
                  fontStyle: italic ? "italic" : "normal",
                }}>{icon}</div>
                <div style={{ paddingTop:2 }}>
                  <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.22em", textTransform:"uppercase", marginBottom:3 }}>{label}</div>
                  <div style={{ fontFamily:"'Lora',serif", fontStyle:"italic", fontSize:13.5, color:textSecondary, lineHeight:1.7 }}>{desc}</div>
                </div>
              </div>
            ))}

            {/* Moods */}
            <div style={{ borderTop:`1px solid ${panelBorder}`, margin:"16px 0 14px" }} />
            <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.26em", textTransform:"uppercase", marginBottom:11 }}>moods</div>
            <div style={{ display:"flex", gap:10, flexWrap:"wrap", marginBottom:4 }}>
              {MOODS.map((m) => (
                <div key={m.key} style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:m.color, boxShadow:`0 0 5px ${m.color}88` }} />
                  <span style={{ fontFamily:"'Lora',serif", fontSize:12.5, color:textSecondary }}>{m.label}</span>
                </div>
              ))}
            </div>

            {/* Install */}
            <div style={{ borderTop:`1px solid ${panelBorder}`, margin:"20px 0 16px" }} />
            <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.26em", textTransform:"uppercase", marginBottom:6 }}>add to homescreen</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:textSecondary, fontStyle:"italic", marginBottom:14, lineHeight:1.65 }}>
              Keep yearning just a tap away — it works like a native app.
            </div>
            <div style={{ background:"rgba(103,232,249,0.05)", border:"1px solid rgba(103,232,249,0.15)", borderLeft:"2px solid rgba(103,232,249,0.5)", borderRadius:"0 4px 4px 0", padding:"13px 15px", marginBottom:10 }}>
              <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:"rgba(103,232,249,0.8)", letterSpacing:"0.24em", textTransform:"uppercase", marginBottom:9 }}>iPhone · Safari</div>
              <Step n={1} c="rgba(103,232,249,0.5)">Open in Safari and tap the <Tag c="cyan">Share</Tag> button at the bottom</Step>
              <Step n={2} c="rgba(103,232,249,0.5)">Scroll down and tap <Tag c="cyan">Add to Home Screen</Tag></Step>
              <Step n={3} c="rgba(103,232,249,0.5)">Tap <Tag c="cyan">Add</Tag> in the top right corner</Step>
            </div>
            <div style={{ background:"rgba(134,239,172,0.05)", border:"1px solid rgba(134,239,172,0.15)", borderLeft:"2px solid rgba(134,239,172,0.5)", borderRadius:"0 4px 4px 0", padding:"13px 15px" }}>
              <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:"rgba(134,239,172,0.8)", letterSpacing:"0.24em", textTransform:"uppercase", marginBottom:9 }}>Android · Chrome</div>
              <Step n={1} c="rgba(134,239,172,0.5)">Open in Chrome and tap the <Tag c="green">⋮</Tag> menu in the top right</Step>
              <Step n={2} c="rgba(134,239,172,0.5)">Tap <Tag c="green">Add to Home screen</Tag></Step>
              <Step n={3} c="rgba(134,239,172,0.5)">Tap <Tag c="green">Add</Tag> to confirm</Step>
            </div>
            <div style={{ marginTop:14, fontFamily:"'Lora',serif", fontSize:11.5, color:textMuted, letterSpacing:"0.1em", fontStyle:"italic", textAlign:"center" }}>
              no download needed · your data stays on your device
            </div>

            {/* Onboarding footer */}
            {onboardingStep === "guide" && (
              <div style={{ borderTop:`1px solid ${panelBorder}`, marginTop:20, paddingTop:18, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                <button onClick={() => { setShowHelp(false); setOnboardingStep("welcome"); }}
                  style={{ background:"transparent", border:`1px solid ${panelBorder}`, color:textMuted, fontFamily:"'Lora',serif", fontSize:12, letterSpacing:"0.16em", cursor:"pointer", padding:"9px 18px", borderRadius:3, transition:"all 0.15s" }}>
                  ← back
                </button>
                <button onClick={dismissOnboarding}
                  style={{ background:"rgba(192,132,252,0.12)", border:"1px solid rgba(192,132,252,0.5)", color:"rgba(192,132,252,0.9)", fontFamily:"'Lora',serif", fontSize:13, letterSpacing:"0.2em", padding:"11px 28px", borderRadius:3, cursor:"pointer", transition:"all 0.18s" }}>
                  begin ✦
                </button>
              </div>
            )}
          </div>
        </Overlay>
      )}

      {/* ── Onboarding welcome ── */}
      {onboardingStep === "welcome" && (
        <div style={{
          position:"absolute", inset:0,
          background:"rgba(0,0,0,0.82)", backdropFilter:"blur(10px)",
          zIndex:400, display:"flex", alignItems:"center", justifyContent:"center",
          animation:"fadeIn 0.35s ease",
        }}>
          <div className="modal-card" style={{
            width:450, maxWidth:"94vw",
            background: panelBg,
            border:"1px solid rgba(192,132,252,0.14)", borderTop:"2px solid rgba(192,132,252,0.55)",
            borderRadius:"0 0 6px 6px", padding:"38px 34px 30px",
            boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
          }}>
            <div style={{ fontFamily:"'Lora',serif", fontSize:10, color:textMuted, letterSpacing:"0.3em", textTransform:"uppercase", marginBottom:16 }}>welcome</div>
            <div style={{ fontFamily:"'Playfair Display',serif", fontSize:28, fontWeight:500, color:textPrimary, letterSpacing:"0.03em", lineHeight:1, marginBottom:8 }}>Welcome to Yearning</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:13, color:textMuted, fontStyle:"italic", letterSpacing:"0.1em", marginBottom:24 }}>leave a part of you somewhere</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:14.5, color:textSecondary, lineHeight:1.88, fontStyle:"italic", letterSpacing:"0.02em" }}>
              A quiet place to plant your thoughts, feelings, and memories exactly where they happened — anywhere on earth.
            </div>
            <div style={{ display:"flex", alignItems:"flex-start", gap:14, background:"rgba(103,232,249,0.05)", border:"1px solid rgba(103,232,249,0.15)", borderLeft:"2px solid rgba(103,232,249,0.55)", padding:"14px 16px", margin:"24px 0 26px" }}>
              <div style={{ fontSize:15, color:"rgba(103,232,249,0.8)", marginTop:1, flexShrink:0 }}>◉</div>
              <div style={{ fontFamily:"'Lora',serif", fontSize:13.5, color:textSecondary, lineHeight:1.8, letterSpacing:"0.02em" }}>
                <span style={{ color:textPrimary, fontStyle:"italic" }}>Your memories never leave your device.</span>
                <br/>Everything is stored locally — no servers, no accounts, no tracking.
              </div>
            </div>
            <div style={{ display:"flex", gap:7, justifyContent:"center", marginBottom:26 }}>
              <div style={{ width:5, height:5, borderRadius:"50%", background:"rgba(192,132,252,0.75)" }} />
              <div style={{ width:5, height:5, borderRadius:"50%", background: isDark ? "rgba(232,228,217,0.16)" : "rgba(26,24,20,0.16)" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end" }}>
              <button onClick={() => { setOnboardingStep("guide"); setShowHelp(true); }}
                style={{ background:"rgba(192,132,252,0.12)", border:"1px solid rgba(192,132,252,0.5)", color:"rgba(192,132,252,0.92)", fontFamily:"'Lora',serif", fontSize:13, letterSpacing:"0.2em", padding:"11px 30px", borderRadius:3, cursor:"pointer", transition:"all 0.18s" }}>
                continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PWA install nudge toast ── */}
      {showInstallNudge && (
        <div style={{
          position:"absolute", bottom:26, left:"50%", transform:"translateX(-50%)",
          background: panelBg, backdropFilter:"blur(14px)",
          border:`1px solid rgba(103,232,249,0.22)`, borderRadius:6,
          padding:"12px 18px 12px 16px", zIndex:350,
          display:"flex", alignItems:"center", gap:12,
          animation:"toastIn 0.3s ease",
          boxShadow: isDark ? "0 8px 32px rgba(0,0,0,0.5)" : "0 8px 32px rgba(0,0,0,0.12)",
          maxWidth:"calc(100vw - 28px)",
        }}>
          <div style={{ fontSize:17, flexShrink:0 }}>📍</div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Lora',serif", fontSize:12.5, color:textPrimary, marginBottom:2 }}>Keep your memories handy</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:11, color:textMuted, fontStyle:"italic" }}>
              Tap the <strong style={{ fontStyle:"normal" }}>Share</strong> icon then "Add to Home Screen"
            </div>
          </div>
          <button onClick={() => { setShowInstallNudge(false); localStorage.setItem("yearning_nudge_dismissed","1"); }}
            style={{ background:"transparent", border:"none", color:textMuted, cursor:"pointer", fontSize:18, lineHeight:1, padding:0, flexShrink:0 }}>×</button>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position:"absolute", bottom: showInstallNudge ? 80 : 26, left:"50%", transform:"translateX(-50%)",
          background: isDark ? "rgba(11,10,17,0.94)" : "rgba(250,248,244,0.94)",
          backdropFilter:"blur(12px)",
          border:`1px solid ${panelBorder}`, borderRadius:4,
          padding:"9px 20px", zIndex:600,
          fontFamily:"'Lora',serif", fontSize:12.5,
          color:textSecondary, letterSpacing:"0.14em", fontStyle:"italic",
          whiteSpace:"nowrap", pointerEvents:"none",
          animation:"toastIn 0.25s ease",
          boxShadow: isDark ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.1)",
        }}>{toast}</div>
      )}
    </div>
  );
}