import { useState, useEffect, useRef, useCallback } from "react";

const Tag = ({ c, children }) => (
  <span style={{
    background: c === "cyan" ? "rgba(103,232,249,0.1)" : "rgba(134,239,172,0.1)",
    color: c === "cyan" ? "rgba(103,232,249,0.75)" : "rgba(134,239,172,0.75)",
    padding: "1px 6px", borderRadius: 1, fontSize: 12,
    fontStyle: "normal", fontFamily: "'Lora', serif", letterSpacing: "0.04em",
  }}>{children}</span>
);

const Step = ({ n, c, children }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 7 }}>
    <div style={{ fontFamily: "'Lora', serif", fontSize: 11, color: c, minWidth: 14, marginTop: 2 }}>{n}</div>
    <div style={{ fontFamily: "'Lora', serif", fontSize: 13.5, color: "rgba(232,228,217,0.58)", lineHeight: 1.55, fontStyle: "italic" }}>{children}</div>
  </div>
);

const STORAGE_KEY = "yearning_pins_v2";
const ONBOARDED_KEY = "yearning_onboarded";

const MOODS = [
  { key: "wonder",    label: "Wonder",    color: "#c084fc" },
  { key: "peace",     label: "Peace",     color: "#67e8f9" },
  { key: "longing",   label: "Longing",   color: "#fb923c" },
  { key: "joy",       label: "Joy",       color: "#86efac" },
  { key: "ache",      label: "Ache",      color: "#f87171" },
  { key: "gratitude", label: "Gratitude", color: "#fde68a" },
];

const getMood = (key) => MOODS.find((m) => m.key === key) ?? MOODS[0];

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

const KOFI_URL = "https://ko-fi.com/donatetoyearning";

export default function Yearning() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const userMarkerRef = useRef(null);
  const leafletRef = useRef(null);

  const [pins, setPins] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; }
  });
  const [selectedPin, setSelectedPin] = useState(null);
  const [mode, setMode] = useState("view");
  const [placingCoords, setPlacingCoords] = useState(null);
  const [draft, setDraft] = useState({ title: "", body: "", mood: "wonder" });
  const [userLocation, setUserLocation] = useState(null);
  const [locationStatus, setLocationStatus] = useState("idle");
  const [mapReady, setMapReady] = useState(false);
  const [toast, setToast] = useState(null);
  const [showTipJar, setShowTipJar] = useState(false);
  const [showHelpCenter, setShowHelpCenter] = useState(false);

  // Onboarding: null = dismissed, "welcome" = screen 1, "guide" = screen 2
  const [onboardingStep, setOnboardingStep] = useState(() => {
    try {
      return localStorage.getItem(ONBOARDED_KEY) ? null : "welcome";
    } catch { return "welcome"; }
  });

  const dismissOnboarding = () => {
    try { localStorage.setItem(ONBOARDED_KEY, "1"); } catch {}
    setOnboardingStep(null);
  };

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pins)); } catch {}
  }, [pins]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const initMap = useCallback(() => {
    if (mapRef.current || !mapContainerRef.current || !window.L) return;
    const L = window.L;
    leafletRef.current = L;

    const map = L.map(mapContainerRef.current, {
      center: [20, 0], zoom: 2,
      zoomControl: false, attributionControl: false,
    });

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, subdomains: "abcd", maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.attribution({ position: "bottomleft", prefix: false }).addTo(map);

    mapRef.current = map;
    setMapReady(true);
  }, []);

  useEffect(() => {
    const loadLeaflet = () => {
      if (window.L) { initMap(); return; }

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css";
      document.head.appendChild(link);

      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js";
      script.onload = initMap;
      document.head.appendChild(script);
    };
    loadLeaflet();
  }, [initMap]);

  const createPinIcon = useCallback((mood, isSelected = false) => {
    const L = leafletRef.current;
    if (!L) return null;
    const m = getMood(mood);
    const size = isSelected ? 34 : 26;
    const html = `<div style="display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 2px 10px ${m.color}55)">
      <div style="width:${size}px;height:${size}px;border-radius:50% 50% 50% 0;background:${m.color};transform:rotate(-45deg);border:2px solid rgba(255,255,255,0.25);box-shadow:0 0 ${isSelected ? 18 : 8}px ${m.color}77;transition:all 0.2s;"></div>
      <div style="width:2px;height:8px;background:${m.color};opacity:0.65;margin-top:-1px;"></div>
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
      const icon = createPinIcon(pin.mood, pin.id === selectedPin);
      const marker = L.marker([pin.lat, pin.lng], { icon })
        .addTo(map)
        .on("click", () => setSelectedPin((s) => s === pin.id ? null : pin.id));
      markersRef.current[pin.id] = marker;
    });
  }, [pins, mapReady, selectedPin, createPinIcon]);

  const modeRef = useRef(mode);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const handleClick = (e) => {
      if (modeRef.current !== "placing") return;
      setPlacingCoords({ lat: e.latlng.lat, lng: e.latlng.lng });
      setDraft({ title: "", body: "", mood: "wonder" });
      setMode("writing");
    };

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapReady]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.style.cursor = mode === "placing" ? "crosshair" : "";
  }, [mode]);

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

        const pulseHtml = `<div style="position:relative;width:20px;height:20px;">
          <div style="position:absolute;inset:0;border-radius:50%;background:rgba(103,232,249,0.18);animation:gps-pulse 2s infinite;"></div>
          <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:10px;height:10px;border-radius:50%;background:#67e8f9;border:2px solid white;box-shadow:0 0 8px #67e8f9;"></div>
        </div>`;
        const userIcon = L.divIcon({ html: pulseHtml, className: "", iconSize: [20, 20], iconAnchor: [10, 10] });
        userMarkerRef.current = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 }).addTo(map);
        map.flyTo([lat, lng], 15, { duration: 2 });
        showToast("Found you ✦");
      },
      () => { setLocationStatus("denied"); showToast("Location access denied"); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const dropAtLocation = () => {
    if (!userLocation) return;
    setPlacingCoords(userLocation);
    setDraft({ title: "", body: "", mood: "wonder" });
    setMode("writing");
  };

  const handleSave = () => {
    if (!draft.title.trim() || !draft.body.trim() || !placingCoords) return;
    const newPin = {
      id: Date.now().toString(),
      lat: placingCoords.lat, lng: placingCoords.lng,
      title: draft.title, body: draft.body, mood: draft.mood,
      date: new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    };
    setPins((p) => [...p, newPin]);
    setMode("view");
    setPlacingCoords(null);
    setSelectedPin(newPin.id);
    if (mapRef.current) mapRef.current.flyTo([newPin.lat, newPin.lng], 16, { duration: 1.2 });
    showToast("Memory planted ✦");
  };

  const cancelWrite = () => { setMode("view"); setPlacingCoords(null); };
  const selected = pins.find((p) => p.id === selectedPin);

  const ICON_GUIDE = [
    { icon: "◎", color: "#67e8f9", border: "rgba(103,232,249,0.3)", label: "Locate me", desc: "Finds your current position on the map and flies you there." },
    { icon: "✦", color: "#c084fc", border: "rgba(192,132,252,0.3)", label: "Plant here", desc: "Drops a memory right at your current location. Appears once you're located." },
    { icon: "+", color: "rgba(232,228,217,0.55)", border: "rgba(255,255,255,0.1)", label: "Tap anywhere", desc: "Enter placing modetap,  any spot on the map to plant a thought there.", fontSize: 22 },
    { icon: "☕", color: "rgba(253,230,138,0.7)", border: "rgba(253,230,138,0.25)", label: "Support", desc: "Help keep Yearning free and alive with a small tip." },
    { icon: "?", color: "rgba(103,232,249,0.6)", border: "rgba(103,232,249,0.2)", label: "Install", desc: "Add Yearning to your homescreen to use it like a native app.", fontFamily: "'Lora', serif" },
  ];

  return (
    <div style={{ width: "100%", height: "100vh", background: "#0a0a0f", overflow: "hidden", position: "relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,700;1,400;1,500&family=Lora:ital,wght@0,400;0,500;1,400;1,500&display=swap');
        * { box-sizing: border-box; }
        .leaflet-container { background: #0a0a0f !important; }
        .leaflet-control-zoom a { background: rgba(12,11,18,0.92) !important; color: rgba(232,228,217,0.6) !important; border-color: rgba(255,255,255,0.08) !important; }
        .leaflet-control-zoom a:hover { background: rgba(30,28,45,0.95) !important; color: #e8e4d9 !important; }
        .leaflet-control-attribution { background: rgba(10,10,15,0.6) !important; color: rgba(255,255,255,0.18) !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: rgba(255,255,255,0.28) !important; }
        @keyframes gps-pulse { 0%,100%{transform:scale(1);opacity:0.5} 50%{transform:scale(2.5);opacity:0} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fadeIn { from{opacity:0} to{opacity:1} }
        @keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
        @keyframes spin { to{transform:rotate(360deg)} }
        .pin-card { animation: fadeUp 0.28s ease forwards; }
        textarea { resize: none; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      {/* Map */}
      <div ref={mapContainerRef} style={{ position: "absolute", inset: 0, zIndex: 0 }} />

      {/* Header */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 100,
        padding: "18px 22px 40px",
        background: "linear-gradient(to bottom, rgba(10,10,15,0.88) 0%, transparent 100%)",
        pointerEvents: "none",
        display: "flex", alignItems: "flex-start", justifyContent: "space-between",
      }}>
        <div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 26, fontWeight: 400, color: "#e8e4d9", letterSpacing: "0.06em", lineHeight: 1 }}>yearning</div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: 10.5, color: "rgba(232,228,217,0.28)", letterSpacing: "0.12em", marginTop: 4, fontStyle: "italic" }}>leave a part of you somewhere</div>
        </div>
        {pins.length > 0 && (
          <div style={{ fontFamily: "'Lora', serif", fontSize: 11, color: "rgba(255,255,255,0.22)", letterSpacing: "0.1em", marginTop: 4 }}>
            {pins.length} {pins.length === 1 ? "memory" : "memories"}
          </div>
        )}
      </div>

      {/* Right action buttons */}
      <div style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", zIndex: 100, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Locate */}
        <button onClick={requestLocation} title="Go to my location" style={{
          width: 44, height: 44,
          background: locationStatus === "granted" ? "rgba(103,232,249,0.1)" : "rgba(11,10,17,0.88)",
          border: `1px solid ${locationStatus === "granted" ? "rgba(103,232,249,0.35)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: 2, cursor: "pointer", backdropFilter: "blur(8px)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, color: locationStatus === "granted" ? "#67e8f9" : "rgba(232,228,217,0.5)",
          transition: "all 0.2s",
        }}>
          {locationStatus === "requesting"
            ? <div style={{ width: 14, height: 14, border: "2px solid rgba(103,232,249,0.3)", borderTopColor: "#67e8f9", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            : "◎"}
        </button>

        {/* Drop at my location */}
        {locationStatus === "granted" && mode === "view" && (
          <button onClick={dropAtLocation} title="Plant thought at my location" style={{
            width: 44, height: 44,
            background: "rgba(192,132,252,0.1)",
            border: "1px solid rgba(192,132,252,0.3)",
            borderRadius: 2, cursor: "pointer", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, color: "#c084fc",
          }}>✦</button>
        )}

        {/* Tap-anywhere mode */}
        {mode === "view" && (
          <button onClick={() => { setMode("placing"); setSelectedPin(null); }} title="Tap anywhere on map" style={{
            width: 44, height: 44,
            background: "rgba(11,10,17,0.88)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 2, cursor: "pointer", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, color: "rgba(232,228,217,0.5)",
          }}>+</button>
        )}

        {/* Cancel placing */}
        {mode === "placing" && (
          <button onClick={() => setMode("view")} style={{
            width: 44, height: 44,
            background: "rgba(248,113,113,0.08)",
            border: "1px solid rgba(248,113,113,0.28)",
            borderRadius: 2, cursor: "pointer", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: "rgba(248,113,113,0.65)",
          }}>×</button>
        )}

        {/* Tip jar */}
        {mode === "view" && (
          <button onClick={() => setShowTipJar(true)} title="Support Yearning" style={{
            width: 44, height: 44,
            background: "rgba(253,230,138,0.07)",
            border: "1px solid rgba(253,230,138,0.2)",
            borderRadius: 2, cursor: "pointer", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, color: "rgba(253,230,138,0.55)",
            transition: "all 0.2s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(253,230,138,0.12)"; e.currentTarget.style.color = "rgba(253,230,138,0.85)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(253,230,138,0.07)"; e.currentTarget.style.color = "rgba(253,230,138,0.55)"; }}
          >☕</button>
        )}

        {/* Help center */}
        {mode === "view" && (
          <button onClick={() => setShowHelpCenter(true)} title="Help & instructions" style={{
            width: 44, height: 44,
            background: "rgba(103,232,249,0.07)",
            border: "1px solid rgba(103,232,249,0.18)",
            borderRadius: 2, cursor: "pointer", backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "'Lora', serif", fontSize: 16, fontStyle: "italic", fontWeight: 500,
            color: "rgba(103,232,249,0.5)",
            transition: "all 0.2s",
          }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(103,232,249,0.85)"; e.currentTarget.style.background = "rgba(103,232,249,0.13)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(103,232,249,0.5)"; e.currentTarget.style.background = "rgba(103,232,249,0.07)"; }}
          >i</button>
        )}

      </div>

      {/* Mood legend */}
      <div style={{ position: "absolute", left: 14, bottom: 56, zIndex: 100, display: "flex", flexDirection: "column", gap: 5 }}>
        {MOODS.map((m) => (
          <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 7, opacity: 0.42 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
            <span style={{ fontFamily: "'Lora', serif", fontSize: 10.5, color: "rgba(232,228,217,0.85)", letterSpacing: "0.14em" }}>{m.label}</span>
          </div>
        ))}
      </div>

      {/* Placing instruction */}
      {mode === "placing" && (
        <div style={{
          position: "absolute", bottom: 30, left: "50%", transform: "translateX(-50%)",
          background: "rgba(10,10,15,0.88)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(232,228,217,0.09)", borderRadius: 2,
          padding: "10px 22px", zIndex: 100,
          fontFamily: "'Lora', serif", fontSize: 13,
          color: "rgba(232,228,217,0.5)", letterSpacing: "0.12em", fontStyle: "italic",
          animation: "fadeUp 0.25s ease", whiteSpace: "nowrap",
        }}>
          tap anywhere on the map to plant a thought
        </div>
      )}

      {/* Selected pin card */}
      {selected && mode === "view" && (
        <div className="pin-card" style={{
          position: "absolute", bottom: 26, left: 14,
          width: Math.min(340, (typeof window !== "undefined" ? window.innerWidth : 400) - 28),
          background: "rgba(11,10,17,0.96)", backdropFilter: "blur(16px)",
          border: `1px solid ${getMood(selected.mood).color}22`,
          borderLeft: `3px solid ${getMood(selected.mood).color}`,
          borderRadius: "0 2px 2px 0",
          padding: "20px 18px 15px", zIndex: 100,
          maxHeight: "52vh", overflow: "auto",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 11 }}>
            <div style={{ flex: 1, paddingRight: 10 }}>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: getMood(selected.mood).color, letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 5 }}>
                {getMood(selected.mood).label} · {selected.date}
              </div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 500, color: "#e8e4d9", lineHeight: 1.3 }}>
                {selected.title}
              </div>
            </div>
            <button onClick={() => setSelectedPin(null)} style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.18)", cursor: "pointer", fontSize: 20, lineHeight: 1, padding: 0, flexShrink: 0 }}>×</button>
          </div>
          <div style={{ fontFamily: "'Lora', serif", fontSize: 14.5, color: "rgba(232,228,217,0.65)", lineHeight: 1.82, fontStyle: "italic" }}>
            {selected.body}
          </div>
          <div style={{ marginTop: 14, paddingTop: 11, borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 9.5, color: "rgba(255,255,255,0.16)", letterSpacing: "0.06em" }}>
              {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
            </div>
            <button onClick={() => { setPins((p) => p.filter((x) => x.id !== selected.id)); setSelectedPin(null); showToast("Memory forgotten"); }}
              style={{ background: "transparent", border: "none", color: "rgba(248,113,113,0.28)", cursor: "pointer", fontFamily: "'Lora', serif", fontSize: 11, letterSpacing: "0.1em", transition: "color 0.2s" }}
              onMouseEnter={(e) => e.target.style.color = "rgba(248,113,113,0.6)"}
              onMouseLeave={(e) => e.target.style.color = "rgba(248,113,113,0.28)"}
            >forget this</button>
          </div>
        </div>
      )}

      {/* Writing modal */}
      {mode === "writing" && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)",
          backdropFilter: "blur(5px)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.2s ease",
        }} onClick={(e) => e.target === e.currentTarget && cancelWrite()}>
          <div className="pin-card" style={{
            width: 460, maxWidth: "92vw",
            background: "rgba(11,10,17,0.98)",
            border: `1px solid ${getMood(draft.mood).color}20`,
            borderTop: `2px solid ${getMood(draft.mood).color}55`,
            borderRadius: "0 0 2px 2px", padding: "26px 26px 22px",
          }} onClick={(e) => e.stopPropagation()}>

            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 400, color: "#e8e4d9", letterSpacing: "0.02em", marginBottom: 4 }}>
              plant a thought here
            </div>
            {placingCoords && (
              <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.22)", letterSpacing: "0.14em", marginBottom: 20 }}>
                {placingCoords.lat.toFixed(5)}, {placingCoords.lng.toFixed(5)}
              </div>
            )}

            {/* Mood selector */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.32)", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 9 }}>mood</div>
              <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
                {MOODS.map((m) => (
                  <button key={m.key} onClick={() => setDraft((d) => ({ ...d, mood: m.key }))} style={{
                    background: draft.mood === m.key ? `${m.color}16` : "transparent",
                    border: `1px solid ${draft.mood === m.key ? m.color + "88" : "rgba(255,255,255,0.08)"}`,
                    color: draft.mood === m.key ? m.color : "rgba(255,255,255,0.35)",
                    padding: "4px 13px", borderRadius: 1, cursor: "pointer",
                    fontFamily: "'Lora', serif", fontSize: 12, letterSpacing: "0.1em",
                    transition: "all 0.15s",
                  }}>{m.label}</button>
                ))}
              </div>
            </div>

            {/* Title */}
            <input autoFocus placeholder="Give this moment a name…" value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              style={{
                width: "100%", background: "transparent", border: "none",
                borderBottom: `1px solid ${draft.title ? getMood(draft.mood).color + "44" : "rgba(255,255,255,0.08)"}`,
                padding: "9px 0", marginBottom: 15,
                color: "#e8e4d9", fontFamily: "'Playfair Display', serif", fontSize: 17,
                outline: "none", letterSpacing: "0.04em", transition: "border-color 0.2s",
              }}
            />

            {/* Body */}
            <textarea placeholder="What do you want to remember about this place?" value={draft.body}
              onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} rows={5}
              style={{
                width: "100%", background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.07)", borderRadius: 1,
                padding: "12px", marginBottom: 20,
                color: "rgba(232,228,217,0.75)", fontFamily: "'Lora', serif",
                fontSize: 14.5, lineHeight: 1.85, fontStyle: "italic",
                outline: "none", letterSpacing: "0.02em",
              }}
              onFocus={(e) => e.target.style.borderColor = getMood(draft.mood).color + "33"}
              onBlur={(e) => e.target.style.borderColor = "rgba(255,255,255,0.07)"}
            />

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={cancelWrite} style={{
                background: "transparent", border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.28)", padding: "8px 18px", borderRadius: 1,
                cursor: "pointer", fontFamily: "'Lora', serif", fontSize: 13, letterSpacing: "0.1em",
              }}>discard</button>
              <button onClick={handleSave} disabled={!draft.title.trim() || !draft.body.trim()} style={{
                background: draft.title.trim() && draft.body.trim() ? `${getMood(draft.mood).color}16` : "rgba(255,255,255,0.04)",
                border: `1px solid ${draft.title.trim() && draft.body.trim() ? getMood(draft.mood).color + "66" : "rgba(255,255,255,0.07)"}`,
                color: draft.title.trim() && draft.body.trim() ? getMood(draft.mood).color : "rgba(255,255,255,0.18)",
                padding: "8px 22px", borderRadius: 1,
                cursor: draft.title.trim() && draft.body.trim() ? "pointer" : "not-allowed",
                fontFamily: "'Lora', serif", fontSize: 13, letterSpacing: "0.12em", transition: "all 0.2s",
              }}>plant it</button>
            </div>
          </div>
        </div>
      )}

      {/* Tip Jar Modal */}
      {showTipJar && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)",
          backdropFilter: "blur(6px)", zIndex: 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.2s ease",
        }} onClick={(e) => e.target === e.currentTarget && setShowTipJar(false)}>
          <div className="pin-card" style={{
            width: 360, maxWidth: "88vw",
            background: "rgba(11,10,17,0.98)",
            border: "1px solid rgba(253,230,138,0.15)",
            borderTop: "2px solid rgba(253,230,138,0.4)",
            borderRadius: "0 0 2px 2px",
            padding: "30px 28px 26px",
            textAlign: "center",
          }} onClick={(e) => e.stopPropagation()}>

            <button onClick={() => setShowTipJar(false)} style={{
              position: "absolute", top: 14, right: 16,
              background: "transparent", border: "none",
              color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 20, lineHeight: 1,
            }}>×</button>

            <div style={{ fontSize: 38, marginBottom: 14, filter: "drop-shadow(0 0 12px rgba(253,230,138,0.4))" }}>☕</div>

            <div style={{
              fontFamily: "'Playfair Display', serif", fontSize: 22,
              fontWeight: 500, color: "#e8e4d9", letterSpacing: "0.03em", marginBottom: 10,
            }}>
              help yearning keep memories
            </div>

            <div style={{
              fontFamily: "'Lora', serif", fontSize: 14.5,
              color: "rgba(232,228,217,0.5)", lineHeight: 1.8, fontStyle: "italic",
              marginBottom: 24, letterSpacing: "0.02em",
            }}>
              We built yearning to help you hold onto the moments that matter most.<br />
              And we want to keep it free, always.<br />
              If it helped you hold onto a moment,<br />
              a small coffee helps us keep it alive.
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 20 }}>
              {[
                { label: "☕ $3", sub: "a coffee" },
                { label: "☕☕ $6", sub: "two coffees" },
                { label: "✦ $12", sub: "you're amazing" },
              ].map((t) => (
                <a key={t.label} href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
                  flex: 1, textDecoration: "none",
                  background: "rgba(253,230,138,0.07)",
                  border: "1px solid rgba(253,230,138,0.18)",
                  borderRadius: 2, padding: "10px 6px",
                  cursor: "pointer", transition: "all 0.18s",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
                }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(253,230,138,0.14)"; e.currentTarget.style.borderColor = "rgba(253,230,138,0.4)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(253,230,138,0.07)"; e.currentTarget.style.borderColor = "rgba(253,230,138,0.18)"; }}
                >
                  <div style={{ fontFamily: "'Lora', serif", fontSize: 13.5, color: "rgba(253,230,138,0.85)", letterSpacing: "0.06em" }}>{t.label}</div>
                  <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(253,230,138,0.38)", letterSpacing: "0.14em", fontStyle: "italic" }}>{t.sub}</div>
                </a>
              ))}
            </div>

            <a href={KOFI_URL} target="_blank" rel="noopener noreferrer" style={{
              display: "block", width: "100%", textDecoration: "none",
              background: "rgba(253,230,138,0.1)",
              border: "1px solid rgba(253,230,138,0.3)",
              borderRadius: 2, padding: "11px",
              fontFamily: "'Lora', serif", fontSize: 13.5,
              color: "rgba(253,230,138,0.8)", letterSpacing: "0.14em",
              transition: "all 0.18s", cursor: "pointer",
            }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(253,230,138,0.18)"; e.currentTarget.style.color = "#fde68a"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(253,230,138,0.1)"; e.currentTarget.style.color = "rgba(253,230,138,0.8)"; }}
            >
              support yearning on ko-fi →
            </a>

            <div style={{
              marginTop: 16, fontFamily: "'Lora', serif", fontSize: 11,
              color: "rgba(255,255,255,0.15)", letterSpacing: "0.12em", fontStyle: "italic",
            }}>
              no account needed · opens in a new tab
            </div>
          </div>
        </div>
      )}

      {/* ── HELP CENTER MODAL (persistent, always accessible via i button) ── */}
      {showHelpCenter && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(7px)", zIndex: onboardingStep === "guide" ? 500 : 300,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.2s ease",
        }} onClick={(e) => e.target === e.currentTarget && onboardingStep !== "guide" && setShowHelpCenter(false)}>
          <div className="pin-card" style={{
            width: 420, maxWidth: "92vw",
            background: "rgba(11,10,17,0.99)",
            border: "1px solid rgba(103,232,249,0.13)",
            borderTop: "2px solid rgba(103,232,249,0.45)",
            borderRadius: "0 0 2px 2px",
            padding: "30px 28px 26px",
            maxHeight: "90vh", overflowY: "auto",
            position: "relative",
          }} onClick={(e) => e.stopPropagation()}>

            {/* Close — only when not in onboarding */}
            {onboardingStep !== "guide" && (
              <button onClick={() => setShowHelpCenter(false)} style={{
                position: "absolute", top: 14, right: 16,
                background: "transparent", border: "none",
                color: "rgba(255,255,255,0.2)", cursor: "pointer", fontSize: 20, lineHeight: 1,
              }}>×</button>
            )}

            {/* Header */}
            <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.22)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 14 }}>help center</div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, fontWeight: 500, color: "#e8e4d9", letterSpacing: "0.02em", marginBottom: 22 }}>how to use yearning</div>

            {/* ── Section 1: Icon Guide ── */}
            <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.22)", letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 14 }}>your tools</div>

            {ICON_GUIDE.map(({ icon, color, border, label, desc, fontSize, fontFamily }) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 2, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(255,255,255,0.03)",
                  border: `1px solid ${border}`,
                  color, fontSize: fontSize ?? 16,
                  fontFamily: fontFamily ?? "inherit",
                }}>{icon}</div>
                <div style={{ paddingTop: 2 }}>
                  <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.32)", letterSpacing: "0.22em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                  <div style={{ fontFamily: "'Lora', serif", fontStyle: "italic", fontSize: 13.5, color: "rgba(232,228,217,0.52)", lineHeight: 1.7 }}>{desc}</div>
                </div>
              </div>
            ))}

            {/* Moods */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "16px 0 14px" }} />
            <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.22)", letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 11 }}>moods</div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
              {MOODS.map((m) => (
                <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: m.color, flexShrink: 0 }} />
                  <span style={{ fontFamily: "'Lora', serif", fontSize: 12.5, color: "rgba(232,228,217,0.42)" }}>{m.label}</span>
                </div>
              ))}
            </div>

            {/* ── Section 2: Add to Homescreen ── */}
            <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", margin: "20px 0 16px" }} />
            <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.22)", letterSpacing: "0.26em", textTransform: "uppercase", marginBottom: 6 }}>add to homescreen</div>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 13, color: "rgba(232,228,217,0.35)", fontStyle: "italic", marginBottom: 14, lineHeight: 1.65 }}>
              Keep yearning just a tap away — it works like a native app.
            </div>

            <div style={{ background: "rgba(103,232,249,0.05)", border: "1px solid rgba(103,232,249,0.13)", borderLeft: "2px solid rgba(103,232,249,0.45)", borderRadius: "0 2px 2px 0", padding: "13px 15px", marginBottom: 10 }}>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(103,232,249,0.65)", letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 9 }}>iPhone · Safari</div>
              <Step n={1} c="rgba(103,232,249,0.4)">Open in Safari and tap the <Tag c="cyan">Share</Tag> button at the bottom</Step>
              <Step n={2} c="rgba(103,232,249,0.4)">Scroll down and tap <Tag c="cyan">Add to Home Screen</Tag></Step>
              <Step n={3} c="rgba(103,232,249,0.4)">Tap <Tag c="cyan">Add</Tag> in the top right corner</Step>
            </div>

            <div style={{ background: "rgba(134,239,172,0.05)", border: "1px solid rgba(134,239,172,0.13)", borderLeft: "2px solid rgba(134,239,172,0.45)", borderRadius: "0 2px 2px 0", padding: "13px 15px" }}>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(134,239,172,0.65)", letterSpacing: "0.24em", textTransform: "uppercase", marginBottom: 9 }}>Android · Chrome</div>
              <Step n={1} c="rgba(134,239,172,0.4)">Open in Chrome and tap the <Tag c="green">⋮</Tag> menu in the top right</Step>
              <Step n={2} c="rgba(134,239,172,0.4)">Tap <Tag c="green">Add to Home screen</Tag></Step>
              <Step n={3} c="rgba(134,239,172,0.4)">Tap <Tag c="green">Add</Tag> to confirm</Step>
            </div>

            <div style={{ marginTop: 14, fontFamily: "'Lora', serif", fontSize: 11, color: "rgba(255,255,255,0.13)", letterSpacing: "0.1em", fontStyle: "italic", textAlign: "center" }}>
              no download needed · your data stays on your device
            </div>

            {/* Onboarding footer — only shown during first-time flow */}
            {onboardingStep === "guide" && (
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 20, paddingTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button
                  onClick={() => { setShowHelpCenter(false); setOnboardingStep("welcome"); }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(232,228,217,0.28)",
                    fontFamily: "'Lora', serif", fontSize: 12,
                    letterSpacing: "0.16em", cursor: "pointer",
                    padding: "9px 18px", borderRadius: 1, transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(232,228,217,0.5)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(232,228,217,0.28)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                >← back</button>
                <button
                  onClick={() => { setShowHelpCenter(false); dismissOnboarding(); }}
                  style={{
                    background: "rgba(192,132,252,0.12)",
                    border: "1px solid rgba(192,132,252,0.48)",
                    color: "rgba(192,132,252,0.9)",
                    fontFamily: "'Lora', serif", fontSize: 13,
                    letterSpacing: "0.2em", padding: "11px 28px",
                    borderRadius: 1, cursor: "pointer", transition: "all 0.18s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(192,132,252,0.2)"; e.currentTarget.style.color = "#c084fc"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(192,132,252,0.12)"; e.currentTarget.style.color = "rgba(192,132,252,0.9)"; }}
                >begin ✦</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ONBOARDING ── Welcome Screen (Step 1) */}
      {onboardingStep === "welcome" && (
        <div style={{
          position: "absolute", inset: 0,
          background: "rgba(0,0,0,0.78)",
          backdropFilter: "blur(10px)",
          zIndex: 400,
          display: "flex", alignItems: "center", justifyContent: "center",
          animation: "fadeIn 0.35s ease",
        }}>
          <div style={{
            width: 440, maxWidth: "92vw",
            background: "rgba(11,10,17,0.99)",
            borderTop: "2px solid rgba(192,132,252,0.5)",
            border: "1px solid rgba(192,132,252,0.12)",
            borderRadius: "0 0 2px 2px",
            padding: "38px 34px 30px",
            animation: "fadeUp 0.3s ease",
          }}>
            {/* Eyebrow */}
            <div style={{ fontFamily: "'Lora', serif", fontSize: 10, color: "rgba(232,228,217,0.22)", letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 16 }}>welcome</div>

            {/* Wordmark */}
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 500, color: "#e8e4d9", letterSpacing: "0.03em", lineHeight: 1, marginBottom: 8 }}>
              Welcome to Yearning
            </div>
            <div style={{ fontFamily: "'Lora', serif", fontSize: 13, color: "rgba(232,228,217,0.32)", fontStyle: "italic", letterSpacing: "0.1em", marginBottom: 24 }}>
              leave a part of you somewhere
            </div>

            {/* Body */}
            <div style={{ fontFamily: "'Lora', serif", fontSize: 14.5, color: "rgba(232,228,217,0.58)", lineHeight: 1.88, fontStyle: "italic", letterSpacing: "0.02em" }}>
              A quiet place to plant your thoughts, feelings, and memories exactly where they happened — anywhere on earth.
            </div>

            {/* Privacy block */}
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              background: "rgba(103,232,249,0.05)",
              border: "1px solid rgba(103,232,249,0.13)",
              borderLeft: "2px solid rgba(103,232,249,0.5)",
              padding: "14px 16px",
              margin: "24px 0 26px",
            }}>
              <div style={{ fontSize: 15, color: "rgba(103,232,249,0.75)", marginTop: 1, flexShrink: 0, lineHeight: 1 }}>◉</div>
              <div style={{ fontFamily: "'Lora', serif", fontSize: 13.5, color: "rgba(232,228,217,0.52)", lineHeight: 1.8, letterSpacing: "0.02em" }}>
                <span style={{ color: "rgba(232,228,217,0.9)", fontStyle: "italic" }}>Your memories never leave your device.</span>
                <br />
                Everything is stored locally in your browser — no servers, no accounts, no tracking. What you write is entirely yours.
              </div>
            </div>

            {/* Dots */}
            <div style={{ display: "flex", gap: 7, justifyContent: "center", marginBottom: 26 }}>
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(192,132,252,0.7)" }} />
              <div style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(232,228,217,0.14)" }} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                onClick={() => { setOnboardingStep("guide"); setShowHelpCenter(true); }}
                style={{
                  background: "rgba(192,132,252,0.12)",
                  border: "1px solid rgba(192,132,252,0.48)",
                  color: "rgba(192,132,252,0.9)",
                  fontFamily: "'Lora', serif", fontSize: 13,
                  letterSpacing: "0.2em", padding: "11px 30px",
                  borderRadius: 1, cursor: "pointer", transition: "all 0.18s",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(192,132,252,0.2)"; e.currentTarget.style.color = "#c084fc"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(192,132,252,0.12)"; e.currentTarget.style.color = "rgba(192,132,252,0.9)"; }}
              >
                continue →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* onboarding step 2 is now rendered inside the Help Center modal above */}

      {/* Toast */}
      {toast && (
        <div style={{
          position: "absolute", bottom: 26, left: "50%", transform: "translateX(-50%)",
          background: "rgba(11,10,17,0.92)", backdropFilter: "blur(10px)",
          border: "1px solid rgba(232,228,217,0.09)", borderRadius: 2,
          padding: "9px 20px", zIndex: 300,
          fontFamily: "'Lora', serif", fontSize: 12.5,
          color: "rgba(232,228,217,0.52)", letterSpacing: "0.14em", fontStyle: "italic",
          whiteSpace: "nowrap", pointerEvents: "none",
          animation: "toastIn 0.25s ease",
        }}>{toast}</div>
      )}
    </div>
  );
}