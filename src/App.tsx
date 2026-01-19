import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";

// --- 多語言字典 (i18n) ---
const TRANSLATIONS = {
  zh: {
    appTitle: "來覓食",
    appSubtitle: "佛系覓食，點幾下就知道要吃什麼",
    startBtn: "開始覓食",
    randomBtn: "沒想法",
    randoming: "隨緣覓食中...",
    stepTitle: "做個輕鬆的選擇",
    light: "清淡點",
    rich: "重口味",
    full: "吃飽",
    snack: "解饞",
    cheap: "隨便吃吃",
    expensive: "犒賞自己",
    next: "下一步",
    finish: "完成",
    recommendTitle: "附近可以吃什麼",
    searching: "正在搜尋附近的美味...",
    expanding: "擴大搜尋範圍中",
    notFound: "附近找不到符合條件的店",
    aiThinking: "AI 大廚正在思考...",
    aiRetry: "還是不滿意？再試一次",
    aiHelp: "都不滿意？讓 AI 大廚幫你挑",
    aiTag: "AI 專屬推薦",
    goNav: "出發去吃！ →",
    manualSearch: "還是沒看到想吃的？",
    manualSearchHint: "在地圖搜尋",
    saveTitle: "留下這次的食力",
    saveDesc: "剛剛的選擇已自動紀錄。\n祝你用餐愉快！",
    viewLog: "看我的食力",
    backHome: "回到首頁",
    logTitle: "我的食力",
    logSubtitle: "回顧每一次的美味選擇",
    emptyLog: "還沒有食力",
    emptyLogDesc: "這裡會記錄你所有的覓食歷程",
    lastEat: "上次吃",
    pinned: "釘選置頂",
    today: "今天",
    yesterday: "昨天",
    older: "更早之前",
    confirmDelete: "確定要刪除這筆紀錄嗎？",
    confirmPin: "確定要取消這筆紀錄的釘選嗎？",
    confirmClear: "確定要清空所有紀錄嗎？此動作無法復原。",
    actionPin: "釘選",
    actionDelete: "刪除",
    subtitles: {
      home: "Come Grab a Bite",
      choose: "做個輕鬆的選擇",
      recommend: "附近可以吃什麼",
      energy: "留下這次的食力",
      log: "我的食力"
    }
  },
  en: {
    appTitle: "Grab a Bite",
    appSubtitle: "Chill food decision in a few taps.",
    startBtn: "Start",
    randomBtn: "I'm feeling lucky",
    randoming: "Randomizing...",
    stepTitle: "Make a Choice",
    light: "Light",
    rich: "Rich",
    full: "Meal",
    snack: "Snack",
    cheap: "Budget",
    expensive: "Fancy",
    next: "Next",
    finish: "Done",
    recommendTitle: "What's Nearby",
    searching: "Searching for delicious food...",
    expanding: "Expanding search radius",
    notFound: "No places found matching your criteria.",
    aiThinking: "AI Chef is thinking...",
    aiRetry: "Not happy? Try again",
    aiHelp: "Let AI Chef decide for you",
    aiTag: "AI Recommendation",
    goNav: "Let's Go! →",
    manualSearch: "Still not what you want?",
    manualSearchHint: "Search on Maps",
    saveTitle: "Choice Recorded",
    saveDesc: "Your choice has been saved.\nBon appétit!",
    viewLog: "View History",
    backHome: "Back Home",
    logTitle: "My History",
    logSubtitle: "Review your delicious choices",
    emptyLog: "No History Yet",
    emptyLogDesc: "Your food journey will appear here.",
    lastEat: "Last Ate",
    pinned: "Pinned",
    today: "Today",
    yesterday: "Yesterday",
    older: "Older",
    confirmDelete: "Delete this record?",
    confirmPin: "Unpin this record?",
    confirmClear: "Clear all history? This cannot be undone.",
    actionPin: "Pin",
    actionDelete: "Delete",
    subtitles: {
      home: "Come Grab a Bite",
      choose: "Easy Choice",
      recommend: "What's Nearby",
      energy: "Saved Choice",
      log: "My History"
    }
  }
};

// 簡單的語言偵測 Hook
function useLanguage() {
  // 如果是中文 (zh-TW, zh-CN) 就用 zh，否則全部用 en
  const langCode = navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
  return TRANSLATIONS[langCode];
}

// --- Icon 元件 (底層邏輯修復：強制分離顏色與粗細) ---
const Icon = ({ size = 24, color = "currentColor", strokeWidth = 2, children, ...props }: any) => (
  <svg 
    xmlns="http://www.w3.org/2000/svg" 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    {...props} 
    stroke={color} 
    strokeWidth={strokeWidth} 
    style={{ minWidth: size, minHeight: size }} 
  >
    {children}
  </svg>
);

// [上次吃] 圖標
const LucideRotateCcw = (props: any) => (
  <Icon {...props}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
  </Icon>
);

// [回顧/歷史] 圖標 (修正：使用 RotateCcw 基底 + 時鐘指針)
const LucideHistory = (props: any) => (
  <Icon {...props}>
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    <polyline points="12 6 12 12 16 14" />
  </Icon>
);

const LucideTrash2 = (props: any) => <Icon {...props}><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></Icon>;
const LucidePin = (props: any) => <Icon {...props}><line x1="12" y1="17" x2="12" y2="22" /><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" /></Icon>;
const LucideHome = (props: any) => <Icon {...props}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></Icon>;
const LucideX = (props: any) => <Icon {...props}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></Icon>;
const LucideChevronLeft = (props: any) => <Icon {...props}><path d="m15 18-6-6 6-6" /></Icon>;

const LS_KEY = "whatnow_energy_log_v2"; 
const LS_SWIPE_COUNT_KEY = "whatnow_swipe_tease_count"; 
const BACKEND_API_URL = "/api/places"; 
const BACKEND_GEMINI_URL = "/api/gemini";

type Temp = "light" | "rich"; 
type Hunger = "full" | "snack"; 
type Speed = "fast" | "sit";
type Style = "light" | "rich";
type Budget = "cheap" | "expensive";

type Screen = "home" | "choose" | "recommend" | "energy" | "log";

type Place = {
  id: string;
  name: string;
  type?: Temp | null;
  style?: Style;
  hunger?: Hunger | null;
  speed?: Speed | null;
  price?: "budget" | "mid";
  priceLevel?: string;
  queryKeyword?: string; 
  distance: string; 
  distanceVal?: number;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
};

type LogEntry = {
  id: string;
  at: string;
  tags: string[];
  choiceText: string;
  isCategory?: boolean;
  isPinned?: boolean; 
  sig?: {
    warmth: number; 
    mode: "satisfied" | "stable" | "chaos";
    temp: Temp | null;
    hunger: Hunger | null;
    speed: Speed | null;
    richness: number;
  };
};

type AiSuggestion = {
  dish: string;
  reason: string;
  targetPlace?: Place;
} | null;

const warm = {
  bg: "#FAF9F6", 
  text: "#595048", 
  sub: "#9C968F", 
  orange: "#FF9F5E",
  yellow: "#FFD97F",
  border: "1px solid rgba(255, 138, 61, 0.5)", 
  borderSubtle: "1px solid rgba(255, 138, 61, 0.18)", 
  borderAction: "1px solid rgba(255, 138, 61, 0.35)",
  shadow: "0 4px 12px -2px rgba(255, 159, 94, 0.1)",
  shadowActive: "0 6px 20px -4px rgba(255, 138, 61, 0.2)",
  highlight: "inset 0 1px 0 0 rgba(255, 255, 255, 0.6)",
  deleteRed: "#FF6B6B",
} as const;

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function nowISO() {
  return new Date().toISOString();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function groupLogsByDate(logs: LogEntry[], t: any) {
  const groups: { title: string; type: 'pinned' | 'date'; items: LogEntry[] }[] = [];
  const pinned: LogEntry[] = [];
  const today: LogEntry[] = [];
  const yesterday: LogEntry[] = [];
  const older: LogEntry[] = [];

  const now = new Date();
  const todayStr = now.toDateString();
  const yesterdayStr = new Date(now.setDate(now.getDate() - 1)).toDateString();

  logs.forEach(log => {
    if (log.isPinned) {
      pinned.push(log);
      return;
    }
    const d = new Date(log.at).toDateString();
    if (d === todayStr) today.push(log);
    else if (d === yesterdayStr) yesterday.push(log);
    else older.push(log);
  });

  if (pinned.length > 0) groups.push({ title: t.pinned, type: 'pinned', items: pinned });
  if (today.length > 0) groups.push({ title: t.today, type: 'date', items: today });
  if (yesterday.length > 0) groups.push({ title: t.yesterday, type: 'date', items: yesterday });
  if (older.length > 0) groups.push({ title: t.older, type: 'date', items: older });

  return groups;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

// 修正：標籤生成也支援多語言
function computeTags(args: { temp: Temp | null; hunger: Hunger | null; budget: Budget | null }, t: any) {
  const { temp, hunger, budget } = args;
  const tags: string[] = [];
    
  if (temp) tags.push(temp === "light" ? t.light : t.rich);
  if (hunger) tags.push(hunger === "full" ? t.full : t.snack);
  if (budget === "cheap") tags.push(t.cheap);
  if (budget === "expensive") tags.push(t.expensive);

  return { tags };
}

function getGoogleMapsUrl(query: string, placeId?: string) {
  const encodedQuery = encodeURIComponent(query);
  if (placeId) {
    return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}&query_place_id=${placeId}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
}

function navigateToMap(url: string) {
  const isInIframe = window.self !== window.top;
  if (isInIframe) {
    window.open(url, "_blank");
  } else {
    window.location.href = url;
  }
}

// ★★★★ 核心修正：組裝人性化的語意搜尋字串 (國際化通用版) ★★★★
// 修正 1：改用英文關鍵字 (English Keywords)，確保全球各地 (東京、巴黎、紐約) 都能搜到結果。
// 修正 2：保留「絕對條件疊加」，確保三個維度的需求都被滿足。
function buildMapsQuery(tags: string[]) {
  // 注意：這裡 tags 可能會因為 computeTags 的 i18n 變成中文或英文
  // 但我們這裡需要的是原始的「邏輯狀態」來組裝英文 Query
  // 所以我們不依賴 tags 陣列的字面值，而是在 App component 裡根據 state 來組裝
  // 這裡僅保留函式簽章，實際邏輯移到 App 內部直接用 state
  return ""; 
}

function useLocalStorageLog() {
  const [log, setLog] = useState<LogEntry[]>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? (JSON.parse(raw) as LogEntry[]) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(log));
    } catch { }
  }, [log]);
  return { log, setLog } as const;
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 font-medium tracking-wide whitespace-nowrap"
      style={{
        background: "rgba(255, 211, 106, 0.15)", 
        color: "#6B5D52",
        border: "1px solid rgba(255, 138, 61, 0.2)", 
        fontSize: "11px"
      }}
    >
      {children}
    </span>
  );
}

function SwipeableLogItem({ item, onReEat, onPin, onDelete, tease = false, onTeaseComplete, t }: { item: LogEntry; onReEat: () => void; onPin: () => void; onDelete: () => void; tease?: boolean; onTeaseComplete?: () => void, t: any }) {
  const x = useMotionValue(0);
  const background = useTransform(x, [-100, 0, 100], [warm.deleteRed, "rgba(255,255,255,0)", warm.orange]);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (tease) {
        const controls = animate(x, [0, -60, -60, 0, 60, 60, 0], {
            duration: 2.2,
            ease: "easeInOut",
            delay: 0.8, 
            times: [0, 0.2, 0.35, 0.5, 0.65, 0.8, 1],
            onComplete: () => {
                if (onTeaseComplete) onTeaseComplete();
            }
        });
        return () => controls.stop();
    }
  }, [tease, x, onTeaseComplete]);

  return (
    <div className="relative mb-3 group">
      <motion.div 
        className="absolute inset-0 rounded-3xl flex items-center justify-between px-6"
        style={{ background }}
      >
        <div className="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: 1 }}>
           <LucidePin size={20} color="currentColor" strokeWidth={2} />
           <span className="font-bold text-sm">{t.actionPin}</span>
        </div>

        <div className="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: 1 }}>
           <span className="font-bold text-sm">{t.actionDelete}</span>
           <LucideTrash2 size={20} color="currentColor" strokeWidth={2} />
        </div>
      </motion.div>

      <motion.div
        className="relative w-full bg-white rounded-3xl p-3.5 text-left flex items-center gap-4 cursor-grab active:cursor-grabbing"
        style={{ x, border: warm.borderSubtle, background: "#FFFFFF", boxShadow: warm.shadow }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.7} 
        onDragStart={() => setIsDragging(true)}
        onDragEnd={(_, { offset }) => {
          setIsDragging(false);
          if (offset.x < -60) {
            if (window.confirm(t.confirmDelete)) {
                onDelete();
            }
          } else if (offset.x > 60) {
            if (item.isPinned) {
                 if (window.confirm(t.confirmPin)) {
                     onPin();
                 }
            } else {
                 onPin();
            }
          }
        }}
        onClick={() => {
            if (!isDragging) onReEat();
        }}
      >
        <div className="shrink-0 flex items-center justify-center" style={{ width: 88, height: 88 }}>
          <EnergyCore 
            mode={item.sig?.mode ?? "satisfied"} 
            temp={item.sig?.temp} 
            richness={item.sig?.richness ?? 0.5} 
            size={88} 
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center h-full py-1 overflow-hidden">
            <div className="flex justify-between items-center mb-1">
                <div className="text-xs font-medium tracking-wide" style={{ color: warm.sub }}>{fmtDate(item.at)}</div>
                {item.isPinned && (
                    <LucidePin size={14} color={warm.orange} />
                )}
            </div>
            <div className="text-lg font-bold mb-2 leading-tight whitespace-normal break-words" style={{ color: warm.text, letterSpacing: "0.01em" }}>{(item.choiceText || "").replace("搜尋：", "")}</div>
            <div className="flex flex-wrap gap-1 w-full">
                {item.tags?.slice(0, 3).map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
            </div>
        </div>
      </motion.div>
    </div>
  );
}

function PillButton({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void; }) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl px-4 py-4 text-left transition-all duration-300 relative overflow-hidden group"
      style={{
        border: active ? warm.border : warm.borderSubtle,
        background: active ? "#FFF8F3" : "rgba(255, 255, 255, 0.65)",
        boxShadow: active 
            ? `inset 0 1px 3px rgba(255,138,61,0.06), 0 2px 8px rgba(255,138,61,0.08)` 
            : "0 2px 6px rgba(255, 138, 61, 0.05)",
      }}
    >
      <div className="relative z-10 text-base flex items-center justify-center gap-2" style={{ color: active ? warm.orange : warm.text, fontWeight: active ? 600 : 500, letterSpacing: "0.03em" }}>
        {children}
      </div>
    </button>
  );
}

function PrimaryButton({ children, onClick, disabled, subtle, onLongPress, longPressMs = 650 }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; subtle?: boolean; onLongPress?: () => void; longPressMs?: number; }) {
  const tRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  function clear() { if (tRef.current) { window.clearTimeout(tRef.current); tRef.current = null; } }
  function down() {
    if (!onLongPress) return;
    longPressedRef.current = false;
    clear();
    tRef.current = window.setTimeout(() => { longPressedRef.current = true; onLongPress(); clear(); }, longPressMs);
  }
  function up() { clear(); }

  const solidStyle = {
    background: `linear-gradient(180deg, #FFB17A 0%, ${warm.orange} 100%)`,
    color: "#FFF",
    border: "1px solid rgba(255, 138, 61, 0.1)",
    boxShadow: `inset 0 1px 1px rgba(255,255,255,0.5), ${warm.shadowActive}`,
    textShadow: "0 1px 2px rgba(169, 88, 32, 0.2)"
  };

  const subtleStyle = {
    background: "rgba(255, 255, 255, 0.7)",
    color: warm.text,
    border: warm.borderSubtle, 
    boxShadow: "0 2px 12px rgba(255, 138, 61, 0.08)",
  };

  return (
    <button
      onClick={() => { if (disabled) return; if (onLongPress && longPressedRef.current) return; onClick?.(); }}
      disabled={disabled} onMouseDown={down} onMouseUp={up} onMouseLeave={up} onTouchStart={down} onTouchEnd={up}
      className="w-full rounded-2xl px-4 py-4 transition-transform active:scale-[0.98] disabled:opacity-50 disabled:grayscale relative overflow-hidden"
      style={{
        ...(subtle ? subtleStyle : solidStyle),
        fontWeight: 600,
        letterSpacing: "0.05em",
        textAlign: "center",
      }}
    >
      <div className="relative z-10">{children}</div>
      {!subtle && <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />}
    </button>
  );
}

function TopBar({ 
  screen, 
  isRandomMode, 
  onBack, 
  onGoHome, 
  onOpenLog, 
  hasLog, 
  title 
}: { 
  screen: Screen;
  isRandomMode: boolean;
  onBack: () => void;
  onGoHome: () => void;
  onOpenLog: () => void;
  hasLog: boolean;
  title: string;
}) {
  
  const btnClassName = "flex items-center justify-center w-10 h-10 rounded-xl backdrop-blur-md shadow-sm active:scale-95 transition-all";
  
  const btnCustomStyle = {
      background: "rgba(255, 255, 255, 0.4)",
      borderColor: "rgba(255, 138, 61, 0.35)", 
      borderWidth: "1px",
      borderStyle: "solid",
      color: "#FF9F5E" 
  };

  const renderBtn = (onClick: () => void, icon: React.ReactNode) => (
      <button onClick={onClick} className={btnClassName} style={btnCustomStyle}>
          {icon}
      </button>
  );

  let leftBtn = null;
  let rightBtn = null;

  if (screen === 'home') {
     if (hasLog) {
         rightBtn = renderBtn(onOpenLog, <LucideHistory size={20} strokeWidth={1.75} />);
     }
  } else if (screen === 'choose') {
     leftBtn = renderBtn(onBack, <LucideChevronLeft size={24} />);
     rightBtn = renderBtn(onGoHome, <LucideX size={22} />);
  } else if (screen === 'recommend') {
     if (isRandomMode) {
         leftBtn = renderBtn(onGoHome, <LucideHome size={20} />);
     } else {
         leftBtn = renderBtn(onBack, <LucideChevronLeft size={24} />);
         rightBtn = renderBtn(onGoHome, <LucideX size={22} />);
     }
  } else if (screen === 'energy') {
       leftBtn = renderBtn(onGoHome, <LucideHome size={20} />);
  } else if (screen === 'log') {
      leftBtn = renderBtn(onBack, <LucideChevronLeft size={24} />);
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-6 pb-4 relative z-50">
       <div className="w-10">{leftBtn}</div>
       <div className="text-sm font-bold" style={{ color: warm.sub, letterSpacing: "0.05em" }}>{title}</div>
       <div className="w-10 flex justify-end">{rightBtn}</div>
    </div>
  );
}

function EnergyCore({ mode = "stable", temp = null, richness = 0.5, size = 220 }: { mode?: "chaos" | "stable" | "satisfied"; temp?: Temp | null; richness?: number; size?: number; }) {
  const glow = mode === "chaos" ? 0.25 : mode === "stable" ? 0.45 : 0.75;
  const blurBase = mode === "chaos" ? 26 : mode === "stable" ? 34 : 42;
  const jitter = mode === "chaos" ? 6 : 0;
    
  const palette = useMemo(() => {
    if (temp === "rich") return { a: "rgba(255, 107, 74, ", b: "rgba(255, 194, 76, ", ring: "rgba(255, 94, 58, 0.4)", glowColor: "rgba(255, 100, 60," }; 
    if (temp === "light") return { a: "rgba(255, 160, 130, ", b: "rgba(240, 248, 255, ", ring: "rgba(176, 224, 230, 0.5)", glowColor: "rgba(255, 180, 160," }; 
    return { a: "rgba(255, 138, 61, ", b: "rgba(255, 211, 106, ", ring: "rgba(255, 138, 61, 0.28)", glowColor: "rgba(255, 138, 61," };
  }, [temp]);

  const isDefault = temp === null;
  const hazeBlur = isDefault ? blurBase : blurBase + (1 - richness) * 15;
  const coreOpacity = isDefault ? 0.65 : 0.55 + richness * 0.35;
  const glowOpacity = isDefault ? 0.2 : 0.1 + richness * 0.15;
  const dur = mode === "chaos" ? 1.4 : mode === "stable" ? 2.6 : 3.2;

  return (
    <div className="relative flex flex-col items-center justify-center">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
           
          <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, ${palette.b}${0.22 + 0.25 * glow}) 0%, ${palette.glowColor}${glowOpacity + 0.1 * glow}) 40%, rgba(0,0,0,0) 70%)`, filter: `blur(${hazeBlur}px)`, transform: "scale(1.05)", opacity: 0.9 }} />
           
            <motion.div 
                key="core-shape"
                className="absolute inset-6" 
                animate={mode === "chaos" ? { scale: [1, 1.06, 0.98, 1.04, 1], rotate: [0, -1.2, 0.6, -0.8, 0] } : mode === "stable" ? { scale: [1, 1.035, 1], rotate: [0, 0.2, 0] } : { scale: [1, 1.05, 1], rotate: [0, 0, 0] }} 
                transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }} 
                style={{ borderRadius: '42%', background: `radial-gradient(circle at 30% 30%, ${palette.b}0.7) 0%, ${palette.a}${coreOpacity}) 45%, rgba(255,255,255,0.12) 72%, rgba(255,255,255,0) 100%)`, boxShadow: `0 30px 80px ${palette.glowColor}${0.1 + 0.18 * glow}), inset 0 0 40px rgba(255,255,255,0.22)`, transform: `translate(${jitter}px, ${-jitter}px)` }} 
            />
            <motion.div 
                key="mist-shape"
                className="absolute inset-10" 
                animate={mode === "chaos" ? { opacity: [0.25, 0.6, 0.35, 0.7, 0.25], x: [0, 2, -2, 1, 0], y: [0, -1, 2, -2, 0] } : { opacity: [0.35, 0.55, 0.35] }} 
                transition={{ duration: mode === "chaos" ? 1.2 : 2.8, repeat: Infinity, ease: "easeInOut" }} 
                style={{ borderRadius: '48%', background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.55) 0%, ${palette.b}${0.16 + 0.2 * (isDefault ? 0.5 : richness)}) 35%, ${palette.a}0.10) 70%, rgba(0,0,0,0) 100%)`, filter: "blur(10px)" }} 
            />
           
          <motion.div className="absolute inset-2 rounded-full" animate={mode === "satisfied" ? { opacity: [0.2, 0.55, 0.2] } : { opacity: 0 }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} style={{ boxShadow: mode === "satisfied" ? `0 0 60px ${palette.b}0.35)` : "none" }} />
        </div>
    </div>
  );
}

function ProgressDots({ step, total, onStepClick }: { step: number; total: number; onStepClick: (idx: number) => void }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div 
            key={i} 
            onClick={() => { if(i <= step) onStepClick(i); }}
            className={`h-2 w-2 rounded-full transition-all duration-200 ${i <= step ? 'cursor-pointer' : ''}`}
            style={{ 
                background: i === step ? warm.orange : "rgba(255, 138, 61, 0.15)", 
                transform: i === step ? "scale(1.25)" : "scale(1)",
            }} 
        />
      ))}
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

  const pressTimer = useRef<number | null>(null);
  const [pressing, setPressing] = useState(false);
  const [isRandomizing, setIsRandomizing] = useState(false); 
    
  const [isRandomMode, setIsRandomMode] = useState(false);

  const MAX_TEASE_COUNT = 3;
  const [swipeTeaseCount, setSwipeTeaseCount] = useState(() => {
    try {
        const val = localStorage.getItem(LS_SWIPE_COUNT_KEY);
        return val ? parseInt(val, 10) : 0;
    } catch {
        return 0;
    }
  });

  const incrementTeaseCount = () => {
      if (swipeTeaseCount < MAX_TEASE_COUNT) {
          const newCount = swipeTeaseCount + 1;
          setSwipeTeaseCount(newCount);
          try { localStorage.setItem(LS_SWIPE_COUNT_KEY, newCount.toString()); } catch {}
      }
  };

  const markSwipeFullyLearned = () => {
      setSwipeTeaseCount(MAX_TEASE_COUNT);
      try { localStorage.setItem(LS_SWIPE_COUNT_KEY, MAX_TEASE_COUNT.toString()); } catch {}
  };

  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [suggestedPlaceIds, setSuggestedPlaceIds] = useState<Set<string>>(new Set());

  const [realPlaces, setRealPlaces] = useState<Place[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isRealLoading, setIsRealLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [searchRadius, setSearchRadius] = useState(1000); 
    
  const derived = useMemo(() => computeTags({ temp, hunger, budget }, t), [temp, hunger, budget, t]);
  const tags = derived.tags;
  const style: Style = budget === "expensive" ? "rich" : "light";
  
  // ★ 組裝搜尋字串：這裡使用 state 中的原始值 (light/rich 等) 來對應英文關鍵字，而不是用翻譯後的 tags
  // 這樣無論 UI 顯示哪種語言，搜尋引擎收到的都是標準的英文指令 (如: "cheap healthy restaurant")
  const mapsQuery = useMemo(() => {
    let queryParts = [];
    
    // 1. Budget (Adjective)
    if (budget === "cheap") queryParts.push("cheap", "budget", "affordable");
    if (budget === "expensive") queryParts.push("fancy", "fine dining", "upscale");
    
    // 2. Taste (Adjective)
    if (temp === "light") queryParts.push("light", "healthy", "fresh");
    if (temp === "rich") queryParts.push("rich flavor", "savory", "heavy");
    
    // 3. Type (Noun)
    if (hunger === "full") queryParts.push("restaurant", "meal");
    if (hunger === "snack") queryParts.push("snacks", "street food", "finger food");
    
    let finalParts = [];
    if (budget === "cheap") finalParts.push("cheap");
    if (budget === "expensive") finalParts.push("fancy");
    if (temp === "light") finalParts.push("healthy");
    if (temp === "rich") finalParts.push("savory");
    if (hunger === "full") finalParts.push("restaurant");
    if (hunger === "snack") finalParts.push("snacks");
    
    if (!hunger) finalParts.push("food");
    
    return finalParts.join(" ");
  }, [temp, hunger, budget]);

  const groupedLogs = useMemo(() => groupLogsByDate(log, t), [log, t]);

  const VISIBLE_COUNT = 3;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => console.warn("Loc Error", e)
      );
    }
  }, []);

  const searchPlacesWithRipple = async (radius: number, retryCount = 0) => {
    if (!userLocation || !BACKEND_API_URL || !BACKEND_GEMINI_URL) return;
    
    setIsRealLoading(true);
    setApiError(null);
    setSearchRadius(radius);

    try {
      const placesRes = await fetch(BACKEND_API_URL, { 
        method: "POST", 
        headers: { "Content-Type": "application/json" }, 
        body: JSON.stringify({ 
          lat: userLocation.lat, 
          lng: userLocation.lng, 
          query: mapsQuery,
          language: navigator.language,
          radius: radius 
        }) 
      });

      if (!placesRes.ok) throw new Error(await placesRes.text());
      const rawPlaces: Place[] = await placesRes.json();

      if (rawPlaces.length === 0) {
         if (radius < 5000) {
             console.log(`[同心圓] ${radius}m 無結果，擴大至 ${radius * 2}m...`);
             searchPlacesWithRipple(radius * 2, retryCount + 1);
             return; 
         } else {
             setRealPlaces([]);
             setApiError(t.notFound);
             return;
         }
      }

      if (rawPlaces.length > 0) {
        const filterRes = await fetch(BACKEND_GEMINI_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            mode: "filter", 
            candidates: rawPlaces,
            userTags: tags, // 傳送當前語言的標籤 (AI 懂多國語言，且有 Prompt 輔助)
            language: navigator.language 
          }) 
        });

        const filterData = await filterRes.json();
        let finalIndices: number[] = [];
        try {
           const jsonText = filterData.candidates?.[0]?.content?.parts?.[0]?.text;
           const parsed = JSON.parse(jsonText.replace(/```json/g, "").replace(/```/g, ""));
           finalIndices = parsed.ids || [];
        } catch (e) {
           console.error("AI 解析失敗", e);
           finalIndices = [];
        }

        const aiSelectedPlaces = rawPlaces.filter((_, index) => finalIndices.includes(index));
        
        if (aiSelectedPlaces.length === 0) {
            if (radius < 5000) {
                console.log(`[AI淘汰] ${radius}m 內無合格店家，擴大至 ${radius * 2}m...`);
                searchPlacesWithRipple(radius * 2, retryCount + 1);
                return;
            } else {
                setRealPlaces([]); 
                setApiError(t.notFound);
                return;
            }
        }

        const placesWithDist = aiSelectedPlaces.map((p) => {
            const d = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, p.lat || 0, p.lng || 0);
            return { ...p, distance: d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`, distanceVal: d, type: temp, style: style, hunger: hunger, speed: speed };
        });
        
        placesWithDist.sort((a, b) => (a.distanceVal || 0) - (b.distanceVal || 0));
        
        setRealPlaces(placesWithDist);

      }

    } catch (err: any) {
      setApiError(`API Error: ${err.message}`);
    } finally {
  
    }
  
  };

  useEffect(() => {
    if (realPlaces.length > 0 || apiError) {
        setIsRealLoading(false);
    }
  }, [realPlaces, apiError]);

  useEffect(() => {
    if (screen === "recommend" && userLocation) {
        setSearchRadius(1000); 
        searchPlacesWithRipple(1000);
    }
  }, [screen, userLocation, mapsQuery]); 

  const visiblePlaces = useMemo(() => realPlaces.slice(0, VISIBLE_COUNT), [realPlaces]);

  function resetFlow() {
    setChooseStep(0); setTemp(null); setHunger(null); setBudget(null); setRichness(0.5); setSpeed(null);
    setPressing(false); setAiSuggestion(null); setRealPlaces([]); setApiError(null); 
    setIsRandomMode(false); 
    setSuggestedPlaceIds(new Set());
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  function goHome() { resetFlow(); setScreen("home"); }

  function goBack() {
    if (screen === "choose") {
      if (chooseStep === 0) return goHome();
      setChooseStep((s) => s - 1);
      return;
    }
    if (screen === "recommend") {
        if (isRandomMode) return goHome();
        return setScreen("choose"); 
    }
    if (screen === "energy") return setScreen("recommend");
    if (screen === "log") return goHome();
    return goHome();
  }

  function startDecision() { 
      resetFlow(); 
      setIsRandomMode(false); 
      setScreen("choose"); 
  }
    
  function nextChoose() { if (chooseStep < totalChooseSteps - 1) setChooseStep((s) => s + 1); else setScreen("recommend"); }

  function randomizeAll() {
    setTemp(Math.random() > 0.5 ? "light" : "rich");
    setHunger(Math.random() > 0.5 ? "full" : "snack");
    const rndBudget = Math.random() > 0.5 ? "cheap" : "expensive";
    setBudget(rndBudget);
    if (rndBudget === "cheap") {
        setRichness(0.3);
        setSpeed("fast");
    } else {
        setRichness(0.8);
        setSpeed("sit");
    }
  }

  function handleRandomClick() {
      setIsRandomizing(true);
      setTimeout(() => {
          randomizeAll();
          setIsRandomizing(false);
          setIsRandomMode(true);
          setScreen("recommend");
      }, 600);
  }

  function handleBudgetSelect(b: Budget) {
      setBudget(b);
      if (b === "cheap") {
          setRichness(0.3);
          setSpeed("fast");
      } else {
          setRichness(0.8);
          setSpeed("sit");
      }
  }

  function saveEnergy(choiceText: string, isCategory: boolean = false) {
    const entry: LogEntry = {
      id: `e_${Date.now()}`,
      at: nowISO(),
      tags,
      choiceText: choiceText || "",
      isCategory, 
      isPinned: false, 
      sig: { warmth: clamp(0.35 + richness * 0.65, 0, 1), mode: "satisfied", temp, hunger, speed, richness },
    };
    setLog((prev) => [entry, ...prev]);
  }

  function togglePin(id: string) {
    markSwipeFullyLearned(); 
    setLog(prev => prev.map(item => item.id === id ? { ...item, isPinned: !item.isPinned } : item));
  }

  function deleteLog(id: string) {
    markSwipeFullyLearned(); 
    setLog(prev => prev.filter(item => item.id !== id));
  }

  function handleStartNav(place: Place | string) {
    const name = typeof place === 'string' ? place : place.name;
    const placeId = typeof place === 'object' ? place.googlePlaceId : undefined;
    const url = getGoogleMapsUrl(name, placeId); 
     
    saveEnergy(name, false); 
    setScreen("energy");
    navigateToMap(url);
  }

  function handleSearchCategory() {
    const url = getGoogleMapsUrl(mapsQuery);
     
    saveEnergy(`搜尋：${mapsQuery}`, true); 
    setScreen("energy"); 
    navigateToMap(url);
  }

  function handleReEat(entry: LogEntry) {
    let query = entry.choiceText || ""; 
    if (query.startsWith("搜尋：")) query = query.replace("搜尋：", "");
    const url = getGoogleMapsUrl(query);
    navigateToMap(url);
  }

  async function callGeminiChef() {
    if (!BACKEND_GEMINI_URL) return alert("請先設定後端 Gemini API 網址！");
    setIsAiLoading(true);

    let targetPlace: Place | null = null;

    const hiddenCandidates = realPlaces.filter(p => !visiblePlaces.some(vp => vp.id === p.id));

    if (hiddenCandidates.length > 0) {
        targetPlace = hiddenCandidates[Math.floor(Math.random() * hiddenCandidates.length)];
    } else {
        targetPlace = null;
    }

    if (targetPlace) {
        setSuggestedPlaceIds(prev => {
            const next = new Set(prev);
            next.add(targetPlace!.id);
            return next;
        });
    }

    let prompt = "";
    if (targetPlace) {
        prompt = `使用者想吃：${tags.join(', ')}。
        推薦一家店叫「${targetPlace.name}」。
        請給出一個「推薦這家店」的理由，語氣要像在地老饕，簡潔有力，30字以內。
        同時請安撫使用者，這家店雖然可能不是完美的 100分，但絕對值得一試。
        格式：{ "dish": "${targetPlace.name}", "reason": "你的推薦理由" }`;
    } else {
        prompt = `使用者想吃：${tags.join(', ')}。
        附近已經沒有其他符合條件的推薦店家的了。
        請給出一個「通用的餐點建議」（例如：不如去便利商店買個關東煮？或是改吃水果？），語氣幽默一點。
        回傳 JSON 格式：{ "dish": "通用建議", "reason": "一句話幽默建議(30字內)" }`;
    }

    try {
      const response = await fetch(BACKEND_GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            mode: "suggestion", 
            prompt: prompt,
            language: navigator.language 
        })
      });
      const data = await response.json();
        
      let suggestion = null;
      if (data.dish) {
          suggestion = data;
      } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
          const text = data.candidates[0].content.parts[0].text;
          const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
          suggestion = JSON.parse(cleanText);
      }

      if (suggestion) {
          if (targetPlace) {
              suggestion.targetPlace = targetPlace;
          }
          setAiSuggestion(suggestion);
      }

    } catch (error) {
      console.error("AI Error:", error);
      alert("AI 腦力激盪中斷了，請再試一次");
    } finally {
      setIsAiLoading(false);
    }
  }

  function subtleTitle() {
    if (screen === "home") return t.subtitles.home;
    if (screen === "choose") return t.subtitles.choose;
    if (screen === "recommend") return t.subtitles.recommend;
    if (screen === "energy") return t.subtitles.energy;
    return t.subtitles.log;
  }

  const card = { background: "rgba(255,255,255,0.72)", border: warm.borderSubtle, boxShadow: "0 16px 50px rgba(255, 159, 94, 0.08)" } as const;
    
  return (
    <div className="min-h-screen w-full flex items-start justify-center px-3" style={{ background: warm.bg, color: warm.text }}>
      <div className="w-full max-w-[420px]" style={{ maxWidth: 420 }}>
        <TopBar 
            screen={screen}
            isRandomMode={isRandomMode}
            onBack={goBack} 
            onGoHome={goHome}
            onOpenLog={() => setScreen("log")} 
            hasLog={log.length > 0}
            title={subtleTitle()} 
        />
        <div className="px-4 pt-4 pb-10">
          <div className="rounded-[28px] overflow-hidden relative backdrop-blur-md" style={{ ...card, background: screen === "energy" || screen === "home" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.72)" }}>
            <AnimatePresence mode="wait">
              {screen === "home" && (
                <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-2xl mt-4" style={{ fontWeight: 700, letterSpacing: "0.02em", textAlign: "center" }}>{t.appTitle}</div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center", fontWeight: 400 }}>{t.appSubtitle}</div>
                  <div className="mt-8 flex flex-col items-center justify-center">
                    <EnergyCore mode={log.length > 0 && log[0] ? (log[0].sig?.mode ?? "chaos") : "chaos"} temp={log.length > 0 && log[0] ? log[0].sig?.temp : null} richness={log.length > 0 && log[0] ? (log[0].sig?.richness ?? 0.5) : 0.5} size={220} />
                  </div>
                  {log.length > 0 && log[0] && (
                    <div className="mt-4 flex justify-center w-full px-8">
                      <motion.button whileTap={{ scale: 0.98 }} onClick={() => handleReEat(log[0])} className="group flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors hover:bg-black/5 w-full max-w-[320px]" style={{ color: warm.sub, maxWidth: 320 }}>
                        <div className="flex items-center justify-center gap-2 text-xs opacity-60 w-full" style={{ letterSpacing: "0.05em" }}>
                            <LucideRotateCcw size={12} color="currentColor" strokeWidth={1.5} />
                            <span>{t.lastEat}</span><span className="opacity-50">·</span><span>{fmtDate(log[0].at)}</span>
                        </div>
                        <div className="text-base leading-snug font-medium text-center w-full break-words opacity-80" style={{ color: warm.text }}>{(log[0].choiceText || "").replace("搜尋：", "")}</div>
                      </motion.button>
                    </div>
                  )}
                  <div className="mt-12"><PrimaryButton onClick={startDecision}>{t.startBtn}</PrimaryButton></div>
                  <div className="mt-6">
                    <button 
                        onClick={handleRandomClick}
                        className="w-full rounded-2xl px-4 py-4 transition overflow-hidden relative" 
                        style={{ border: warm.border, background: isRandomizing ? "linear-gradient(135deg, rgba(255,138,61,0.18) 0%, rgba(255,211,106,0.22) 100%)" : "rgba(255,255,255,0.75)", boxShadow: isRandomizing ? warm.shadowActive : warm.shadow }}
                    >
                      {isRandomizing ? (
                          <div className="relative z-10 flex flex-col items-center justify-center h-full">
                              <span className="animate-pulse text-base" style={{color: warm.orange, fontWeight: 600, letterSpacing: "0.05em"}}>{t.randoming}</span>
                          </div>
                      ) : (
                          <>
                              <div className="relative z-10 text-base" style={{ fontWeight: 600, color: warm.text, textAlign: "center", letterSpacing: "0.05em" }}>{t.randomBtn}</div>
                              <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />
                          </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {screen === "choose" && (
                <motion.div key="choose" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4" style={{ fontWeight: 700, letterSpacing: "0.02em", textAlign: "center" }}>{t.stepTitle}</div>
                  <ProgressDots step={chooseStep} total={totalChooseSteps} onStepClick={setChooseStep} />
                  <div className="mt-8 space-y-4">
                    {chooseStep === 0 && (
                      <>
                        <PillButton active={temp === "light"} onClick={() => setTemp("light")}>{t.light}</PillButton>
                        <PillButton active={temp === "rich"} onClick={() => setTemp("rich")}>{t.rich}</PillButton>
                        <div className="pt-4"><PrimaryButton onClick={nextChoose} disabled={!temp}>{t.next}</PrimaryButton></div>
                      </>
                    )}
                    {chooseStep === 1 && (
                      <>
                        <PillButton active={hunger === "full"} onClick={() => setHunger("full")}>{t.full}</PillButton>
                        <PillButton active={hunger === "snack"} onClick={() => setHunger("snack")}>{t.snack}</PillButton>
                        <div className="pt-4"><PrimaryButton onClick={nextChoose} disabled={!hunger}>{t.next}</PrimaryButton></div>
                      </>
                    )}
                    {chooseStep === 2 && (
                      <>
                        <PillButton active={budget === "cheap"} onClick={() => handleBudgetSelect("cheap")}>{t.cheap}</PillButton>
                        <PillButton active={budget === "expensive"} onClick={() => handleBudgetSelect("expensive")}>{t.expensive}</PillButton>
                        <div className="pt-4"><PrimaryButton onClick={nextChoose} disabled={!budget}>{t.finish}</PrimaryButton></div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {screen === "recommend" && (
                <motion.div key="recommend" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4 text-center font-bold" style={{color: warm.text}}>{t.recommendTitle}</div>
                  <div className="flex flex-col items-center justify-center mb-6">
                    <EnergyCore mode={pressing ? "chaos" : "stable"} temp={temp} richness={richness} size={160} />
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">{tags.map((t) => (<Tag key={t}>{t}</Tag>))}</div>
                  </div>
                    
                  <div className="mt-4 space-y-4">
                    {isRealLoading && (
                      <div className="py-8 text-center text-gray-400 animate-pulse text-sm">
                          {t.searching}<br/>
                          {searchRadius > 1000 && <span className="text-xs text-orange-400">({t.expanding}: {searchRadius}m)</span>}
                      </div>
                    )}
                     
                    {apiError && <div className="py-8 text-center text-red-400 text-sm">{apiError}</div>}
                     
                    {visiblePlaces.map((p) => {
                      return (
                        <motion.button 
                            key={p.id} 
                            whileTap={{ scale: 0.99 }} 
                            className="w-full rounded-2xl p-4 text-left transition-all duration-300 group" 
                            style={{ border: warm.borderSubtle, background: "rgba(255,255,255,0.6)", boxShadow: warm.shadow }} 
                            onClick={() => handleStartNav(p)}
                        >
                          <div className="flex items-start justify-between gap-3 min-h-[50px]">
                                <div className="flex items-start justify-between gap-3 w-full">
                                    <div className="flex-1 min-w-0">
                                        <div className="text-base break-words" style={{ fontWeight: 700, color: warm.text, letterSpacing: "0.02em" }}>{p.name}</div>
                                        <div className="mt-1 text-sm font-medium" style={{ color: warm.sub }}>{p.distance} ・ <span style={{color: warm.orange}}>{p.rating ? `★${p.rating}` : ' - '}</span></div>
                                    </div>
                                    <div className="h-9 w-9 flex-shrink-0 rounded-full flex items-center justify-center transition-colors group-hover:bg-orange-100" style={{ background: "rgba(255,138,61,0.1)", border: "1px solid rgba(255,138,61,0.2)" }}>
                                        <span style={{ fontWeight: 800, color: warm.orange, fontSize: 12 }} aria-hidden>→</span>
                                    </div>
                                </div>
                          </div>
                        </motion.button>
                      );
                    })}
                    <div className="pt-2 pb-2">
                      <motion.button whileTap={{ scale: 0.98 }} onClick={callGeminiChef} disabled={isAiLoading} className="w-full rounded-2xl p-4 text-center relative overflow-hidden" style={{ background: "linear-gradient(135deg, #FFF8E7 0%, #FFF0D4 100%)", border: "1px dashed rgba(255,159,94,0.4)", color: warm.text }}>
                        {isAiLoading ? (
                          <div className="flex items-center justify-center gap-2"><span className="animate-spin text-xl">✨</span><span className="font-bold text-sm">{t.aiThinking}</span></div>
                        ) : aiSuggestion ? (
                            <div className="text-sm font-bold flex items-center justify-center gap-2" style={{letterSpacing: "0.03em"}}><span>↻</span> {t.aiRetry}</div>
                        ) : (
                          <>
                            <div className="text-sm font-bold flex items-center justify-center gap-2" style={{letterSpacing: "0.03em"}}><span>✨</span> {t.aiHelp}</div>
                          </>
                        )}
                      </motion.button>
                    </div>
                    {aiSuggestion && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5 mb-4 text-left" style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${warm.orange}`, boxShadow: warm.shadowActive }}>
                        <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-orange-500 tracking-wider">✨ {t.aiTag}</div><button onClick={() => setAiSuggestion(null)} className="text-xs opacity-40 p-1">✕</button></div>
                        <div className="text-lg font-bold mb-1" style={{color: warm.text}}>{aiSuggestion.dish}</div>
                        {aiSuggestion.targetPlace && (
                            <div className="text-sm font-medium mb-3" style={{ color: warm.sub }}>
                                {aiSuggestion.targetPlace.distance} ・ <span style={{color: warm.orange}}>{aiSuggestion.targetPlace.rating ? `★${aiSuggestion.targetPlace.rating}` : ' - '}</span>
                            </div>
                        )}
                        <div className="text-sm opacity-80 mb-4 leading-relaxed font-medium" style={{color: "#6B5D52"}}>{aiSuggestion.reason}</div>
                        <PrimaryButton onClick={() => handleStartNav(aiSuggestion?.targetPlace || aiSuggestion?.dish || "")}>{t.goNav}</PrimaryButton>
                      </motion.div>
                    )}
                    <motion.button whileTap={{ scale: 0.98 }} onClick={handleSearchCategory} className="w-full rounded-2xl p-4 text-center mb-4 mt-2 flex flex-col items-center justify-center gap-1" style={{ background: "rgba(255,255,255,0.4)", border: warm.borderAction, color: warm.text }}>
                      <div className="text-sm opacity-60 font-medium">{t.manualSearch}</div>
                      <div className="text-sm opacity-90"><span className="underline font-bold" style={{textUnderlineOffset: 3}}>{t.manualSearchHint}</span></div>
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {screen === "energy" && (
                <motion.div key="energy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4" style={{ fontWeight: 700, letterSpacing: "0.02em", textAlign: "center" }}>{t.saveTitle}</div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center", whiteSpace: "pre-line" }}>{t.saveDesc}</div>
                  <div className="mt-8 flex items-center justify-center"><EnergyCore mode="satisfied" temp={temp} richness={richness} size={240} /></div>
                  <div className="mt-8 space-y-5"><PrimaryButton onClick={() => setScreen("log")}>{t.viewLog}</PrimaryButton><PrimaryButton subtle onClick={goHome}>{t.backHome}</PrimaryButton></div>
                </motion.div>
              )}

              {screen === "log" && (
                <motion.div key="log" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-0 h-[600px] flex flex-col" style={{ height: 600 }}>
                  <div className="px-6 pt-8 pb-2 flex items-end justify-between gap-3 shrink-0">
                    <div><div className="text-xl" style={{ fontWeight: 700, letterSpacing: "0.02em" }}>{t.logTitle}</div><div className="mt-1 text-sm font-medium" style={{ color: warm.sub }}>{t.logSubtitle}</div></div>
                    <button 
                        className="rounded-xl px-3 py-2 text-xs font-medium transition-opacity disabled:opacity-50" 
                        style={{ border: warm.borderAction, background: "rgba(255,255,255,0.5)", color: warm.orange }} 
                        onClick={() => {
                            if (window.confirm(t.confirmClear)) {
                                setLog([]);
                            }
                        }} 
                        disabled={log.length === 0}
                        title="清空本機紀錄"
                    >
                        <LucideTrash2 size={18} color={warm.orange} />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto relative px-6">
                    <div className="pt-4 pb-6 space-y-3">
                      {groupedLogs.length === 0 ? (
                        <div className="rounded-2xl p-6 mt-4 text-center" style={{ border: "1px dashed rgba(255,138,61,0.3)", background: "rgba(255,211,106,0.08)" }}>
                          <div className="text-base font-bold" style={{color: warm.text}}>{t.emptyLog}</div><div className="mt-2 text-sm text-gray-500">{t.emptyLogDesc}</div>
                        </div>
                      ) : (
                        groupedLogs.map((group) => (
                          <div key={group.title} className="mb-6">
                            <div className="flex items-center gap-2 mb-2 ml-1">
                                {group.type === 'pinned' && (
                                    <LucidePin size={16} color={warm.orange} />
                                )}
                                {group.type === 'date' && (
                                    <LucideHistory size={16} color={warm.orange} strokeWidth={1.5} />
                                )}
                                <span className="text-xs font-bold" style={{ color: warm.orange, letterSpacing: "0.05em" }}>{group.title}</span>
                            </div>
                            {group.items.map((item, itemIndex) => {
                                const isFirstItem = group === groupedLogs[0] && itemIndex === 0;
                                return (
                                  <SwipeableLogItem 
                                    key={item.id} 
                                    item={item} 
                                    onReEat={() => handleReEat(item)} 
                                    onPin={() => togglePin(item.id)}
                                    onDelete={() => deleteLog(item.id)}
                                    tease={isFirstItem && swipeTeaseCount < MAX_TEASE_COUNT}
                                    onTeaseComplete={incrementTeaseCount}
                                    t={t} 
                                  />
                                );
                            })}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
