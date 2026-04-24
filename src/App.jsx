import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── QR Code (pure canvas, no lib needed) ────────────────────────────────────
function QRPlaceholder({ value, size = 140 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d");
    const cell = size / 21;
    const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return h; };
    const rng = (seed) => { let s = seed; return () => { s = (s ^ (s << 13)) >>> 0; s = (s ^ (s >>> 17)) >>> 0; s = (s ^ (s << 5)) >>> 0; return s / 0xFFFFFFFF; }; };
    const rand = rng(Math.abs(hash(value)));
    ctx.clearRect(0, 0, size, size);
    const dark = "#0d0d0d", light = "#f0f0f0";
    ctx.fillStyle = light; ctx.fillRect(0, 0, size, size);
    const fixed = new Set();
    [[0,0],[14,0],[0,14]].forEach(([ox,oy]) => {
      for (let r = 0; r < 7; r++) for (let cc = 0; cc < 7; cc++) {
        fixed.add(`${ox+cc},${oy+r}`);
        const outer = r===0||r===6||cc===0||cc===6;
        const inner = r>=2&&r<=4&&cc>=2&&cc<=4;
        ctx.fillStyle = (outer||inner) ? dark : light;
        ctx.fillRect((ox+cc)*cell, (oy+r)*cell, cell, cell);
      }
    });
    for (let r = 0; r < 21; r++) for (let cc = 0; cc < 21; cc++) {
      if (fixed.has(`${cc},${r}`)) continue;
      ctx.fillStyle = rand() > 0.5 ? dark : light;
      ctx.fillRect(cc*cell, r*cell, cell, cell);
    }
    for (let i = 8; i < 13; i++) {
      ctx.fillStyle = i % 2 === 0 ? dark : light;
      ctx.fillRect(i*cell, 6*cell, cell, cell);
      ctx.fillRect(6*cell, i*cell, cell, cell);
    }
  }, [value, size]);
  return <canvas ref={canvasRef} width={size} height={size} style={{ imageRendering: "pixelated" }} />;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
const I = {
  Home:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  Search:   () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  Bell:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>,
  Mail:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>,
  User:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  Heart:    ({f}) => <svg width="17" height="17" viewBox="0 0 24 24" fill={f?"#F75F4F":"none"} stroke={f?"#F75F4F":"currentColor"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  Comment:  () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>,
  Repost:   ({a}) => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={a?"#4FF7A0":"currentColor"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  Share:    () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>,
  Bookmark: ({f}) => <svg width="17" height="17" viewBox="0 0 24 24" fill={f?"#F7C84F":"none"} stroke={f?"#F7C84F":"currentColor"} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>,
  Close:    () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  Back:     () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>,
  Send:     () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  Check:    () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
  Settings: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
  Plus:     () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  QR:       () => <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="5" y="5" width="3" height="3" fill="currentColor"/><rect x="16" y="5" width="3" height="3" fill="currentColor"/><rect x="5" y="16" width="3" height="3" fill="currentColor"/><line x1="14" y1="14" x2="14" y2="14"/><line x1="17" y1="14" x2="17" y2="14"/><line x1="20" y1="14" x2="20" y2="14"/><line x1="14" y1="17" x2="14" y2="17"/><line x1="17" y1="17" x2="20" y2="17"/><line x1="14" y1="20" x2="17" y2="20"/><line x1="20" y1="20" x2="20" y2="20"/></svg>,
  Sun:      () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  Moon:     () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>,
  Link:     () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>,
  Eye:      () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
  Refresh:  () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>,
};

// ─── Seed Data ────────────────────────────────────────────────────────────────
let _id = 400; const uid = () => `${++_id}`;
const ts = m => Date.now() - m * 60000;
const COLORS = ["#4F8EF7","#F75F4F","#4FF7A0","#F7C84F","#C84FF7","#4FF7F0"];
const pickColor = n => COLORS[n.charCodeAt(0) % COLORS.length];

const INIT_USERS = [
  { id:"u1", username:"mara",  bio:"product + systems thinking",        isPrivate:false, following:["u2","u3"], followers:["u2","u4"], avatar:"#4F8EF7" },
  { id:"u2", username:"felix", bio:"building in public. infra nerd.",   isPrivate:false, following:["u1","u4"], followers:["u1","u3"], avatar:"#F75F4F" },
  { id:"u3", username:"yuki",  bio:"ux / motion / coffee",              isPrivate:false, following:["u1","u2"], followers:["u2","u4"], avatar:"#4FF7A0" },
  { id:"u4", username:"dom",   bio:"night owl. security.",              isPrivate:true,  following:["u1","u3"], followers:["u1","u2"], avatar:"#F7C84F" },
];

const p1=uid(),p2=uid(),p3=uid(),p4=uid(),p5=uid(),p6=uid();
const INIT_POSTS = [
  { id:p1, userId:"u2", content:"shipped the new deploy pipeline. 40% faster cold starts.", createdAt:ts(4),  likes:["u1","u3"],    reposts:[],     bookmarks:[],    shares:3, views:421 },
  { id:p2, userId:"u3", content:"the space between elements does more work than the elements.", createdAt:ts(9),  likes:["u1","u2"],    reposts:["u1"], bookmarks:["u1"],shares:7, views:892 },
  { id:p3, userId:"u1", content:"the best meetings could've been a 3-line ping",               createdAt:ts(14), likes:["u2"],         reposts:[],     bookmarks:[],    shares:2, views:233 },
  { id:p4, userId:"u4", content:"spent 2hrs reading CVEs. the internet is tape.",               createdAt:ts(22), likes:[],             reposts:[],     bookmarks:[],    shares:0, views:88  },
  { id:p5, userId:"u2", content:"postgres > everything. fight me.",                             createdAt:ts(35), likes:["u3","u1"],    reposts:["u3"], bookmarks:[],    shares:12,views:1340 },
  { id:p6, userId:"u3", content:"motion design is the grammar of digital space",                createdAt:ts(51), likes:["u1"],         reposts:[],     bookmarks:["u2"],shares:5, views:677 },
];

const INIT_REPLIES = [
  { id:uid(), postId:p1, userId:"u1", content:"@felix numbers or it didn't happen 👀", createdAt:ts(3), likes:["u2"] },
  { id:uid(), postId:p1, userId:"u3", content:"@felix cold start latency is so underrated", createdAt:ts(2), likes:[] },
  { id:uid(), postId:p3, userId:"u2", content:"@mara every standup could be a ping thread", createdAt:ts(13), likes:["u1"] },
  { id:uid(), postId:p5, userId:"u1", content:"@felix no debate here honestly", createdAt:ts(30), likes:[] },
];

const INIT_NOTIFS = [
  { id:uid(), type:"like",   fromId:"u2", postId:p3, read:false, createdAt:ts(5)  },
  { id:uid(), type:"reply",  fromId:"u3", postId:p2, read:false, createdAt:ts(9)  },
  { id:uid(), type:"repost", fromId:"u1", postId:p2, read:true,  createdAt:ts(20) },
  { id:uid(), type:"follow", fromId:"u2", postId:null, read:true, createdAt:ts(40) },
];

const INIT_MESSAGES = {
  "u1_u2": [
    { id:uid(), fromId:"u2", text:"hey, saw your ping about meetings — so true", createdAt:ts(30) },
    { id:uid(), fromId:"u1", text:"right? every standup is a waste",              createdAt:ts(29) },
    { id:uid(), fromId:"u2", text:"we should do async standups with pings",       createdAt:ts(28) },
  ],
  "u1_u3": [
    { id:uid(), fromId:"u3", text:"loved your post on space and elements",        createdAt:ts(120) },
    { id:uid(), fromId:"u1", text:"glad it resonated! motion is everything",      createdAt:ts(119) },
  ],
};

const BOT_LINES = [
  "something just clicked and i can't explain it",
  "hotfix deployed. coffee is now a food group.",
  "the diff is cleaner than expected",
  "finally got the animation timing right",
  "sometimes the bug is the feature",
  "reading old notes is humbling",
  "shipped it. no rollback needed. rare.",
  "late night debugging hits different",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const timeAgo = t => {
  const d = Math.floor((Date.now()-t)/1000);
  if(d<60) return `${d}s`; if(d<3600) return `${Math.floor(d/60)}m`;
  if(d<86400) return `${Math.floor(d/3600)}h`; return `${Math.floor(d/86400)}d`;
};
const fmtNum = n => {
  if(n >= 1000000) return `${(n/1000000).toFixed(1).replace(/\.0$/,"")}M`;
  if(n >= 1000) return `${(n/1000).toFixed(1).replace(/\.0$/,"")}K`;
  return n > 0 ? `${n}` : "";
};
const dmKey = (a,b) => [a,b].sort().join("_");

// ─── Theme ────────────────────────────────────────────────────────────────────
const DARK = {
  bg:"#080808", bg2:"#0d0d0d", bg3:"#141414",
  border:"#0e0e0e", border2:"#1a1a1a",
  text:"#e2e2e2", text2:"#888", text3:"#3a3a3a",
  muted:"#2a2a2a", accent:"#e2e2e2",
  cardHover:"#0a0a0a", tabActive:"#e2e2e2",
};
const LIGHT = {
  bg:"#f8f7f4", bg2:"#f0efe9", bg3:"#e8e7e1",
  border:"#e8e7e0", border2:"#dddcd5",
  text:"#141414", text2:"#666", text3:"#bbb",
  muted:"#ccc", accent:"#141414",
  cardHover:"#f3f2ec", tabActive:"#141414",
};

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Av({name, color, size=34}) {
  return (
    <div style={{width:size,height:size,borderRadius:"50%",background:color||"#4F8EF7",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Mono',monospace",fontSize:size*0.36,fontWeight:700,color:"#080808",flexShrink:0,userSelect:"none",letterSpacing:"-0.02em"}}>
      {name?.[0]?.toUpperCase()}
    </div>
  );
}

// ─── Char counter ─────────────────────────────────────────────────────────────
function CC({n, max, T}) {
  const r = max-n, warn = n>=80, danger = n>=max;
  return <span style={{fontSize:11,fontWeight:warn?700:400,color:danger?"#F75F4F":warn?"#F7C84F":T.text3,transition:"color 0.2s",letterSpacing:"0.04em",fontFamily:"'Space Mono',monospace"}}>{warn?`-${Math.max(0,r)}`:r}</span>;
}

// ─── Live counter ─────────────────────────────────────────────────────────────
function LiveCount({base, live=false, color, style={}}) {
  const [n, setN] = useState(base);
  useEffect(() => {
    if(!live) return;
    const t = setInterval(() => setN(v => v + (Math.random()>0.7?1:0)), 4000);
    return ()=>clearInterval(t);
  }, [live]);
  if(!n && n !== 0) return null;
  const str = fmtNum(n);
  return str ? <span style={{fontSize:10,color,letterSpacing:"0.02em",transition:"all 0.4s",...style}}>{str}</span> : null;
}

// ─── Pull-to-refresh wrapper ─────────────────────────────────────────────────
function PullToRefresh({children, onRefresh, T}) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0), el = useRef(null);
  const THRESH = 64;

  const onTouchStart = e => { startY.current = e.touches[0].clientY; };
  const onTouchMove = e => {
    if(el.current?.scrollTop > 0) return;
    const dy = e.touches[0].clientY - startY.current;
    if(dy > 0) setPullY(Math.min(dy * 0.45, THRESH + 10));
  };
  const onTouchEnd = async () => {
    if(pullY >= THRESH) {
      setRefreshing(true);
      await new Promise(r => setTimeout(r, 900));
      onRefresh();
      setRefreshing(false);
    }
    setPullY(0);
  };

  return (
    <div ref={el} style={{flex:1,overflowY:"auto",position:"relative"}}
      onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      {(pullY > 0 || refreshing) && (
        <div style={{display:"flex",justifyContent:"center",alignItems:"center",height:pullY||36,overflow:"hidden",transition:refreshing?"none":"height 0.2s",color:T.text3,fontSize:11,letterSpacing:"0.08em",gap:6}}>
          <div style={{animation:refreshing?"spin 0.8s linear infinite":"none",display:"flex"}}>
            <I.Refresh/>
          </div>
          {refreshing&&<span>refreshing</span>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── Instagram Story Canvas Export ───────────────────────────────────────────
async function capturePostAsStory(post, author, dark) {
  const W = 1080, H = 1920;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");

  // Background
  const bg = dark ? "#080808" : "#f8f7f4";
  const cardBg = dark ? "#111111" : "#ffffff";
  const textPrimary = dark ? "#e2e2e2" : "#141414";
  const textMuted = dark ? "#888888" : "#666666";
  const borderCol = dark ? "#1a1a1a" : "#e8e7e0";
  const accent = "#4F8EF7";

  // Solid background
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Subtle grid texture
  ctx.strokeStyle = dark ? "rgba(255,255,255,0.015)" : "rgba(0,0,0,0.025)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Card dimensions — centered, tall for story
  const cx = 80, cy = H/2 - 340, cw = W - 160, ch = 680;
  const r = 32;

  // Card shadow
  ctx.shadowColor = dark ? "rgba(0,0,0,0.8)" : "rgba(0,0,0,0.15)";
  ctx.shadowBlur = 80; ctx.shadowOffsetY = 24;
  ctx.fillStyle = cardBg;
  ctx.beginPath();
  ctx.roundRect(cx, cy, cw, ch, r);
  ctx.fill();
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;

  // Card border
  ctx.strokeStyle = borderCol; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, r); ctx.stroke();

  // Avatar circle
  const avColor = author?.avatar || "#4F8EF7";
  const avX = cx + 56, avY = cy + 72, avR = 44;
  ctx.fillStyle = avColor;
  ctx.beginPath(); ctx.arc(avX, avY, avR, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = "#080808";
  ctx.font = "bold 42px 'Space Mono', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText((author?.username?.[0] || "?").toUpperCase(), avX, avY + 2);

  // Username
  ctx.fillStyle = textPrimary;
  ctx.font = "bold 38px 'Space Mono', monospace";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText(`@${author?.username || "unknown"}`, cx + 118, avY - 8);

  // Timestamp
  ctx.fillStyle = textMuted;
  ctx.font = "28px 'Space Mono', monospace";
  ctx.fillText(timeAgo(post.createdAt), cx + 118, avY + 32);

  // Divider
  ctx.strokeStyle = borderCol; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx + 40, cy + 140); ctx.lineTo(cx + cw - 40, cy + 140); ctx.stroke();

  // Post content — word-wrapped
  ctx.fillStyle = textPrimary;
  ctx.font = "44px 'Instrument Serif', serif";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  const words = post.content.split(" ");
  const maxLineW = cw - 100;
  let lines = [], line = "";
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxLineW) { lines.push(line); line = word; }
    else line = test;
  }
  if (line) lines.push(line);
  const lineH = 64;
  const textStartY = cy + 180;
  lines.forEach((l, i) => ctx.fillText(l, cx + 50, textStartY + i * lineH));

  // Stats row
  const statsY = cy + ch - 130;
  ctx.strokeStyle = borderCol; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx + 40, statsY - 20); ctx.lineTo(cx + cw - 40, statsY - 20); ctx.stroke();

  const stats = [
    { label: `${post.likes.length} likes` },
    { label: `${post.reposts.length} reposts` },
    { label: `${post.shares} shares` },
    { label: `${fmtNum(post.views)} views` },
  ];
  ctx.font = "26px 'Space Mono', monospace";
  ctx.fillStyle = textMuted; ctx.textAlign = "left";
  const statSpacing = (cw - 100) / stats.length;
  stats.forEach((s, i) => ctx.fillText(s.label, cx + 50 + i * statSpacing, statsY + 10));

  // ping. branding watermark at top
  ctx.font = "italic 68px 'Instrument Serif', serif";
  ctx.fillStyle = dark ? "rgba(226,226,226,0.9)" : "rgba(20,20,20,0.9)";
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  ctx.fillText("ping.", 80, 90);

  // Accent dot next to brand
  ctx.fillStyle = "#4FF7A0";
  ctx.beginPath(); ctx.arc(100 + ctx.measureText("ping.").width - 10, 120, 10, 0, Math.PI*2); ctx.fill();

  // Bottom CTA — "tap to read on ping."
  const postURL = `https://ping.app/p/${post.id}`;
  const ctaY = H - 200;
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.roundRect(W/2 - 320, ctaY, 640, 88, 44); ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 30px 'Space Mono', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("read on ping.app →", W/2, ctaY + 44);

  // contentURL label (small, below button — for Instagram sticker deep-link)
  ctx.fillStyle = dark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)";
  ctx.font = "22px 'Space Mono', monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText(postURL, W/2, ctaY + 104);

  // Export
  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // Try Web Share API (mobile) with contentURL for Instagram sticker deep-link
    if (navigator.share) {
      const file = new File([blob], `ping-${post.id}.png`, { type: "image/png" });
      navigator.share({
        files: [file],
        title: `ping. by @${author?.username}`,
        url: postURL, // contentURL — Instagram reads this as the sticker link
      }).catch(() => {
        // Fallback: download
        const a = document.createElement("a"); a.href = url; a.download = `ping-story-${post.id}.png`; a.click();
      });
    } else {
      // Desktop fallback: download PNG
      const a = document.createElement("a"); a.href = url; a.download = `ping-story-${post.id}.png`; a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, "image/png");
}

// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [dark, setDark]         = useState(true);
  const T = dark ? DARK : LIGHT;

  const [loggedIn, setLoggedIn] = useState(false);
  const [users, setUsers]       = useState(INIT_USERS);
  const [posts, setPosts]       = useState(INIT_POSTS);
  const [replies, setReplies]   = useState(INIT_REPLIES);
  const [notifs, setNotifs]     = useState(INIT_NOTIFS);
  const [msgs, setMsgs]         = useState(INIT_MESSAGES);
  const [myId, setMyId]         = useState(null);
  const [tab, setTab]           = useState("stream");

  const [loginF, setLoginF]     = useState({username:"", bio:""});
  const [signupMode, setSignupMode] = useState(false);
  const [loginErr, setLoginErr] = useState("");

  const [composeOpen, setComposeOpen]       = useState(false);
  const [replyTarget, setReplyTarget]       = useState(null);
  const [expandedPost, setExpandedPost]     = useState(null);
  const [profileTarget, setProfileTarget]   = useState(null);
  const [dmTarget, setDmTarget]             = useState(null);
  const [followListInfo, setFollowListInfo] = useState(null);
  const [editOpen, setEditOpen]             = useState(false);
  const [shareTarget, setShareTarget]       = useState(null);
  const [qrTarget, setQrTarget]             = useState(null);
  const [searchQ, setSearchQ]               = useState("");

  const [pingText, setPingText]   = useState("");
  const [replyText, setReplyText] = useState("");
  const [dmText, setDmText]       = useState("");
  const [copiedMsg, setCopiedMsg] = useState("");

  const [barVis, setBarVis]   = useState(true);
  const [fabVis, setFabVis]   = useState(true);
  const lastY = useRef(0);
  const scrollEl = useRef(null);

  const getUser = useCallback(id => users.find(u=>u.id===id), [users]);
  const me = users.find(u=>u.id===myId);

  useEffect(() => {
    const el = scrollEl.current; if(!el) return;
    const h = () => {
      const y = el.scrollTop;
      const down = y > lastY.current + 6, up = y < lastY.current - 6;
      if(down && y>80) { setBarVis(false); setFabVis(false); }
      if(up || y<60)   { setBarVis(true);  setFabVis(true);  }
      lastY.current = y;
    };
    el.addEventListener("scroll", h, {passive:true});
    return ()=>el.removeEventListener("scroll",h);
  }, [loggedIn, tab]);

  useEffect(() => {
    if(!myId) return;
    const t = setInterval(()=>{
      const bots=["u1","u2","u3","u4"].filter(x=>x!==myId);
      const botId=bots[Math.floor(Math.random()*bots.length)];
      setPosts(p=>[{id:uid(),userId:botId,content:BOT_LINES[Math.floor(Math.random()*BOT_LINES.length)],createdAt:Date.now(),likes:[],reposts:[],bookmarks:[],shares:0,views:Math.floor(Math.random()*80)+5},...p]);
    }, 14000);
    const v = setInterval(()=>{
      setPosts(p=>p.map(x=>({...x,views:x.views+Math.floor(Math.random()*3)})));
    }, 5000);
    return ()=>{clearInterval(t);clearInterval(v);};
  }, [myId]);

  function addNotif(n) { setNotifs(ns=>[{id:uid(),...n,read:false,createdAt:Date.now()},...ns]); }

  function handleLogin() {
    const un = loginF.username.trim().toLowerCase();
    if(!un||un.length<2){setLoginErr("min 2 chars");return;}
    if(signupMode){
      if(users.find(u=>u.username===un)){setLoginErr("username taken");return;}
      const nu={id:uid(),username:un,bio:loginF.bio.slice(0,80)||"",isPrivate:false,following:[],followers:[],avatar:pickColor(un)};
      setUsers(u=>[...u,nu]); setMyId(nu.id);
    } else {
      const found=users.find(u=>u.username===un);
      if(!found){setLoginErr("not found — sign up?");return;}
      setMyId(found.id);
    }
    setLoginErr(""); setLoggedIn(true);
  }

  function postPing(content) {
    if(!content?.trim()||content.length>99) return;
    const p={id:uid(),userId:myId,content:content.trim(),createdAt:Date.now(),likes:[],reposts:[],bookmarks:[],shares:0,views:1};
    setPosts(ps=>[p,...ps]);
    setPingText(""); setComposeOpen(false);
  }

  function postReply() {
    if(!replyText.trim()||!replyTarget) return;
    const post=posts.find(p=>p.id===replyTarget), author=post?getUser(post.userId):null;
    const content=author&&!replyText.startsWith(`@${author.username}`)
      ?`@${author.username} ${replyText.trim()}`:replyText.trim();
    setReplies(rs=>[...rs,{id:uid(),postId:replyTarget,userId:myId,content,createdAt:Date.now(),likes:[]}]);
    if(author&&author.id!==myId) addNotif({type:"reply",fromId:myId,postId:replyTarget});
    setReplyText(""); setReplyTarget(null);
  }

  function toggleLike(postId) {
    setPosts(ps=>ps.map(p=>{
      if(p.id!==postId) return p;
      const had=p.likes.includes(myId);
      if(!had&&p.userId!==myId) addNotif({type:"like",fromId:myId,postId});
      return {...p,likes:had?p.likes.filter(x=>x!==myId):[...p.likes,myId]};
    }));
  }
  function toggleRepost(postId) {
    setPosts(ps=>ps.map(p=>{
      if(p.id!==postId) return p;
      const had=p.reposts.includes(myId);
      if(!had&&p.userId!==myId) addNotif({type:"repost",fromId:myId,postId});
      return {...p,reposts:had?p.reposts.filter(x=>x!==myId):[...p.reposts,myId]};
    }));
  }
  function toggleBookmark(postId) {
    setPosts(ps=>ps.map(p=>{if(p.id!==postId)return p;const had=p.bookmarks.includes(myId);return{...p,bookmarks:had?p.bookmarks.filter(x=>x!==myId):[...p.bookmarks,myId]};}));
  }
  function toggleFollow(targetId) {
    setUsers(us=>us.map(u=>{
      if(u.id===myId){const h=u.following.includes(targetId);return{...u,following:h?u.following.filter(x=>x!==targetId):[...u.following,targetId]};}
      if(u.id===targetId){const h=u.followers.includes(myId);return{...u,followers:h?u.followers.filter(x=>x!==myId):[...u.followers,myId]};}
      return u;
    }));
    if(!me?.following?.includes(targetId)) addNotif({type:"follow",fromId:myId,postId:null});
  }
  function sendDM(toId) {
    if(!dmText.trim()) return;
    const key=dmKey(myId,toId);
    setMsgs(m=>({...m,[key]:[...(m[key]||[]),{id:uid(),fromId:myId,text:dmText.trim(),createdAt:Date.now()}]}));
    setDmText("");
  }
  function saveProfile(edits) { setUsers(us=>us.map(u=>u.id===myId?{...u,...edits}:u)); setEditOpen(false); }
  function openReply(postId) {
    const post=posts.find(p=>p.id===postId), author=post?getUser(post.userId):null;
    setReplyTarget(postId); setReplyText(author?`@${author.username} `:"");
  }
  function openProfile(uid) { setProfileTarget(uid); setTab("profile"); }
  function openDM(uid) { setDmTarget(uid); setTab("messages"); }
  function copyLink(text) {
    navigator.clipboard?.writeText(text).catch(()=>{});
    setCopiedMsg("link copied!"); setTimeout(()=>setCopiedMsg(""),2000);
  }
  function handleRefresh() {
    const bots=["u1","u2","u3","u4"].filter(x=>x!==myId);
    const botId=bots[Math.floor(Math.random()*bots.length)];
    setPosts(p=>[{id:uid(),userId:botId,content:BOT_LINES[Math.floor(Math.random()*BOT_LINES.length)],createdAt:Date.now(),likes:[],reposts:[],bookmarks:[],shares:0,views:1},...p]);
  }

  const unread = notifs.filter(n=>!n.read&&n.fromId!==myId).length;
  const profileUser = tab==="profile"&&profileTarget ? getUser(profileTarget) : (tab==="profile"?me:null);

  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Instrument+Serif:ital@0;1&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} ::placeholder{color:${T.muted};} input,textarea{outline:none;border:none;background:transparent;color:${T.text};font-family:'Space Mono',monospace;resize:none;} ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-track{background:transparent;} ::-webkit-scrollbar-thumb{background:${T.border2};border-radius:2px;} .iBtn{background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:5px;border-radius:50%;transition:background 0.12s,color 0.12s;color:${T.text3};} .iBtn:hover{background:${T.bg3};color:${T.text};} .card{border-bottom:1px solid ${T.border};padding:13px 15px;transition:background 0.1s;} .card:hover{background:${T.cardHover};} .tPill{background:none;border:none;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:0.07em;text-transform:uppercase;cursor:pointer;padding:10px 0;border-bottom:2px solid transparent;color:${T.text3};transition:color 0.15s,border-color 0.15s;flex:1;text-align:center;} .tPill.on{color:${T.tabActive};border-bottom-color:${T.tabActive};} .tPill:hover:not(.on){color:${T.text2};} .bTab{background:none;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;flex:1;padding:10px;color:${T.muted};transition:color 0.2s;position:relative;} .bTab:hover{color:${T.text2};} .bTab.on{color:${T.text};} .fab{position:fixed;bottom:68px;right:16px;width:50px;height:50px;border-radius:50%;background:${T.accent};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 3px 20px rgba(0,0,0,0.5);color:${dark?"#080808":"#f8f7f4"};z-index:88;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),opacity 0.22s;} .fab:hover{transform:scale(1.1) !important;} .overlay{position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:200;display:flex;align-items:flex-end;justify-content:center;} .sheet{background:${T.bg};width:100%;max-width:600px;border-radius:18px 18px 0 0;border:1px solid ${T.border2};border-bottom:none;max-height:88vh;overflow-y:auto;} .iLine{width:100%;padding:9px 0;border-bottom:1px solid ${T.border2};font-size:12px;transition:border-color 0.2s;color:${T.text};} .iLine:focus{border-bottom-color:${T.text};} .btnMain{background:${T.accent};color:${dark?"#080808":"#f8f7f4"};border:none;padding:8px 18px;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;cursor:pointer;border-radius:2px;transition:opacity 0.15s;} .btnMain:hover{opacity:0.82;} .btnMain:disabled{opacity:0.2;cursor:not-allowed;} .uBtn{background:none;border:none;color:${T.text};font-family:'Space Mono',monospace;font-size:12px;font-weight:700;cursor:pointer;padding:0;transition:color 0.15s;} .uBtn:hover{color:#4F8EF7;} .fBtn{background:none;border:1px solid ${T.border2};color:${T.text2};font-family:'Space Mono',monospace;font-size:9px;letter-spacing:0.08em;text-transform:uppercase;padding:4px 10px;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;gap:3px;} .fBtn:hover{border-color:${T.text};color:${T.text};} .fBtn.on{background:${T.accent};color:${dark?"#080808":"#f8f7f4"};border-color:${T.accent};} .fBtn.on:hover{background:transparent;color:#F75F4F;border-color:#F75F4F;} .ndot{width:7px;height:7px;border-radius:50%;background:#F75F4F;position:absolute;top:5px;right:5px;} @keyframes slideUp{from{transform:translateY(24px);opacity:0}to{transform:translateY(0);opacity:1}} @keyframes newPing{from{background:${dark?"#12120a":"#f5f4e8"}}to{background:transparent}} @keyframes pulseDot{0%,100%{opacity:1}50%{opacity:0.25}} @keyframes spin{to{transform:rotate(360deg)}} @keyframes countUp{from{transform:translateY(4px);opacity:0}to{transform:translateY(0);opacity:1}} .slideUp{animation:slideUp 0.22s ease-out;} .newPing{animation:newPing 1.4s ease-out;}`;

  // ── Login ──
  if(!loggedIn) return (
    <div style={{minHeight:"100vh",background:"#080808",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'Space Mono',monospace"}}>
      <style>{CSS}</style>
      <div style={{width:310,padding:"0 20px"}}>
        <div style={{marginBottom:44}}>
          <div style={{fontFamily:"'Instrument Serif',serif",fontSize:48,color:"#e2e2e2",letterSpacing:"-0.02em",lineHeight:1}}>ping.</div>
          <div style={{color:"#262626",fontSize:9,marginTop:8,letterSpacing:"0.14em",textTransform:"uppercase"}}>real-time · minimal · live</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <div>
            <div style={{color:"#363636",fontSize:9,letterSpacing:"0.14em",marginBottom:10,textTransform:"uppercase"}}>username</div>
            <input className="iLine" style={{fontSize:13}} placeholder={signupMode?"pick a handle":"@handle"} value={loginF.username}
              onChange={e=>setLoginF(f=>({...f,username:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&handleLogin()}/>
          </div>
          {signupMode&&(
            <div>
              <div style={{color:"#363636",fontSize:9,letterSpacing:"0.14em",marginBottom:10,textTransform:"uppercase"}}>bio</div>
              <input className="iLine" style={{fontSize:12}} placeholder="short intro" value={loginF.bio} onChange={e=>setLoginF(f=>({...f,bio:e.target.value.slice(0,80)}))}/>
            </div>
          )}
          {!signupMode&&<div style={{color:"#1e1e1e",fontSize:10}}>demo: mara · felix · yuki · dom</div>}
          {loginErr&&<div style={{color:"#F75F4F",fontSize:11}}>{loginErr}</div>}
          <div style={{display:"flex",alignItems:"center",gap:14,marginTop:4}}>
            <button className="btnMain" onClick={handleLogin}>{signupMode?"create":"sign in"}</button>
            <button style={{background:"none",border:"none",color:"#404040",fontFamily:"'Space Mono',monospace",fontSize:10,cursor:"pointer",textDecoration:"underline",textUnderlineOffset:"3px"}}
              onClick={()=>{setSignupMode(s=>!s);setLoginErr("");}}>
              {signupMode?"← sign in":"sign up"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if(!me) return null;

  const streamPosts = posts.filter(p=>{
    const a=getUser(p.userId);
    return a&&(!a.isPrivate||a.id===myId||me.following.includes(a.id));
  }).sort((a,b)=>b.createdAt-a.createdAt);

  const postActions = {
    onLike:pid=>toggleLike(pid),
    onRepost:pid=>toggleRepost(pid),
    onBookmark:pid=>toggleBookmark(pid),
    onReply:pid=>openReply(pid),
    onShare:pid=>{const p=posts.find(x=>x.id===pid);setShareTarget(p||null);if(p)setPosts(ps=>ps.map(x=>x.id===pid?{...x,shares:x.shares+1}:x));},
    onProfile:openProfile,
    onFollow:toggleFollow,
    onExpand:pid=>setExpandedPost(pid),
  };

  return (
    <div style={{position:"relative",height:"100vh",background:T.bg,display:"flex",flexDirection:"column",maxWidth:600,margin:"0 auto",overflow:"hidden",fontFamily:"'Space Mono',monospace"}}>
      <style>{CSS+`body{background:${T.bg};}`}</style>

      {copiedMsg&&<div style={{position:"fixed",top:60,left:"50%",transform:"translateX(-50%)",background:T.text,color:T.bg,padding:"8px 16px",borderRadius:4,fontSize:11,letterSpacing:"0.06em",zIndex:999,fontFamily:"'Space Mono',monospace"}}>{copiedMsg}</div>}

      {/* TOP BAR */}
      <div style={{position:"sticky",top:0,zIndex:80,background:`${T.bg}ee`,backdropFilter:"blur(18px)",borderBottom:`1px solid ${T.border}`,padding:"0 15px",height:50,display:"flex",alignItems:"center",justifyContent:"space-between",flexShrink:0}}>
        {/* Left: logo */}
        <div style={{fontFamily:"'Instrument Serif',serif",fontSize:27,color:T.text,letterSpacing:"-0.02em",lineHeight:1}}>ping.</div>

        {/* Center: back button for DM thread only */}
        <div style={{display:"flex",alignItems:"center"}}>
          {tab==="messages"&&dmTarget&&(
            <button className="iBtn" onClick={()=>setDmTarget(null)}><I.Back/></button>
          )}
        </div>

        {/* Right: contextual actions */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:10,minWidth:90}}>
          {tab==="stream"&&(
            <div style={{display:"flex",alignItems:"center",gap:5,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#4FF7A0",display:"inline-block",animation:"pulseDot 2s infinite"}}/>
              <span style={{color:"#4FF7A0",fontWeight:700}}>PINGING</span>
            </div>
          )}
          {tab==="notifications"&&unread>0&&(
            <button style={{background:"none",border:"none",color:T.text3,fontFamily:"'Space Mono',monospace",fontSize:9,letterSpacing:"0.1em",cursor:"pointer",textTransform:"uppercase"}}
              onClick={()=>setNotifs(ns=>ns.map(n=>({...n,read:true})))}>mark read</button>
          )}
          {tab==="profile"&&profileUser&&profileUser.id===myId&&(
            <button className="iBtn" style={{color:T.text2}} onClick={()=>setEditOpen(true)}><I.Settings/></button>
          )}
        </div>
      </div>

      {/* SCROLL AREA */}
      <div ref={scrollEl} style={{flex:1,overflowY:"auto",paddingBottom:60}}>

        {/* STREAM */}
        {tab==="stream"&&(
          <PullToRefresh onRefresh={handleRefresh} T={T}>
            {streamPosts.map((p,i)=>(
              <PostCard key={p.id} post={p} author={getUser(p.userId)} me={me}
                allReplies={replies.filter(r=>r.postId===p.id)}
                getUser={getUser} isNew={i===0} T={T}
                {...postActions}
              />
            ))}
            {streamPosts.length===0&&<div style={{padding:"48px 20px",color:T.text3,fontSize:12,textAlign:"center"}}>no pings yet</div>}
          </PullToRefresh>
        )}

        {/* SEARCH */}
        {tab==="search"&&(
          <div style={{padding:"14px 16px"}}>
            <div style={{display:"flex",alignItems:"center",gap:10,borderBottom:`1px solid ${T.border2}`,paddingBottom:12,marginBottom:16}}>
              <div style={{color:T.text3}}><I.Search/></div>
              <input style={{flex:1,fontSize:13}} placeholder="search users..." value={searchQ} onChange={e=>setSearchQ(e.target.value)} autoFocus/>
            </div>
            {users.filter(u=>u.id!==myId&&(!searchQ||u.username.includes(searchQ.toLowerCase()))).map(u=>(
              <URow key={u.id} user={u} me={me} following={me.following.includes(u.id)}
                onFollow={()=>toggleFollow(u.id)} onProfile={()=>openProfile(u.id)} onMsg={()=>openDM(u.id)} T={T}/>
            ))}
          </div>
        )}

        {/* NOTIFICATIONS */}
        {tab==="notifications"&&(
          <div>
            {notifs.length===0&&<div style={{padding:"48px",color:T.text3,fontSize:12,textAlign:"center"}}>no notifications</div>}
            {notifs.map(n=>{
              const from=getUser(n.fromId); if(!from) return null;
              const post=n.postId?posts.find(p=>p.id===n.postId):null;
              return(
                <div key={n.id} className="card" style={{background:n.read?"transparent":dark?"#0c0c08":"#fdfde8",cursor:"pointer",display:"flex",gap:12}}
                  onClick={()=>setNotifs(ns=>ns.map(x=>x.id===n.id?{...x,read:true}:x))}>
                  <button style={{background:"none",border:"none",cursor:"pointer",padding:0,flexShrink:0}} onClick={e=>{e.stopPropagation();openProfile(from.id);}}>
                    <Av name={from.username} color={from.avatar} size={34}/>
                  </button>
                  <div style={{flex:1}}>
                    <div style={{fontSize:12,color:T.text2,lineHeight:1.7}}>
                      <button className="uBtn" style={{fontSize:12}} onClick={e=>{e.stopPropagation();openProfile(from.id);}}>@{from.username}</button>
                      {n.type==="like"&&" liked your ping"}
                      {n.type==="reply"&&" replied to your ping"}
                      {n.type==="repost"&&" reposted your ping"}
                      {n.type==="follow"&&" followed you"}
                      {n.type==="mention"&&" mentioned you"}
                    </div>
                    {post&&<div style={{color:T.text3,fontSize:11,marginTop:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{post.content}</div>}
                    <div style={{color:T.muted,fontSize:10,marginTop:3}}>{timeAgo(n.createdAt)}</div>
                  </div>
                  {!n.read&&<div style={{width:6,height:6,borderRadius:"50%",background:"#4F8EF7",marginTop:4,flexShrink:0}}/>}
                </div>
              );
            })}
          </div>
        )}

        {/* MESSAGES LIST */}
        {tab==="messages"&&!dmTarget&&(
          <div>
            <div style={{padding:"12px 16px",borderBottom:`1px solid ${T.border}`,color:T.text3,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase"}}>conversations</div>
            {users.filter(u=>u.id!==myId).map(u=>{
              const key=dmKey(myId,u.id),convo=msgs[key]||[],last=convo[convo.length-1];
              return(
                <div key={u.id} className="card" style={{display:"flex",gap:12,cursor:"pointer"}} onClick={()=>setDmTarget(u.id)}>
                  <Av name={u.username} color={u.avatar} size={40}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                      <span style={{fontWeight:700,fontSize:12,color:T.text}}>@{u.username}</span>
                      {last&&<span style={{color:T.muted,fontSize:10}}>{timeAgo(last.createdAt)}</span>}
                    </div>
                    <div style={{color:T.text3,fontSize:11,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {last?(last.fromId===myId?"you: ":"")+last.text:"start a conversation"}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* DM THREAD */}
        {tab==="messages"&&dmTarget&&(()=>{
          const partner=getUser(dmTarget), key=dmKey(myId,dmTarget), convo=msgs[key]||[];
          if(!partner) return null;
          return(
            <div>
              <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 15px",borderBottom:`1px solid ${T.border}`,position:"sticky",top:50,zIndex:70,background:`${T.bg}f5`,backdropFilter:"blur(12px)"}}>
                <button className="iBtn" onClick={()=>setDmTarget(null)}><I.Back/></button>
                <Av name={partner.username} color={partner.avatar} size={30}/>
                <span style={{fontWeight:700,fontSize:12,color:T.text}}>@{partner.username}</span>
              </div>
              <div style={{padding:"16px",display:"flex",flexDirection:"column",gap:10,minHeight:300}}>
                {convo.length===0&&<div style={{color:T.text3,fontSize:12,textAlign:"center",paddingTop:24}}>no messages yet</div>}
                {convo.map(msg=>{
                  const isMe=msg.fromId===myId;
                  return(
                    <div key={msg.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
                      <div style={{maxWidth:"74%",background:isMe?T.accent:T.bg3,color:isMe?dark?"#080808":"#f8f7f4":T.text,padding:"8px 12px",borderRadius:isMe?"14px 14px 2px 14px":"14px 14px 14px 2px",fontSize:12,lineHeight:1.6}}>
                        {msg.text}
                        <div style={{fontSize:9,marginTop:3,color:isMe?dark?"#888":"#aaa":T.text3,textAlign:isMe?"right":"left"}}>{timeAgo(msg.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div style={{padding:"10px 15px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,alignItems:"center",position:"sticky",bottom:58,background:`${T.bg}f5`}}>
                <input style={{flex:1,fontSize:12,padding:"8px 12px",background:T.bg3,borderRadius:20,border:`1px solid ${T.border2}`,color:T.text}}
                  placeholder={`message @${partner.username}...`} value={dmText}
                  onChange={e=>setDmText(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&sendDM(dmTarget)}/>
                <button className="iBtn" style={{color:dmText.trim()?T.text:T.muted}} onClick={()=>sendDM(dmTarget)}><I.Send/></button>
              </div>
            </div>
          );
        })()}

        {/* PROFILE */}
        {tab==="profile"&&profileUser&&(
          <ProfileView user={profileUser} me={me} myId={myId}
            posts={posts} replies={replies} getUser={getUser} T={T}
            onLike={toggleLike} onRepost={toggleRepost} onBookmark={toggleBookmark}
            onReply={openReply} onFollow={toggleFollow} onProfile={openProfile}
            onMsg={openDM} postPing={postPing}
            onShare={pid=>{const p=posts.find(x=>x.id===pid);setShareTarget(p||null);if(p)setPosts(ps=>ps.map(x=>x.id===pid?{...x,shares:x.shares+1}:x));}}
            onFollowList={type=>setFollowListInfo({userId:profileUser.id,type})}
            onQR={()=>setQrTarget(profileUser)}
          />
        )}
      </div>

      {/* FAB */}
      {tab==="stream"&&(
        <button className="fab"
          style={{transform:fabVis?"scale(1)":"scale(0)",opacity:fabVis?1:0}}
          onClick={()=>setComposeOpen(true)}>
          <I.Plus/>
        </button>
      )}

      {/* BOTTOM TAB BAR */}
      <div style={{
        position:"fixed",bottom:0,left:"50%",width:"100%",maxWidth:600,
        background:`${T.bg}f8`,backdropFilter:"blur(20px)",
        borderTop:`1px solid ${T.border}`,display:"flex",height:56,zIndex:100,
        transition:"transform 0.28s ease,opacity 0.28s ease",
        transform:`translateX(-50%) translateY(${barVis?"0":"62px"})`,
        opacity:barVis?1:0,
      }}>
        {[{id:"stream",El:I.Home},{id:"search",El:I.Search},{id:"notifications",El:I.Bell,badge:unread>0},{id:"messages",El:I.Mail},{id:"profile",El:I.User}].map(({id,El,badge})=>(
          <button key={id} className={`bTab ${tab===id?"on":""}`}
            onClick={()=>{setTab(id);if(id==="profile")setProfileTarget(myId);if(id!=="messages")setDmTarget(null);}}>
            <El/>
            {badge&&<div className="ndot"/>}
          </button>
        ))}
      </div>

      {/* MODALS */}

      {/* Compose */}
      {composeOpen&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget){setComposeOpen(false);setPingText("");}}}>
          <div className="sheet slideUp" style={{padding:20}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>new ping</span>
              <button className="iBtn" onClick={()=>{setComposeOpen(false);setPingText("");}}><I.Close/></button>
            </div>
            <div style={{display:"flex",gap:12}}>
              <Av name={me.username} color={me.avatar} size={36}/>
              <div style={{flex:1}}>
                <textarea style={{width:"100%",fontSize:14,lineHeight:1.7,minHeight:80,color:T.text}} placeholder="What's happening?" value={pingText} maxLength={99} onChange={e=>setPingText(e.target.value)} autoFocus onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))postPing(pingText);}}/>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,borderTop:`1px solid ${T.border}`,paddingTop:11}}>
                  <CC n={pingText.length} max={99} T={T}/>
                  <button className="btnMain" onClick={()=>postPing(pingText)} disabled={!pingText.trim()||pingText.length>99}>ping it</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reply */}
      {replyTarget&&(()=>{
        const post=posts.find(p=>p.id===replyTarget), author=post?getUser(post.userId):null;
        if(!post||!author) return null;
        return(
          <div className="overlay" onClick={e=>{if(e.target===e.currentTarget){setReplyTarget(null);setReplyText("");}}}>
            <div className="sheet slideUp" style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>reply</span>
                <button className="iBtn" onClick={()=>{setReplyTarget(null);setReplyText("");}}><I.Close/></button>
              </div>
              <div style={{display:"flex",gap:10,paddingBottom:14,borderBottom:`1px solid ${T.border}`,marginBottom:14,opacity:0.55}}>
                <Av name={author.username} color={author.avatar} size={26}/>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:T.text2,marginBottom:3}}>@{author.username}</div>
                  <div style={{fontSize:12,color:T.text2,lineHeight:1.65}}>{post.content}</div>
                </div>
              </div>
              <div style={{display:"flex",gap:12}}>
                <Av name={me.username} color={me.avatar} size={34}/>
                <div style={{flex:1}}>
                  <div style={{display:"flex",flexDirection:"column"}}>
                    <span style={{fontSize:11,color:"#4F8EF7",fontWeight:700,marginBottom:4}}>@{author.username}</span>
                    <textarea style={{width:"100%",fontSize:13,lineHeight:1.7,minHeight:56,color:T.text}}
                      placeholder={`reply to @${author.username}...`}
                      value={replyText.replace(`@${author.username} `,"")}
                      onChange={e=>setReplyText(`@${author.username} ${e.target.value}`)}
                      autoFocus
                      onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))postReply();}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"flex-end",marginTop:10}}>
                    <button className="btnMain" style={{fontSize:10,padding:"7px 14px"}} onClick={postReply} disabled={!replyText.trim()||replyText.trim()===`@${author.username}`}>reply</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Expanded post thread */}
      {expandedPost&&(()=>{
        const post=posts.find(p=>p.id===expandedPost), author=post?getUser(post.userId):null;
        if(!post||!author) return null;
        const threadReplies=replies.filter(r=>r.postId===expandedPost).sort((a,b)=>a.createdAt-b.createdAt);
        return(
          <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setExpandedPost(null);}}>
            <div className="sheet slideUp" style={{maxHeight:"88vh",padding:0}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
                <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>thread</span>
                <button className="iBtn" onClick={()=>setExpandedPost(null)}><I.Close/></button>
              </div>
              <div style={{padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
                <div style={{display:"flex",gap:11,marginBottom:10}}>
                  <Av name={author.username} color={author.avatar} size={38}/>
                  <div>
                    <span style={{fontWeight:700,fontSize:13,color:T.text}}>@{author.username}</span>
                    <span style={{color:T.text3,fontSize:10,marginLeft:8}}>{timeAgo(post.createdAt)}</span>
                  </div>
                </div>
                <div style={{fontSize:14,color:T.text,lineHeight:1.75,marginBottom:14}}>{post.content}</div>
                <ActionBar post={post} me={me} T={T}
                  onLike={()=>toggleLike(post.id)} onRepost={()=>toggleRepost(post.id)}
                  onBookmark={()=>toggleBookmark(post.id)} onReply={()=>{setExpandedPost(null);openReply(post.id);}}
                  onShare={()=>{setShareTarget(post);setPosts(ps=>ps.map(x=>x.id===post.id?{...x,shares:x.shares+1}:x));}}
                />
              </div>
              <div style={{overflowY:"auto",maxHeight:400}}>
                {threadReplies.length===0&&<div style={{padding:"24px",color:T.text3,fontSize:12,textAlign:"center"}}>no replies yet</div>}
                {threadReplies.map(r=>{
                  const ru=getUser(r.userId); if(!ru) return null;
                  return(
                    <div key={r.id} style={{display:"flex",gap:11,padding:"12px 18px",borderBottom:`1px solid ${T.border}`}}>
                      <Av name={ru.username} color={ru.avatar} size={30}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:4}}>
                          <span style={{fontWeight:700,fontSize:11,color:T.text}}>@{ru.username}</span>
                          <span style={{color:T.text3,fontSize:10}}>{timeAgo(r.createdAt)}</span>
                        </div>
                        <div style={{fontSize:12,color:T.text2,lineHeight:1.65}}>{r.content}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Share modal */}
      {shareTarget&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setShareTarget(null);}}>
          <div className="sheet slideUp" style={{padding:22}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
              <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>share ping</span>
              <button className="iBtn" onClick={()=>setShareTarget(null)}><I.Close/></button>
            </div>
            <div style={{background:T.bg3,borderRadius:8,padding:"12px 14px",marginBottom:18,fontSize:12,color:T.text2,lineHeight:1.65}}>
              "{shareTarget.content}"
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <button onClick={()=>{copyLink(`https://ping.app/p/${shareTarget.id}`);setShareTarget(null);}}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:T.bg3,border:`1px solid ${T.border2}`,borderRadius:6,cursor:"pointer",fontFamily:"'Space Mono',monospace",color:T.text,fontSize:11,textAlign:"left"}}>
                <I.Link/><span>copy link to ping</span>
              </button>
              <button onClick={()=>capturePostAsStory(shareTarget, getUser(shareTarget.userId), dark)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:"linear-gradient(135deg,#833ab4,#fd1d1d,#fcb045)",border:"none",borderRadius:6,cursor:"pointer",fontFamily:"'Space Mono',monospace",color:"#fff",fontSize:11,textAlign:"left"}}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>
                <span>share to instagram story</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR modal */}
      {qrTarget&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setQrTarget(null);}}>
          <div className="sheet slideUp" style={{padding:24}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
              <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>ping identity</span>
              <button className="iBtn" onClick={()=>setQrTarget(null)}><I.Close/></button>
            </div>
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:20,padding:"8px 0 16px"}}>
              <Av name={qrTarget.username} color={qrTarget.avatar} size={64}/>
              <div style={{textAlign:"center"}}>
                <div style={{fontWeight:700,fontSize:18,color:T.text,letterSpacing:"-0.02em"}}>@{qrTarget.username}</div>
                {qrTarget.bio&&<div style={{color:T.text3,fontSize:11,marginTop:4,maxWidth:220,lineHeight:1.5}}>{qrTarget.bio}</div>}
              </div>
              <div style={{background:T.text,borderRadius:8,padding:12}}>
                <QRPlaceholder value={`https://ping.app/@${qrTarget.username}`} size={148}/>
              </div>
              <div style={{fontSize:10,color:T.text3,letterSpacing:"0.06em",textAlign:"center"}}>
                ping.app/@{qrTarget.username}
              </div>
              <div style={{display:"flex",gap:10,width:"100%"}}>
                <button onClick={()=>copyLink(`https://ping.app/@${qrTarget.username}`)}
                  style={{flex:1,padding:"10px 0",background:T.bg3,border:`1px solid ${T.border2}`,borderRadius:4,cursor:"pointer",fontFamily:"'Space Mono',monospace",fontSize:10,color:T.text,letterSpacing:"0.06em",textTransform:"uppercase",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <I.Link/> copy link
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Follow list */}
      {followListInfo&&(
        <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)setFollowListInfo(null);}}>
          <div className="sheet slideUp" style={{maxHeight:"68vh"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 18px",borderBottom:`1px solid ${T.border}`}}>
              <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>{followListInfo.type}</span>
              <button className="iBtn" onClick={()=>setFollowListInfo(null)}><I.Close/></button>
            </div>
            {(()=>{
              const u=getUser(followListInfo.userId); if(!u) return null;
              const list=followListInfo.type==="followers"?users.filter(x=>u.followers.includes(x.id)):users.filter(x=>u.following.includes(x.id));
              return list.length===0
                ?<div style={{padding:"32px",color:T.text3,fontSize:12,textAlign:"center"}}>nobody yet</div>
                :list.map(x=>(
                  <URow key={x.id} user={x} me={me} following={me.following.includes(x.id)} T={T}
                    onFollow={()=>toggleFollow(x.id)}
                    onProfile={()=>{setFollowListInfo(null);openProfile(x.id);}}
                    onMsg={()=>{setFollowListInfo(null);openDM(x.id);}}/>
                ));
            })()}
          </div>
        </div>
      )}

      {/* Edit profile */}
      {editOpen&&<EditModal user={me} T={T} dark={dark} onSave={saveProfile} onClose={()=>setEditOpen(false)} onToggleDark={()=>setDark(d=>!d)} onQR={()=>{setEditOpen(false);setQrTarget(me);}}/>}
    </div>
  );
}

// ─── ActionBar ────────────────────────────────────────────────────────────────
function ActionBar({post, me, T, onLike, onRepost, onBookmark, onReply, onShare, onExpand}) {
  const liked=post.likes.includes(me?.id), reposted=post.reposts.includes(me?.id), bookmarked=post.bookmarks.includes(me?.id);
  const items = [
    { icon:<I.Heart f={liked}/>, count:post.likes.length, color:liked?"#F75F4F":T.text3, activeColor:"#F75F4F", hoverBg:"rgba(247,95,79,0.08)", onClick:onLike },
    { icon:<I.Comment/>, count:post.replies||0, color:T.text3, activeColor:"#4F8EF7", hoverBg:"rgba(79,142,247,0.08)", onClick:onReply||onExpand },
    { icon:<I.Repost a={reposted}/>, count:post.reposts.length, color:reposted?"#4FF7A0":T.text3, activeColor:"#4FF7A0", hoverBg:"rgba(79,247,160,0.08)", onClick:onRepost },
    { icon:<I.Share/>, count:post.shares||0, color:T.text3, activeColor:"#F7C84F", hoverBg:"rgba(247,200,79,0.08)", onClick:onShare },
    { icon:<I.Bookmark f={bookmarked}/>, count:post.bookmarks.length, color:bookmarked?"#F7C84F":T.text3, activeColor:"#F7C84F", hoverBg:"rgba(247,200,79,0.08)", onClick:onBookmark },
  ];
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:2}}>
      {items.map((item,i)=>(
        <button key={i} onClick={item.onClick}
          style={{background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4,padding:"4px 2px",borderRadius:4,color:item.color,transition:"color 0.15s,background 0.15s",fontFamily:"'Space Mono',monospace"}}
          onMouseEnter={e=>{e.currentTarget.style.background=item.hoverBg;e.currentTarget.style.color=item.activeColor;}}
          onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=item.color;}}>
          {item.icon}
          {item.count > 0 && <LiveCount base={item.count} live={i===0} color={item.color}/>}
        </button>
      ))}
      <div style={{display:"flex",alignItems:"center",gap:3,color:T.text3,opacity:0.5}}>
        <I.Eye/><LiveCount base={post.views} live={true} color={T.text3}/>
      </div>
    </div>
  );
}

// ─── PostCard ─────────────────────────────────────────────────────────────────
function PostCard({post,author,me,allReplies,getUser,isNew,T,onLike,onRepost,onBookmark,onReply,onShare,onProfile,onFollow,onExpand}) {
  const myId = me?.id;
  const following = me?.following?.includes(author.id);
  const gated = author.isPrivate && author.id!==myId && !me?.following?.includes(author.id);
  const repCount = allReplies.length;
  const previewReply = allReplies[allReplies.length-1];

  if(!author) return null;

  return (
    <div className={`card${isNew?" newPing":""}`}>
      <div style={{display:"flex",gap:11}}>
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,flexShrink:0}}>
          <button style={{background:"none",border:"none",cursor:"pointer",padding:0}} onClick={()=>onProfile(author.id)}>
            <Av name={author.username} color={author.avatar} size={36}/>
          </button>
          {me&&author.id!==myId&&(
            <button title={following?"following":"follow"} onClick={()=>onFollow(author.id)}
              style={{background:"none",border:"none",cursor:"pointer",padding:"2px",color:following?"#4FF7A0":T.muted,fontSize:following?11:16,lineHeight:1,transition:"color 0.15s",display:"flex",alignItems:"center"}}>
              {following?<I.Check/>:<span>+</span>}
            </button>
          )}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:5,flexWrap:"wrap"}}>
            <button className="uBtn" onClick={()=>onProfile(author.id)}>@{author.username}</button>
            <span style={{color:T.text3,fontSize:10,marginLeft:"auto"}}>{timeAgo(post.createdAt)}</span>
          </div>
          {gated
            ?<div style={{color:T.text3,fontSize:12,fontStyle:"italic"}}>private account</div>
            :<div style={{fontSize:13,lineHeight:1.72,color:T.text2,wordBreak:"break-word"}}>{post.content}</div>
          }
          {!gated&&(
            <>
              <div style={{marginTop:11}}>
                <ActionBar post={{...post,replies:repCount}} me={me} T={T}
                  onLike={()=>onLike(post.id)} onRepost={()=>onRepost(post.id)}
                  onBookmark={()=>onBookmark(post.id)} onReply={()=>onReply(post.id)}
                  onShare={()=>onShare(post.id)} onExpand={()=>onExpand(post.id)}
                />
              </div>
              {repCount>0&&previewReply&&(()=>{
                const ru=getUser(previewReply.userId);
                if(!ru) return null;
                return(
                  <button onClick={()=>onExpand(post.id)}
                    style={{display:"flex",gap:8,marginTop:10,padding:"8px 10px",background:T.bg3,borderRadius:6,border:"none",cursor:"pointer",textAlign:"left",width:"100%",alignItems:"flex-start",transition:"background 0.12s"}}
                    onMouseEnter={e=>e.currentTarget.style.background=T.cardHover}
                    onMouseLeave={e=>e.currentTarget.style.background=T.bg3}>
                    <Av name={ru.username} color={ru.avatar} size={20}/>
                    <div style={{flex:1,minWidth:0}}>
                      <span style={{fontSize:10,fontWeight:700,color:T.text2}}>@{ru.username} </span>
                      <span style={{fontSize:11,color:T.text3,lineHeight:1.5}}>{previewReply.content.slice(0,60)}{previewReply.content.length>60?"…":""}</span>
                    </div>
                    {repCount>1&&<span style={{fontSize:9,color:T.text3,flexShrink:0,letterSpacing:"0.04em"}}>+{repCount-1} more</span>}
                  </button>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ProfileView ──────────────────────────────────────────────────────────────
function ProfileView({user,me,myId,posts,replies,getUser,T,onLike,onRepost,onBookmark,onReply,onFollow,onProfile,onMsg,postPing,onShare,onFollowList,onQR}) {
  const [pTab,setPTab] = useState("posts");
  const [composeText,setComposeText] = useState("");
  const isMe = user.id===myId, isFollowing = me.following.includes(user.id);

  const myPosts   = posts.filter(p=>p.userId===user.id).sort((a,b)=>b.createdAt-a.createdAt);
  const myReplies = replies.filter(r=>r.userId===user.id).sort((a,b)=>b.createdAt-a.createdAt);
  const myReposts = posts.filter(p=>p.reposts.includes(user.id)).sort((a,b)=>b.createdAt-a.createdAt);
  const myLikes   = posts.filter(p=>p.likes.includes(user.id)).sort((a,b)=>b.createdAt-a.createdAt);
  const mySaved   = posts.filter(p=>p.bookmarks.includes(user.id)).sort((a,b)=>b.createdAt-a.createdAt);
  const dataMap   = {posts:myPosts,replies:myReplies,reposts:myReposts,likes:myLikes,saved:mySaved};

  function submitProfilePing() {
    if(!composeText.trim()||composeText.length>99) return;
    postPing(composeText); setComposeText("");
  }

  return (
    <div>
      <div style={{padding:"18px 15px 14px",borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <Av name={user.username} color={user.avatar} size={54}/>
            <div>
              <div style={{fontWeight:700,fontSize:15,color:T.text,letterSpacing:"-0.02em"}}>@{user.username}</div>
              {user.bio&&<div style={{fontSize:11,color:T.text3,lineHeight:1.5,marginTop:2,maxWidth:200}}>{user.bio}</div>}
            </div>
          </div>
          <div style={{display:"flex",gap:7,flexShrink:0}}>
            {isMe&&<button className="iBtn" style={{color:T.text2}} onClick={onQR}><I.QR/></button>}
            {!isMe&&(
              <>
                <button style={{background:"none",border:`1px solid ${T.border2}`,color:T.text2,fontFamily:"'Space Mono',monospace",fontSize:9,letterSpacing:"0.08em",padding:"5px 11px",cursor:"pointer",transition:"all 0.15s",textTransform:"uppercase"}}
                  onMouseEnter={e=>{e.target.style.borderColor=T.text;e.target.style.color=T.text;}} onMouseLeave={e=>{e.target.style.borderColor=T.border2;e.target.style.color=T.text2;}}
                  onClick={()=>onMsg(user.id)}>msg</button>
                <button className={`fBtn ${isFollowing?"on":""}`} onClick={()=>onFollow(user.id)}>
                  {isFollowing?<><I.Check/> following</>:<>+ follow</>}
                </button>
              </>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:18}}>
          {[{l:"pings",v:myPosts.length,fn:null},{l:"followers",v:user.followers.length,fn:()=>onFollowList("followers")},{l:"following",v:user.following.length,fn:()=>onFollowList("following")}].map(s=>(
            <button key={s.l} onClick={s.fn||undefined} style={{background:"none",border:"none",cursor:s.fn?"pointer":"default",padding:0,fontFamily:"'Space Mono',monospace",textAlign:"left"}}>
              <span style={{color:T.text,fontWeight:700,fontSize:14}}>{s.v}</span>
              <span style={{color:T.text3,fontSize:9,marginLeft:5,letterSpacing:"0.08em"}}>{s.l}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={{display:"flex",borderBottom:`1px solid ${T.border}`,position:"sticky",top:50,zIndex:70,background:`${T.bg}f8`,backdropFilter:"blur(12px)"}}>
        {["posts","replies","reposts","likes","saved"].map(t=>(
          <button key={t} className={`tPill ${pTab===t?"on":""}`} onClick={()=>setPTab(t)}>{t}</button>
        ))}
      </div>

      {isMe&&pTab==="posts"&&(
        <div style={{padding:"12px 15px",borderBottom:`1px solid ${T.border}`,display:"flex",gap:10}}>
          <Av name={me.username} color={me.avatar} size={32}/>
          <div style={{flex:1}}>
            <textarea style={{width:"100%",fontSize:12,lineHeight:1.7,minHeight:36,color:T.text}} placeholder="What's happening?" value={composeText} maxLength={99}
              onChange={e=>setComposeText(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter"&&(e.metaKey||e.ctrlKey))submitProfilePing();}}/>
            {composeText.length>0&&(
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                <CC n={composeText.length} max={99} T={T}/>
                <button className="btnMain" style={{fontSize:9,padding:"5px 12px"}} onClick={submitProfilePing} disabled={!composeText.trim()||composeText.length>99}>ping</button>
              </div>
            )}
          </div>
        </div>
      )}

      {dataMap[pTab].length===0
        ?<div style={{padding:"44px 20px",color:T.text3,fontSize:12,textAlign:"center"}}>nothing here yet</div>
        :pTab==="replies"
          ?myReplies.map(r=>{
            const post=posts.find(p=>p.id===r.postId), pa=post?getUser(post.userId):null;
            return(
              <div key={r.id} style={{borderBottom:`1px solid ${T.border}`,padding:"12px 15px"}}>
                {post&&pa&&<div style={{display:"flex",gap:8,marginBottom:8,opacity:0.38}}>
                  <Av name={pa.username} color={pa.avatar} size={18}/>
                  <div style={{fontSize:10,color:T.text3,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>@{pa.username}: {post.content}</div>
                </div>}
                <div style={{display:"flex",gap:9}}>
                  <Av name={user.username} color={user.avatar} size={26}/>
                  <div>
                    <div style={{fontSize:10,fontWeight:700,color:T.text2,marginBottom:3}}>@{user.username} <span style={{color:T.text3,fontWeight:400}}>{timeAgo(r.createdAt)}</span></div>
                    <div style={{fontSize:12,color:T.text2,lineHeight:1.65}}>{r.content}</div>
                  </div>
                </div>
              </div>
            );
          })
          :dataMap[pTab].map(p=>(
            <PostCard key={p.id} post={p} author={getUser(p.userId)} me={me}
              allReplies={replies.filter(r=>r.postId===p.id)}
              getUser={getUser} T={T}
              onLike={()=>onLike(p.id)} onRepost={()=>onRepost(p.id)}
              onBookmark={()=>onBookmark(p.id)} onReply={()=>onReply(p.id)}
              onShare={()=>onShare(p.id)}
              onProfile={onProfile} onFollow={onFollow}
              onExpand={()=>{}}
            />
          ))
      }
    </div>
  );
}

// ─── UserRow ──────────────────────────────────────────────────────────────────
function URow({user,me,following,onFollow,onProfile,onMsg,T}) {
  return(
    <div style={{display:"flex",alignItems:"center",gap:11,padding:"11px 15px",borderBottom:`1px solid ${T.border}`,transition:"background 0.1s",cursor:"pointer"}}
      onMouseEnter={e=>e.currentTarget.style.background=T.cardHover} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
      <button style={{background:"none",border:"none",cursor:"pointer",padding:0}} onClick={onProfile}>
        <Av name={user.username} color={user.avatar} size={36}/>
      </button>
      <div style={{flex:1,minWidth:0}}>
        <button className="uBtn" onClick={onProfile}>@{user.username}</button>
        {user.bio&&<div style={{color:T.text3,fontSize:10,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user.bio}</div>}
      </div>
      <div style={{display:"flex",gap:6}}>
        {onMsg&&<button className="iBtn" style={{color:T.text3}} onClick={onMsg}><I.Mail/></button>}
        {me&&user.id!==me.id&&<button className={`fBtn ${following?"on":""}`} onClick={onFollow}>{following?<><I.Check/> following</>:<>+ follow</>}</button>}
      </div>
    </div>
  );
}

// ─── Edit Profile Modal ───────────────────────────────────────────────────────
function EditModal({user,T,dark,onSave,onClose,onToggleDark,onQR}) {
  const [f,setF]=useState({username:user.username,bio:user.bio||"",isPrivate:user.isPrivate});
  return(
    <div className="overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div className="sheet slideUp" style={{padding:22}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <span style={{fontSize:10,color:T.text3,letterSpacing:"0.1em",textTransform:"uppercase"}}>settings</span>
          <button className="iBtn" onClick={onClose}><I.Close/></button>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div>
            <div style={{color:T.text3,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:10}}>username</div>
            <input className="iLine" style={{fontSize:13}} value={f.username} onChange={e=>setF(x=>({...x,username:e.target.value.toLowerCase().replace(/[^a-z0-9_]/g,"")}))}/>
          </div>
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{color:T.text3,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase"}}>bio</div>
              <CC n={f.bio.length} max={80} T={T}/>
            </div>
            <textarea className="iLine" style={{fontSize:12,lineHeight:1.65}} rows={2} maxLength={80} value={f.bio} onChange={e=>setF(x=>({...x,bio:e.target.value.slice(0,80)}))}/>
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16}}>
            <div style={{color:T.text3,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>appearance</div>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                {dark?<I.Moon/>:<I.Sun/>}
                <div>
                  <div style={{fontSize:12,color:T.text}}>{dark?"dark mode":"light mode"}</div>
                  <div style={{fontSize:10,color:T.text3,marginTop:1}}>toggle interface theme</div>
                </div>
              </div>
              <button onClick={onToggleDark}
                style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:dark?"#e2e2e2":"#1e1e1e",transition:"background 0.2s",position:"relative",flexShrink:0}}>
                <div style={{width:18,height:18,borderRadius:"50%",background:dark?"#080808":"#e2e2e2",position:"absolute",top:3,left:dark?23:3,transition:"left 0.2s"}}/>
              </button>
            </div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:12,color:T.text,marginBottom:2}}>private account</div>
              <div style={{fontSize:10,color:T.text3}}>only followers see your pings</div>
            </div>
            <button onClick={()=>setF(x=>({...x,isPrivate:!x.isPrivate}))}
              style={{width:44,height:24,borderRadius:12,border:"none",cursor:"pointer",background:f.isPrivate?"#e2e2e2":"#1e1e1e",transition:"background 0.2s",position:"relative",flexShrink:0}}>
              <div style={{width:18,height:18,borderRadius:"50%",background:f.isPrivate?"#080808":"#e2e2e2",position:"absolute",top:3,left:f.isPrivate?23:3,transition:"left 0.2s"}}/>
            </button>
          </div>
          <div style={{borderTop:`1px solid ${T.border}`,paddingTop:16}}>
            <div style={{color:T.text3,fontSize:9,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12}}>ping identity</div>
            <button onClick={()=>{onClose();onQR();}}
              style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:T.bg3,border:`1px solid ${T.border2}`,borderRadius:6,cursor:"pointer",fontFamily:"'Space Mono',monospace",color:T.text,fontSize:11,width:"100%"}}>
              <I.QR/><span>view my ping ID & QR code</span>
            </button>
          </div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:12,paddingTop:4}}>
            <button style={{background:"none",border:"none",color:T.text3,fontFamily:"'Space Mono',monospace",fontSize:10,cursor:"pointer"}} onClick={onClose}>cancel</button>
            <button className="btnMain" onClick={()=>onSave(f)}>save</button>
          </div>
        </div>
      </div>
    </div>
  );
}