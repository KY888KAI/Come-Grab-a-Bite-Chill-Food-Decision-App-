import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";

const LS_KEY = "whatnow_energy_log_v2";
const LS_SWIPE_COUNT_KEY = "whatnow_swipe_tease_count";
const BACKEND_API_URL = "/api/places";
const BACKEND_GEMINI_URL = "/api/gemini";

const warm = {
  bg: "#FAF9F6", text: "#595048", sub: "#9C968F", orange: "#FF9F5E", yellow: "#FFD97F",
  border: "1px solid rgba(255, 138, 61, 0.5)", borderSubtle: "1px solid rgba(255, 138, 61, 0.18)",
  borderAction: "1px solid rgba(255, 138, 61, 0.35)", shadow: "0 4px 12px -2px rgba(255, 159, 94, 0.1)",
  shadowActive: "0 6px 20px -4px rgba(255, 138, 61, 0.2)", highlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6)", deleteRed: "#FF6B6B",
} as const;

type Temp = "light" | "rich"; type Hunger = "full" | "snack"; type Speed = "fast" | "sit";
type Budget = "cheap" | "expensive"; type Style = "light" | "rich";
type Screen = "home" | "choose" | "recommend" | "energy" | "log";

interface Place {
  id: string; name: string; type?: Temp | null; style?: Style; hunger?: Hunger | null;
  speed?: Speed | null; price?: "budget" | "mid"; priceLevel?: string; queryKeyword?: string;
  distance: string; distanceVal?: number; lat?: number; lng?: number; googlePlaceId?: string;
  rating?: number; userRatingsTotal?: number; openNow?: boolean; types?: string[];
}

interface LogEntry {
  id: string; at: string; tags: string[]; choiceText: string; isCategory?: boolean; isPinned?: boolean;
  sig?: { warmth: number; mode: "satisfied" | "stable" | "chaos"; temp: Temp | null; hunger: Hunger | null; speed: Speed | null; richness: number; };
}

interface AiSuggestion { dish: string; reason: string; targetPlace?: Place; keyword?: string; }

const TRANSLATIONS = {
  zh: {
    appTitle: "來覓食", appSubtitle: "佛系覓食，點幾下就知道要吃什麼", startBtn: "開始覓食", randomBtn: "沒想法", randoming: "隨緣覓食中...",
    stepTitle: "做個輕鬆的選擇", light: "清淡點", rich: "重口味", full: "吃飽", snack: "解饞", cheap: "隨便吃吃", expensive: "犒賞自己",
    next: "下一步", finish: "完成", recommendTitle: "附近可以吃什麼", searching: "正在掃描附近美食...", expanding: "正在幫您看遠一點的地方...",
    fallbackMessage: "找不到 100% 符合的，這幾家也不錯：", notFound: "這裡暫時沒有合適的店，\n試試別的條件？", filtering: "正在為您精選最佳餐廳...",
    aiThinking: "AI 大廚正在思考...", aiRetry: "還是不滿意？再試一次", aiHelp: "都不滿意？交給 AI 大廚決定", aiTag: "AI 大廚精選",
    goNav: "出發去吃！ →", manualSearch: "還是沒看到想吃的？", manualSearchPrefix: "在地圖搜尋", saveTitle: "留下這次的食力",
    saveDesc: "剛剛的選擇已自動紀錄。\n祝你用餐愉快！", viewLog: "看我的食力", backHome: "回到首頁", logTitle: "我的食力",
    logSubtitle: "回顧每一次的美味選擇", emptyLog: "還沒有食力", emptyLogDesc: "這裡會記錄你所有的覓食歷程", lastEat: "上次吃",
    pinned: "釘選置頂", today: "今天", yesterday: "昨天", older: "更早之前", confirmDelete: "確定要刪除這筆紀錄嗎？",
    confirmPin: "確定要取消這筆紀錄的釘選嗎？", confirmClear: "確定要清空所有紀錄嗎？此動作無法復原。", actionPin: "釘選", actionDelete: "刪除",
    subtitles: { home: "Come Grab a Bite", choose: "做個輕鬆的選擇", recommend: "附近可以吃什麼", energy: "留下這次的食力", log: "我的食力" }
  },
  en: {
    appTitle: "Grab a Bite", appSubtitle: "Chill food decision in a few taps.", startBtn: "Start", randomBtn: "I'm feeling lucky", randoming: "Randomizing...",
    stepTitle: "Make a Choice", light: "Light", rich: "Rich", full: "Meal", snack: "Snack", cheap: "Budget", expensive: "Fancy",
    next: "Next", finish: "Done", recommendTitle: "What's Nearby", searching: "Scanning nearby spots...", expanding: "Looking a bit further...",
    fallbackMessage: "No perfect match, but these are good:", notFound: "No suitable places found here.\nTry different options?", filtering: "Picking the best spots for you...",
    aiThinking: "AI Chef is thinking...", aiRetry: "Not happy? Try again", aiHelp: "Not happy? Let AI Chef decide", aiTag: "AI Chef's Choice",
    goNav: "Let's Go! →", manualSearch: "Still not what you want?", manualSearchPrefix: "Search on Maps", saveTitle: "Choice Recorded",
    saveDesc: "Your choice has been saved.\nBon appétit!", viewLog: "View History", backHome: "Back Home", logTitle: "My History",
    logSubtitle: "Review your delicious choices", emptyLog: "No History Yet", emptyLogDesc: "Your food journey will appear here.", lastEat: "Last Ate",
    pinned: "Pinned", today: "Today", yesterday: "Yesterday", older: "Older", confirmDelete: "Delete this record?",
    confirmPin: "Unpin this record?", confirmClear: "Clear all history? This cannot be undone.", actionPin: "Pin", actionDelete: "Delete",
    subtitles: { home: "Come Grab a Bite", choose: "Easy Choice", recommend: "What's Nearby", energy: "Saved Choice", log: "My History" }
  }
};

const Icon = ({ size = 24, color = "currentColor", strokeWidth = 2, children, ...props }: any) => (<svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" {...props} stroke={color} strokeWidth={strokeWidth} style={{ minWidth: size, minHeight: size }}>{children}</svg>);
const LucideRotateCcw = (p: any) => <Icon {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></Icon>;
const LucideHistory = (p: any) => <Icon {...p}><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /><polyline points="12 6 12 12 16 14" /></Icon>;
// FIX: 使用標準 Sparkles 路徑解決破圖問題
const LucideSparkles = (p: any) => <Icon {...p}><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" /><path d="M20 3v4" /><path d="M24 1v2" /><path d="M1 14v2" /></Icon>;
const LucideTrash2 = (p: any) => <Icon {...p}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></Icon>;
const LucidePin = (p: any) => <Icon {...p}><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" /></Icon>;
const LucideHome = (p: any) => <Icon {...p}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Icon>;
const LucideX = (p: any) => <Icon {...p}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
const LucideChevronLeft = (p: any) => <Icon {...p}><path d="m15 18-6-6 6-6" /></Icon>;

const fetchGooglePlaces = async (lat: number, lng: number, query: string, radius: number) => {
  const res = await fetch(BACKEND_API_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lat, lng, query, language: navigator.language, radius })
  });
  if (!res.ok) throw new Error(await res.text());
  return await res.json() as Place[];
};

const fetchGeminiFilter = async (candidates: Place[], userTags: string[], logicTags: string[]) => {
  const res = await fetch(BACKEND_GEMINI_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "filter", candidates, userTags, logicTags, language: navigator.language })
  });
  const data = await res.json();
  const jsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  const parsed = JSON.parse(jsonText.replace(/```json/g, "").replace(/```/g, ""));
  return (parsed.ids || []) as number[];
};

// --- Utilities ---
function clamp(n: number, a: number, b: number) { return Math.min(b, Math.max(a, n)); }
function nowISO() { return new Date().toISOString(); }
function fmtDate(iso: string) {
  const d = new Date(iso), now = new Date();
  return d.toDateString() === now.toDateString()
    ? `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function deg2rad(deg: number) { return deg * (Math.PI / 180); }
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; const dLat = deg2rad(lat2 - lat1); const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function getGoogleMapsUrl(query: string, placeId?: string) {
  return placeId ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}&query_place_id=${placeId}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function navigateToMap(url: string) { (window.self !== window.top) ? window.open(url, "_blank") : window.location.href = url; }
function computeTags({ temp, hunger, budget }: any, t: any) {
  const tags: string[] = [];
  if (temp) tags.push(temp === "light" ? t.light : t.rich);
  if (hunger) tags.push(hunger === "full" ? t.full : t.snack);
  if (budget === "cheap") tags.push(t.cheap); if (budget === "expensive") tags.push(t.expensive);
  return { tags };
}
function groupLogsByDate(logs: LogEntry[], t: any) {
  const groups: { title: string; type: 'pinned' | 'date'; items: LogEntry[] }[] = [];
  const pinned: LogEntry[] = [], today: LogEntry[] = [], yesterday: LogEntry[] = [], older: LogEntry[] = [];
  const todayStr = new Date().toDateString();
  const yestStr = new Date(new Date().setDate(new Date().getDate() - 1)).toDateString();
  logs.forEach(log => {
    if (log.isPinned) { pinned.push(log); return; }
    const d = new Date(log.at).toDateString();
    if (d === todayStr) today.push(log); else if (d === yestStr) yesterday.push(log); else older.push(log);
  });
  if (pinned.length) groups.push({ title: t.pinned, type: 'pinned', items: pinned });
  if (today.length) groups.push({ title: t.today, type: 'date', items: today });
  if (yesterday.length) groups.push({ title: t.yesterday, type: 'date', items: yesterday });
  if (older.length) groups.push({ title: t.older, type: 'date', items: older });
  return groups;
}

function useLanguage() { return navigator.language.toLowerCase().startsWith("zh") ? TRANSLATIONS.zh : TRANSLATIONS.en; }
function useLocalStorageLog() {
  const [log, setLog] = useState<LogEntry[]>(() => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(LS_KEY, JSON.stringify(log)); } catch { } }, [log]);
  return { log, setLog } as const;
}

// FIX: 調整 Tag 預設樣式，使用 flex-shrink-0 確保不被擠壓，但我們會在外面調整 gap
const Tag = ({ children, compact }: { children: React.ReactNode, compact?: boolean }) => (
  // FIX: 新增 compact 模式 (用於列表)，減少 padding 和字體大小，確保單行塞得下
  <span className={`inline-flex items-center rounded-full font-medium tracking-wide whitespace-nowrap ${compact ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-1 text-[13px]'}`} style={{ background: "rgba(255, 211, 106, 0.15)", color: "#6B5D52" }}>{children}</span>
);

const ProgressBar = ({ progress }: { progress: number }) => (
  <div className="w-full max-w-[120px] h-1 bg-orange-100 rounded-full overflow-hidden mt-3"><motion.div className="h-full bg-orange-400" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5, ease: "easeInOut" }} /></div>
);
const PillButton = ({ active, children, onClick }: any) => (
  <button onClick={onClick} className="w-full rounded-2xl px-4 py-4 text-left transition-all duration-300 relative overflow-hidden group" style={{ border: active ? warm.border : warm.borderSubtle, background: active ? "#FFF8F3" : "rgba(255, 255, 255, 0.65)", boxShadow: active ? `inset 0 1px 3px rgba(255,138,61,0.06), 0 2px 8px rgba(255,138,61,0.08)` : "0 2px 6px rgba(255, 138, 61, 0.05)" }}>
    <div className="relative z-10 text-base flex items-center justify-center gap-2" style={{ color: active ? warm.orange : warm.text, fontWeight: active ? 600 : 500, letterSpacing: "0.03em" }}>{children}</div>
  </button>
);
const PrimaryButton = ({ children, onClick, disabled, subtle, onLongPress, longPressMs = 650 }: any) => {
  const tRef = useRef<number | null>(null), longPressedRef = useRef(false);
  const clear = () => { if (tRef.current) { clearTimeout(tRef.current); tRef.current = null; } };
  const down = () => { if (!onLongPress) return; longPressedRef.current = false; clear(); tRef.current = window.setTimeout(() => { longPressedRef.current = true; onLongPress(); clear(); }, longPressMs); };
  return (
    <button onClick={() => { if (!disabled && (!onLongPress || !longPressedRef.current)) onClick?.(); }} disabled={disabled} onMouseDown={down} onMouseUp={clear} onMouseLeave={clear} onTouchStart={down} onTouchEnd={clear} className="w-full rounded-2xl px-4 py-4 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:grayscale relative overflow-hidden" style={{ fontWeight: 600, letterSpacing: "0.05em", textAlign: "center", ...(subtle ? { background: "rgba(255, 255, 255, 0.7)", color: warm.text, border: warm.borderSubtle, boxShadow: "0 2px 12px rgba(255, 138, 61, 0.08)" } : { background: `linear-gradient(180deg, #FFB17A 0%, ${warm.orange} 100%)`, color: "#FFF", border: "1px solid rgba(255, 138, 61, 0.1)", boxShadow: `inset 0 1px 1px rgba(255,255,255,0.5), ${warm.shadowActive}`, textShadow: "0 1px 2px rgba(169, 88, 32, 0.2)" }) }}>
      <div className="relative z-10">{children}</div>{!subtle && <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />}
    </button>
  );
};
function TopBar({ screen, isRandomMode, onBack, onGoHome, onOpenLog, hasLog, title }: any) {
  const btnStyle = { background: "rgba(255, 255, 255, 0.4)", borderColor: "rgba(255, 138, 61, 0.35)", borderWidth: "1px", borderStyle: "solid", color: "#FF9F5E" };
  const Btn = ({ onClick, icon }: any) => (<button onClick={onClick} className="flex items-center justify-center w-10 h-10 rounded-xl backdrop-blur-md shadow-sm active:scale-95 transition-all" style={btnStyle}>{icon}</button>);
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-6 pb-4 relative z-50">
      <div className="w-10">{(screen === 'choose' || (screen === 'recommend' && !isRandomMode) || screen === 'log') && <Btn onClick={onBack} icon={<LucideChevronLeft size={24} />} />}{(screen === 'energy' || (screen === 'recommend' && isRandomMode)) && <Btn onClick={onGoHome} icon={<LucideHome size={20} />} />}</div>
      <div className="text-sm font-bold" style={{ color: warm.sub, letterSpacing: "0.05em" }}>{title}</div>
      <div className="w-10 flex justify-end">{(screen === 'home' && hasLog) && <Btn onClick={onOpenLog} icon={<LucideHistory size={20} strokeWidth={1.75} />} />}{(screen === 'choose' || (screen === 'recommend' && !isRandomMode)) && <Btn onClick={onGoHome} icon={<LucideX size={22} />} />}</div>
    </div>
  );
}
function ProgressDots({ step, total, onStepClick }: any) {
  return (<div className="flex items-center justify-center gap-2 mt-4">{Array.from({ length: total }).map((_, i) => (<div key={i} onClick={() => { if (i <= step) onStepClick(i); }} className={`h-2 w-2 rounded-full transition-all duration-200 ${i <= step ? 'cursor-pointer' : ''}`} style={{ background: i === step ? warm.orange : "rgba(255, 138, 61, 0.15)", transform: i === step ? "scale(1.25)" : "scale(1)" }} />))}</div>);
}

function SwipeableLogItem({ item, onReEat, onPin, onDelete, tease, onTeaseComplete, t }: any) {
  const x = useMotionValue(0);
  const background = useTransform(x, [-100, 0, 100], [warm.deleteRed, "rgba(255,255,255,0)", warm.orange]);
  const [isDragging, setIsDragging] = useState(false);
  useEffect(() => { if (tease) { const c = animate(x, [0, -60, -60, 0, 60, 60, 0], { duration: 2.2, ease: "easeInOut", delay: 0.8, times: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1], onComplete: onTeaseComplete }); return () => c.stop(); } }, [tease, x, onTeaseComplete]);
  return (
    <div className="relative mb-3 group">
      <motion.div className="absolute inset-0 rounded-3xl flex items-center justify-between px-6" style={{ background }}>
        <div className="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: 1 }}><LucidePin size={20} /><span className="font-bold text-sm">{t.actionPin}</span></div>
        <div className="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: 1 }}><span className="font-bold text-sm">{t.actionDelete}</span><LucideTrash2 size={20} /></div>
      </motion.div>
      <motion.div className="relative w-full bg-white rounded-3xl p-3.5 text-left flex items-center gap-4 cursor-grab active:cursor-grabbing" style={{ x, border: warm.borderSubtle, background: "#FFFFFF", boxShadow: warm.shadow }} drag="x" dragConstraints={{ left: 0, right: 0 }} dragElastic={0.7} onDragStart={() => setIsDragging(true)} onDragEnd={(_, { offset }) => { setIsDragging(false); if (offset.x < -60) onDelete(); else if (offset.x > 60) onPin(); }} onClick={() => !isDragging && onReEat()}>
        <div className="shrink-0 flex items-center justify-center" style={{ width: 88, height: 88 }}>
          <EnergyCore mode={item.sig?.mode ?? "satisfied"} temp={item.sig?.temp} richness={item.sig?.richness ?? 0.5} size={88} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center h-full py-1 overflow-hidden">
          <div className="flex justify-between items-center mb-1"><div className="text-xs font-medium tracking-wide" style={{ color: warm.sub }}>{fmtDate(item.at)}</div>{item.isPinned && <LucidePin size={14} color={warm.orange} />}</div>
          <div className="text-lg font-bold mb-2 leading-tight whitespace-normal break-words" style={{ color: warm.text, letterSpacing: "0.01em" }}>{(item.choiceText || "").replace("搜尋：", "")}</div>
          {/* FIX: 恢復 flex-nowrap，但減少 gap 並使用 compact Tag 確保不被卡掉 */}
          <div className="flex flex-nowrap items-center gap-1 w-full mt-1 overflow-hidden">
            {item.tags?.slice(0, 3).map((t: string) => (<div key={t} className="shrink-0"><Tag compact>{t}</Tag></div>))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function EnergyCore({ mode = "stable", temp = null, richness = 0.5, size = 220 }: any) {
  const glow = mode === "chaos" ? 0.25 : mode === "stable" ? 0.45 : 0.75;
  const blurBase = mode === "chaos" ? 26 : mode === "stable" ? 34 : 42;
  const palette = useMemo(() => {
    if (temp === "rich") return { a: "rgba(255, 107, 74, ", b: "rgba(255, 194, 76, ", glowColor: "rgba(255, 100, 60," };
    if (temp === "light") return { a: "rgba(255, 160, 130, ", b: "rgba(240, 248, 255, ", glowColor: "rgba(255, 180, 160," };
    return { a: "rgba(255, 138, 61, ", b: "rgba(255, 211, 106, ", glowColor: "rgba(255, 138, 61," };
  }, [temp]);
  const coreOpacity = temp === null ? 0.65 : 0.55 + richness * 0.35;
  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, ${palette.b}${0.22 + 0.25 * glow}) 0%, ${palette.glowColor}${(temp === null ? 0.2 : 0.1 + richness * 0.15) + 0.1 * glow}) 40%, rgba(0,0,0,0) 70%)`, filter: `blur(${temp === null ? blurBase : blurBase + (1 - richness) * 15}px)`, transform: "scale(1.05)", opacity: 0.9 }} />
        <motion.div key="core" className="absolute inset-6" animate={mode === "chaos" ? { scale: [1, 1.06, 0.98, 1.04, 1], rotate: [0, -1.2, 0.6, -0.8, 0] } : mode === "stable" ? { scale: [1, 1.035, 1], rotate: [0, 0.2, 0] } : { scale: [1, 1.05, 1], rotate: [0, 0, 0] }} transition={{ duration: mode === "chaos" ? 1.4 : mode === "stable" ? 2.6 : 3.2, repeat: Infinity, ease: "easeInOut" }} style={{ borderRadius: '42%', background: `radial-gradient(circle at 30% 30%, ${palette.b}0.7) 0%, ${palette.a}${coreOpacity}) 45%, rgba(255,255,255,0.12) 72%, rgba(255,255,255,0) 100%)`, boxShadow: `0 30px 80px ${palette.glowColor}${0.1 + 0.18 * glow}), inset 0 0 40px rgba(255,255,255,0.22)`, transform: `translate(${mode === "chaos" ? 6 : 0}px, ${mode === "chaos" ? -6 : 0}px)` }} />
        <motion.div key="mist" className="absolute inset-10" animate={mode === "chaos" ? { opacity: [0.25, 0.6, 0.35, 0.7, 0.25], x: [0, 2, -2, 1, 0], y: [0, -1, 2, -2, 0] } : { opacity: [0.35, 0.55, 0.35] }} transition={{ duration: mode === "chaos" ? 1.2 : 2.8, repeat: Infinity, ease: "easeInOut" }} style={{ borderRadius: '48%', background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.55) 0%, ${palette.b}${0.16 + 0.2 * (temp === null ? 0.5 : richness)}) 35%, ${palette.a}0.10) 70%, rgba(0,0,0,0) 100%)`, filter: "blur(10px)" }} />
        <motion.div className="absolute inset-2 rounded-full" animate={mode === "satisfied" ? { opacity: [0.2, 0.55, 0.2] } : { opacity: 0 }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} style={{ boxShadow: mode === "satisfied" ? `0 0 60px ${palette.b}0.35)` : "none" }} />
      </div>
    </div>
  );
}

export default function App() {
  const t = useLanguage();
  const { log, setLog } = useLocalStorageLog();
  const [screen, setScreen] = useState<Screen>("home");
  const [chooseStep, setChooseStep] = useState(0);
  const totalChooseSteps = 3;
  const [temp, setTemp] = useState<Temp | null>(null);
  const [hunger, setHunger] = useState<Hunger | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null);
  const [richness, setRichness] = useState(0.5);
  const [speed, setSpeed] = useState<Speed | null>(null);
  const [pressing, setPressing] = useState(false);
  const [isRandomizing, setIsRandomizing] = useState(false);
  const [isRandomMode, setIsRandomMode] = useState(false);
  const MAX_TEASE_COUNT = 3;
  const [swipeTeaseCount, setSwipeTeaseCount] = useState(() => { try { return parseInt(localStorage.getItem(LS_SWIPE_COUNT_KEY) || "0", 10); } catch { return 0; } });
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [realPlaces, setRealPlaces] = useState<Place[]>([]);
  const [userLocation, setUserLocation] = useState<{ lat: number, lng: number } | null>(null);
  const [isRealLoading, setIsRealLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState(1000);
  const [searchProgress, setSearchProgress] = useState(0);
  const progressInterval = useRef<number | null>(null);

  const { tags } = useMemo(() => computeTags({ temp, hunger, budget }, t), [temp, hunger, budget, t]);
  const groupedLogs = useMemo(() => groupLogsByDate(log, t), [log, t]);
  const visiblePlaces = useMemo(() => realPlaces.slice(0, 3), [realPlaces]);
  const backendMapsQuery = useMemo(() => (hunger === "snack" && budget === "expensive") ? "bistro cafe bar dessert_shop" : (hunger === "full" ? "restaurant" : (hunger === "snack" ? "snack street_food" : "food")), [hunger, budget]);
  const manualSearchQuery = useMemo(() => budget === "expensive" ? "找間精緻好料" : (budget === "cheap" && hunger === "snack" ? "尋覓解饞小吃" : (hunger === "full" ? "找間好餐廳" : "探索附近美食")), [hunger, budget]);

  useEffect(() => { navigator.geolocation?.getCurrentPosition(p => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }), e => console.warn(e)); }, []);
  
  const startProgress = (start: number, end: number, ms: number) => {
    if (progressInterval.current) clearInterval(progressInterval.current);
    setSearchProgress(start);
    let current = start; const step = (end - start) / (ms / 100);
    progressInterval.current = window.setInterval(() => { current += step; if (current >= end) { current = end; clearInterval(progressInterval.current!); } setSearchProgress(current); }, 100);
  };
  const stopProgress = () => { if (progressInterval.current) clearInterval(progressInterval.current); };

  const handleSearch = async (radius: number, retry = 0) => {
    if (!userLocation) return;
    setIsRealLoading(true); setApiError(null); setSearchRadius(radius);
    startProgress(retry === 0 ? 10 : 40, retry === 0 ? 40 : 60, retry === 0 ? 3000 : 4000);

    const currentStyle: Style = budget === "expensive" ? "rich" : "light";

    try {
      const rawPlaces = await fetchGooglePlaces(userLocation.lat, userLocation.lng, backendMapsQuery, radius);
      if (rawPlaces.length === 0) {
        stopProgress();
        if (radius < 5000) return handleSearch(radius * 2, retry + 1);
        setRealPlaces([]); setApiError(t.notFound); setSearchProgress(100); setIsRealLoading(false); return;
      }

      stopProgress(); setSearchProgress(70); startProgress(70, 90, 2000);
      const logicTags = []; if (temp === 'light') logicTags.push("LIGHT"); if (temp === 'rich') logicTags.push("RICH"); if (budget === 'cheap') logicTags.push("CHEAP"); if (budget === 'expensive') logicTags.push("EXPENSIVE"); if (hunger === 'full') logicTags.push("FULL"); if (hunger === 'snack') logicTags.push("SNACK");
      
      const finalIndices = await fetchGeminiFilter(rawPlaces, tags, logicTags);
      const selected: Place[] = [], others: Place[] = [];
      const allWithDist = rawPlaces.map(p => {
         const d = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, p.lat || 0, p.lng || 0);
         return { ...p, distance: d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`, distanceVal: d, type: temp, style: currentStyle, hunger, speed };
      });
      allWithDist.forEach((p, i) => finalIndices.includes(i) ? selected.push(p) : others.push(p));
      others.sort((a, b) => (a.distanceVal || 0) - (b.distanceVal || 0));

      if (selected.length === 0) {
        if (radius < 5000 && retry < 1) { stopProgress(); return handleSearch(radius * 2, retry + 1); }
        // Fallback Logic
        let candidates = allWithDist;
        if (budget === 'expensive') {
           const expensive = allWithDist.filter(p => p.priceLevel && !['PRICE_LEVEL_INEXPENSIVE', 'PRICE_LEVEL_FREE'].includes(p.priceLevel));
           if (expensive.length) candidates = expensive;
           else {
               const cheapTypes = ['fast_food_restaurant', 'street_food', 'meal_takeaway', 'convenience_store'];
               const filtered = allWithDist.filter(p => !p.types?.some(t => cheapTypes.includes(t)));
               candidates = filtered.length ? filtered : [];
           }
        }
        if (!candidates.length) { setRealPlaces([]); setApiError(t.notFound); setSearchProgress(100); setIsRealLoading(false); return; }
        
        candidates.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        setRealPlaces(candidates); setApiError(t.fallbackMessage);
      } else {
        setRealPlaces([...selected, ...others]);
      }
      setSearchProgress(100); setIsRealLoading(false);
    } catch (e: any) { setApiError(`API Error: ${e.message}`); setSearchProgress(100); setIsRealLoading(false); }
  };

  useEffect(() => { if (screen === "recommend" && userLocation) { setSearchRadius(1000); handleSearch(1000); } }, [screen, userLocation]);
  const reset = () => { setChooseStep(0); setTemp(null); setHunger(null); setBudget(null); setRichness(0.5); setSpeed(null); setPressing(false); setAiSuggestion(null); setRealPlaces([]); setApiError(null); setSearchProgress(0); setIsRandomMode(false); };
  const go = (s: Screen) => { setRealPlaces([]); setAiSuggestion(null); if (s === "home") reset(); setScreen(s); };
  const save = (txt: string, cat = false) => setLog(p => [{ id: `e_${Date.now()}`, at: nowISO(), tags, choiceText: txt, isCategory: cat, isPinned: false, sig: { warmth: clamp(0.35 + richness * 0.65, 0, 1), mode: "satisfied", temp, hunger, speed, richness } }, ...p]);
  const handleReEat = (entry: LogEntry) => { let q = entry.choiceText || ""; if (q.startsWith("搜尋：")) q = q.replace("搜尋：", ""); navigateToMap(getGoogleMapsUrl(q)); };
  const togglePin = (id: string) => { setLog(p => p.map(item => item.id === id ? { ...item, isPinned: !item.isPinned } : item)); };
  const deleteLog = (id: string) => { setLog(p => p.filter(item => item.id !== id)); };
  const handleStartNav = (place: Place | string) => { const name = typeof place === 'string' ? place : place.name; const placeId = typeof place === 'object' ? place.googlePlaceId : undefined; save(name, false); go("energy"); navigateToMap(getGoogleMapsUrl(name, placeId)); };
  const handleSearchCategory = () => { save(`搜尋：${manualSearchQuery}`, true); go("energy"); navigateToMap(getGoogleMapsUrl(manualSearchQuery)); };
  
  const randomizeAll = () => {
    setTemp(Math.random() > 0.5 ? "light" : "rich");
    setHunger(Math.random() > 0.5 ? "full" : "snack");
    const rndBudget = Math.random() > 0.5 ? "cheap" : "expensive";
    setBudget(rndBudget);
    if (rndBudget === "cheap") { setRichness(0.3); setSpeed("fast"); } else { setRichness(0.8); setSpeed("sit"); }
  };

  const handleRandomClick = () => {
    setIsRandomizing(true);
    setAiSuggestion(null);
    setTimeout(() => {
      randomizeAll();
      setIsRandomizing(false);
      setIsRandomMode(true);
      setScreen("recommend");
    }, 600);
  };

  const handleBudgetSelect = (b: Budget) => {
    setBudget(b);
    if (b === "cheap") { setRichness(0.3); setSpeed("fast"); } else { setRichness(0.8); setSpeed("sit"); }
  };

  const callAi = async () => {
    setIsAiLoading(true);
    const isFewPlaces = realPlaces.length <= 3;

    const target = isFewPlaces
      ? null // 資料少時，不鎖定特定店家，讓 AI 自由發揮關鍵字
      : (realPlaces.filter(p => !visiblePlaces.some(vp => vp.id === p.id))[0] || realPlaces[Math.floor(Math.random() * realPlaces.length)]);

    try {
      let promptText = "";
      if (isFewPlaces) {
        // 方案：AI 標籤導航員
        promptText = `附近選擇不多(少於3家)。使用者的需求標籤是「${tags.join("、")}」。請根據這些標籤，推薦一個「最精準的搜尋關鍵字」(例如：想吃飽又便宜推薦"平價鐵板燒"、想清淡推薦"越南河粉")。請給我一個理由告訴使用者為什麼要找這個。回傳JSON格式：{ "dish": "試試搜尋：[關鍵字]", "reason": "30字內理由，說明為何這個關鍵字符合需求", "keyword": "[關鍵字]" }`;
      } else if (target) {
        // 原本模式：推薦隱藏店家
        promptText = `推薦「${target.name}」。請給出一個推薦理由(30字內)符合「${tags.join("、")}」。回傳JSON格式：{ "dish": "${target.name}", "reason": "推薦理由" }`;
      } else {
        // 防呆：完全沒資料
        promptText = `附近沒推薦的。請給出一個通用建議(30字內)與搜尋關鍵字，符合「${tags.join("、")}」。回傳JSON格式：{ "dish": "通用建議標題", "reason": "建議內容", "keyword": "搜尋關鍵字" }`;
      }

      const res = await fetch(BACKEND_GEMINI_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "suggestion", prompt: promptText, language: navigator.language }) });
      const data = await res.json();
      let sg = data.dish ? data : JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text.replace(/```json/g, "").replace(/```/g, "") || "{}");
      
      if (target) sg.targetPlace = target;
      setAiSuggestion(sg);
    } catch (e) { alert("AI Error"); } finally { setIsAiLoading(false); }
  };

  const cardStyle = { background: "rgba(255,255,255,0.72)", border: warm.borderSubtle, boxShadow: "0 16px 50px rgba(255, 159, 94, 0.08)" };

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-3" style={{ background: warm.bg, color: warm.text }}>
      <div className="w-full max-w-[420px]">
        <TopBar screen={screen} isRandomMode={isRandomMode} onBack={() => { if (screen === "choose" && chooseStep > 0) setChooseStep(s => s - 1); else if (screen === "choose") go("home"); else if (screen === "recommend") isRandomMode ? go("home") : go("choose"); else if (screen === "energy") go("recommend"); else if (screen === "log") go("home"); }} onGoHome={() => go("home")} onOpenLog={() => go("log")} hasLog={log.length > 0} title={screen === "home" ? t.subtitles.home : screen === "choose" ? t.subtitles.choose : screen === "recommend" ? t.subtitles.recommend : screen === "energy" ? t.subtitles.energy : t.subtitles.log} />
        <div className="px-4 pt-4 pb-10">
          <div className="rounded-[28px] overflow-hidden relative backdrop-blur-md" style={{ ...cardStyle, background: screen === "energy" || screen === "home" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.72)" }}>
            <AnimatePresence mode="wait">
              {screen === "home" && (
                <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-2xl mt-4 text-center font-bold tracking-wide">{t.appTitle}</div><div className="mt-2 text-sm text-center" style={{ color: warm.sub }}>{t.appSubtitle}</div>
                  <div className="mt-8 flex flex-col items-center justify-center"><EnergyCore mode={log[0] ? (log[0].sig?.mode ?? "chaos") : "chaos"} temp={log[0]?.sig?.temp} richness={log[0]?.sig?.richness ?? 0.5} size={220} /></div>
                  {log[0] && <div className="mt-4 flex justify-center w-full px-8"><motion.button whileTap={{ scale: 0.98 }} onClick={() => handleReEat(log[0])} className="group flex flex-col items-center gap-1 px-4 py-2 rounded-xl hover:bg-black/5 w-full max-w-[320px]" style={{ color: warm.sub }}><div className="flex items-center justify-center gap-2 text-xs opacity-60 w-full"><LucideRotateCcw size={12} /><span>{t.lastEat}</span><span>·</span><span>{fmtDate(log[0].at)}</span></div><div className="text-base font-medium text-center w-full break-words opacity-80" style={{ color: warm.text }}>{(log[0].choiceText || "").replace("搜尋：", "")}</div></motion.button></div>}
                  <div className="mt-12"><PrimaryButton onClick={() => { setRealPlaces([]); setAiSuggestion(null); reset(); setIsRandomMode(false); setScreen("choose"); }}>{t.startBtn}</PrimaryButton></div>
                  <div className="mt-6"><button onClick={handleRandomClick} className="w-full rounded-2xl px-4 py-4 relative overflow-hidden" style={{ border: warm.border, background: isRandomizing ? "linear-gradient(135deg, rgba(255,138,61,0.18) 0%, rgba(255,211,106,0.22) 100%)" : "rgba(255,255,255,0.75)" }}>{isRandomizing ? <span className="animate-pulse text-base font-bold" style={{ color: warm.orange }}>{t.randoming}</span> : <div className="relative z-10 text-base font-bold" style={{ color: warm.text }}>{t.randomBtn}</div>}</button></div>
                </motion.div>
              )}
              {screen === "choose" && (
                <motion.div key="choose" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4 text-center font-bold">{t.stepTitle}</div><ProgressDots step={chooseStep} total={totalChooseSteps} onStepClick={setChooseStep} />
                  <div className="mt-8 space-y-4">
                    {chooseStep === 0 && <><PillButton active={temp === "light"} onClick={() => setTemp("light")}>{t.light}</PillButton><PillButton active={temp === "rich"} onClick={() => setTemp("rich")}>{t.rich}</PillButton><div className="pt-4"><PrimaryButton onClick={() => setChooseStep(1)} disabled={!temp}>{t.next}</PrimaryButton></div></>}
                    {chooseStep === 1 && <><PillButton active={hunger === "full"} onClick={() => setHunger("full")}>{t.full}</PillButton><PillButton active={hunger === "snack"} onClick={() => setHunger("snack")}>{t.snack}</PillButton><div className="pt-4"><PrimaryButton onClick={() => setChooseStep(2)} disabled={!hunger}>{t.next}</PrimaryButton></div></>}
                    {chooseStep === 2 && <><PillButton active={budget === "cheap"} onClick={() => handleBudgetSelect("cheap")}>{t.cheap}</PillButton><PillButton active={budget === "expensive"} onClick={() => handleBudgetSelect("expensive")}>{t.expensive}</PillButton><div className="pt-4"><PrimaryButton onClick={() => setScreen("recommend")} disabled={!budget}>{t.finish}</PrimaryButton></div></>}
                  </div>
                </motion.div>
              )}
              {screen === "recommend" && (
                <motion.div key="recommend" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4 text-center font-bold" style={{ color: warm.text }}>{t.recommendTitle}</div>
                  <div className="flex flex-col items-center justify-center mb-6"><EnergyCore mode={pressing ? "chaos" : "stable"} temp={temp} richness={richness} size={160} /><div className="mt-4 flex flex-wrap gap-2 justify-center">{tags.map((t) => <Tag key={t}>{t}</Tag>)}</div></div>
                  <div className="mt-4 space-y-4">
                    {(isRealLoading || (searchProgress > 0 && searchProgress < 100)) && <div className="py-6 flex flex-col items-center justify-center"><div className="text-center text-sm font-medium animate-pulse" style={{ color: warm.sub }}>{searchProgress < 70 ? (searchRadius > 1000 ? t.expanding : t.searching) : t.filtering}</div><ProgressBar progress={searchProgress} /></div>}
                    {!isRealLoading && apiError && visiblePlaces.length === 0 && <div className="py-8 text-center text-gray-500 text-sm whitespace-pre-line">{apiError}</div>}
                    {!isRealLoading && visiblePlaces.length > 0 && apiError && !isRandomMode && <div className="text-center text-xs text-orange-400 font-bold mb-2 whitespace-nowrap">{apiError}</div>}
                    {visiblePlaces.map((p) => (
                      <motion.button key={p.id} whileTap={{ scale: 0.99 }} className="w-full rounded-2xl p-4 text-left transition-all duration-300 group" style={{ border: warm.borderSubtle, background: "rgba(255,255,255,0.6)", boxShadow: warm.shadow }} onClick={() => handleStartNav(p)}>
                        <div className="flex items-start gap-3"><div className="flex-1 min-w-0"><div className="text-base font-bold break-words" style={{ color: warm.text }}>{p.name}</div><div className="mt-1 text-sm font-medium" style={{ color: warm.sub }}>{p.distance} ・ <span style={{ color: warm.orange }}>{p.rating ? `★${p.rating}` : ' - '}</span></div></div><div className="h-9 w-9 shrink-0 rounded-full flex items-center justify-center bg-orange-100/30 border border-orange-200"><span className="text-xs font-bold text-orange-400">→</span></div></div>
                      </motion.button>
                    ))}
                    {!isRealLoading && searchProgress === 100 && (
                      <><div className="pt-2 pb-2"><motion.button whileTap={{ scale: 0.98 }} onClick={callAi} disabled={isAiLoading} className="w-full rounded-2xl p-4 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FFF8E7 0%, #FFF0D4 100%)", border: "1px dashed rgba(255,159,94,0.4)", color: warm.text }}>{isAiLoading ? <div className="flex items-center justify-center gap-2"><span className="animate-spin text-xl"><LucideSparkles size={20} color={warm.orange} /></span><span className="font-bold text-sm">{t.aiThinking}</span></div> : <div className="text-sm font-bold flex items-center justify-center gap-2" style={{ letterSpacing: "0.03em" }}><LucideSparkles size={16} color={warm.orange} /> {aiSuggestion ? t.aiRetry : t.aiHelp}</div>}</motion.button></div>
                        {aiSuggestion && (
                          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5 mb-4 text-left" style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${warm.orange}`, boxShadow: warm.shadowActive }}>
                            {/* FIX: 將 AI 大廚精選的字體放大到 text-sm，保持 font-bold 但視覺上更和諧 */}
                            <div className="flex items-center justify-between mb-2"><div className="text-sm font-bold text-orange-500 tracking-wider flex items-center gap-1"><LucideSparkles size={14} /> {t.aiTag}</div><button onClick={() => setAiSuggestion(null)} className="text-xs opacity-40 p-1">✕</button></div>
                            <div className="text-lg font-bold mb-1" style={{ color: warm.text }}>{aiSuggestion.dish}</div>
                            {aiSuggestion.targetPlace && <div className="text-sm font-medium mb-3" style={{ color: warm.sub }}>{aiSuggestion.targetPlace.distance} ・ <span style={{ color: warm.orange }}>{aiSuggestion.targetPlace.rating ? `★${aiSuggestion.targetPlace.rating}` : ' - '}</span></div>}
                            <div className="text-sm opacity-80 mb-4 leading-relaxed font-medium" style={{ color: "#6B5D52" }}>{aiSuggestion.reason}</div>
                            
                            <PrimaryButton onClick={() => {
                                if (aiSuggestion.targetPlace) {
                                    handleStartNav(aiSuggestion.targetPlace);
                                } else if (aiSuggestion.keyword) {
                                    save(`搜尋：${aiSuggestion.keyword}`, true);
                                    go("energy");
                                    navigateToMap(getGoogleMapsUrl(aiSuggestion.keyword));
                                } else {
                                    
                                    save(`搜尋：${aiSuggestion.dish}`, true);
                                    go("energy");
                                    navigateToMap(getGoogleMapsUrl(aiSuggestion.dish));
                                }
                            }}>
                                {aiSuggestion.targetPlace ? t.goNav : `搜尋「${aiSuggestion.keyword || aiSuggestion.dish}」 →`}
                            </PrimaryButton>
                          </motion.div>
                        )}
                        <motion.button whileTap={{ scale: 0.98 }} onClick={handleSearchCategory} className="w-full rounded-2xl p-4 text-center mb-4 mt-2 flex flex-col items-center justify-center gap-1" style={{ background: "rgba(255,255,255,0.4)", border: warm.borderAction, color: warm.text }}><div className="text-sm opacity-60 font-medium">{t.manualSearchPrefix}</div><div className="text-sm opacity-90"><span className="underline font-bold" style={{ textUnderlineOffset: 3 }}>{manualSearchQuery}</span></div></motion.button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
              {screen === "energy" && (
                <motion.div key="energy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4 font-bold text-center">{t.saveTitle}</div><div className="mt-2 text-sm text-center whitespace-pre-line" style={{ color: warm.sub }}>{t.saveDesc}</div>
                  <div className="mt-8 flex items-center justify-center"><EnergyCore mode="satisfied" temp={temp} richness={richness} size={240} /></div>
                  <div className="mt-8 space-y-5"><PrimaryButton onClick={() => go("log")}>{t.viewLog}</PrimaryButton><PrimaryButton subtle onClick={() => go("home")}>{t.backHome}</PrimaryButton></div>
                </motion.div>
              )}
              {screen === "log" && (
                <motion.div key="log" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-0 h-[600px] flex flex-col">
                  <div className="px-6 pt-8 pb-2 flex items-end justify-between gap-3 shrink-0"><div><div className="text-xl font-bold">{t.logTitle}</div><div className="mt-1 text-sm font-medium" style={{ color: warm.sub }}>{t.logSubtitle}</div></div><button className="rounded-xl px-3 py-2 text-xs font-medium transition-opacity disabled:opacity-50" style={{ border: warm.borderAction, background: "rgba(255,255,255,0.5)", color: warm.orange }} onClick={() => { if (window.confirm(t.confirmClear)) setLog([]); }} disabled={log.length === 0}><LucideTrash2 size={18} /></button></div>
                  <div className="flex-1 overflow-y-auto relative px-6"><div className="pt-4 pb-6 space-y-3">{groupedLogs.length === 0 ? <div className="rounded-2xl p-6 mt-4 text-center" style={{ border: "1px dashed rgba(255,138,61,0.3)", background: "rgba(255,211,106,0.08)" }}><div className="text-base font-bold" style={{ color: warm.text }}>{t.emptyLog}</div><div className="mt-2 text-sm text-gray-500">{t.emptyLogDesc}</div></div> : groupedLogs.map((group) => (<div key={group.title} className="mb-6"><div className="flex items-center gap-2 mb-2 ml-1">{group.type === 'pinned' && <LucidePin size={16} color={warm.orange} />}{group.type === 'date' && <LucideHistory size={16} color={warm.orange} strokeWidth={1.5} />}<span className="text-xs font-bold" style={{ color: warm.orange, letterSpacing: "0.05em" }}>{group.title}</span></div>{group.items.map((item, idx) => <SwipeableLogItem key={item.id} item={item} onReEat={() => handleReEat(item)} onPin={() => togglePin(item.id)} onDelete={() => deleteLog(item.id)} tease={group === groupedLogs[0] && idx === 0 && swipeTeaseCount < MAX_TEASE_COUNT} onTeaseComplete={() => setSwipeTeaseCount(c => { if (c < MAX_TEASE_COUNT) { localStorage.setItem(LS_SWIPE_COUNT_KEY, (c + 1).toString()); return c + 1; } return c; })} t={t} />)}</div>))}</div></div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
