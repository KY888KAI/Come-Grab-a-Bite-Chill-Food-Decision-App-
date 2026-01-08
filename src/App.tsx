import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";

const LS_KEY = "whatnow_energy_log_v2"; 
const BACKEND_API_URL = "https://come-grab-a-bite-chill-food-decision.vercel.app/api/places"; 
const BACKEND_GEMINI_URL = "https://come-grab-a-bite-chill-food-decision.vercel.app/api/gemini";

type Temp = "hot" | "cold";
type Hunger = "full" | "snack"; 
type Speed = "fast" | "sit";
type Style = "light" | "rich";

type Screen = "home" | "choose" | "recommend" | "energy" | "log";

type Place = {
  id: string;
  name: string;
  type?: Temp;
  style?: Style;
  hunger?: Hunger;
  speed?: Speed;
  price?: "budget" | "mid";
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

// --- 視覺風格系統 ---
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

function groupLogsByDate(logs: LogEntry[]) {
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

  if (pinned.length > 0) groups.push({ title: "釘選置頂", type: 'pinned', items: pinned });
  if (today.length > 0) groups.push({ title: "今天", type: 'date', items: today });
  if (yesterday.length > 0) groups.push({ title: "昨天", type: 'date', items: yesterday });
  if (older.length > 0) groups.push({ title: "更早之前", type: 'date', items: older });

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

function computeTags(args: { temp: Temp | null; hunger: Hunger | null; richness: number; speed: Speed | null }) {
  const { temp, hunger, richness, speed } = args;
  const style: Style = richness >= 0.55 ? "rich" : "light";
  const t: string[] = [];
  
  if (temp) t.push(temp === "hot" ? "熱食" : "冷食");
  if (hunger) t.push(hunger === "full" ? "吃飽" : "解饞");
  t.push(style === "rich" ? "重口" : "清爽");
  if (speed) t.push(speed === "fast" ? "快點" : "坐下來吃");
  return { tags: t, style };
}

function preferenceText(richness: number) {
  if (richness < 0.4) return "清爽一點";
  if (richness > 0.6) return "重口一點";
  return "都可以";
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

function buildMapsQuery(tags: string[]) {
  const hour = new Date().getHours();
  const isMorning = hour >= 5 && hour < 11;
  const isAfternoon = hour >= 14 && hour < 17;
  const isLateNight = hour >= 21 || hour < 5;

  const hasCold = tags.includes("冷食");
  const hasFull = tags.includes("吃飽");
  const hasSnack = tags.includes("解饞");
  const hasRich = tags.includes("重口");
  const hasLight = tags.includes("清爽");
  const hasFast = tags.includes("快點");
  const hasSit = tags.includes("坐下來吃");

  const prefixes = ["人氣", "在地", "必吃", "評價高", "隱藏版", "老字號", "平價", "排隊", "道地", "TOP"];
  const randomPrefix = prefixes[Math.floor(Math.random() * prefixes.length)];

  let categories: string[] = [];

  if (hasFull) {
      if (isMorning) {
          categories.push("早午餐", "飯糰", "鹹粥", "蛋餅", "早餐店");
      } else {
          categories.push("便當", "丼飯", "拉麵", "牛肉麵", "火鍋", "咖哩", "鐵板燒", "義大利麵", "合菜", "簡餐");
          if (hasRich) categories.push("麻辣鍋", "燒肉", "熱炒", "川菜", "韓式料理", "泰式料理");
          if (hasLight) categories.push("健康餐盒", "壽司", "越南河粉", "烏龍麵", "素食", "定食");
      }
  } else if (hasSnack) {
      categories.push("鹹酥雞", "滷味", "車輪餅", "雞蛋糕", "章魚燒", "蔥油餅", "地瓜球", "炸雞", "串燒");
      if (hasCold) categories.push("豆花", "剉冰", "手搖飲", "甜點", "蛋糕");
      if (isAfternoon) categories.push("下午茶", "鬆餅", "咖啡廳", "麵包店");
      if (isLateNight) categories.push("宵夜", "永和豆漿", "鹽水雞", "串燒");
  } else {
      categories = ["美食", "小吃", "餐廳"];
  }

  if (categories.length < 3) {
      if (hasCold) categories.push("涼麵", "沙拉", "生魚片", "壽司");
      if (hasSit) categories.push("餐廳", "居酒屋", "餐酒館");
      if (hasFast) categories.push("小吃", "速食");
  }

  const selectedCategory = categories[Math.floor(Math.random() * categories.length)];
  return Math.random() > 0.3 ? `${randomPrefix} ${selectedCategory}` : selectedCategory;
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

// --- UI Components ---

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      // 優化：text-[11px] 縮小字體, px-2 py-0.5 緊湊內距, whitespace-nowrap 不斷行
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium tracking-wide whitespace-nowrap"
      style={{
        background: "rgba(255, 211, 106, 0.15)", 
        color: "#6B5D52",
        border: "1px solid rgba(255, 138, 61, 0.2)", 
      }}
    >
      {children}
    </span>
  );
}

function SwipeableLogItem({ item, onReEat, onPin, onDelete }: { item: LogEntry; onReEat: () => void; onPin: () => void; onDelete: () => void }) {
  const x = useMotionValue(0);
  const background = useTransform(x, [-100, 0, 100], [warm.deleteRed, "rgba(255,255,255,0)", warm.orange]);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="relative mb-3 group">
      <motion.div 
        className="absolute inset-0 rounded-3xl flex items-center justify-between px-6"
        style={{ background }}
      >
        <div className="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: 1 }}>
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="none">
             <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
           </svg>
           <span className="font-bold text-sm">釘選</span>
        </div>

        <div className="flex items-center gap-2 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{ opacity: 1 }}>
           <span className="font-bold text-sm">刪除</span>
           <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
             <path d="M3 6h18"></path>
             <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
             <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
           </svg>
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
            if (window.confirm("確定要刪除這筆紀錄嗎？")) {
                onDelete();
            }
          } else if (offset.x > 60) {
            if (item.isPinned) {
                 if (window.confirm("確定要取消這筆紀錄的釘選嗎？")) {
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
          <EnergyCore mode={item.sig?.mode ?? "satisfied"} temp={item.sig?.temp} richness={item.sig?.richness ?? 0.5} size={88} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center h-full py-1 overflow-hidden">
            <div className="flex justify-between items-center mb-1">
                <div className="text-xs font-medium tracking-wide" style={{ color: warm.sub }}>{fmtDate(item.at)}</div>
                {item.isPinned && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={warm.orange} stroke="none">
                        <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
                    </svg>
                )}
            </div>
            <div className="text-lg font-bold mb-2 leading-tight whitespace-normal break-words" style={{ color: warm.text, letterSpacing: "0.01em" }}>{(item.choiceText || "").replace("搜尋：", "")}</div>
            
            {/* 優化：flex-wrap 允許換行，gap-1 縮小間距，確保整齊 */}
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

function TopBar({ title, onBack, onOpenLog, showBack, showLog }: { title: string; onBack: () => void; onOpenLog: () => void; showBack: boolean; showLog: boolean; }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-6 pb-4">
      <button 
        className={`rounded-xl px-3 py-2 text-sm transition-all active:scale-95 ${showBack ? "opacity-100" : "opacity-0 pointer-events-none"}`} 
        onClick={onBack} 
        style={{ 
            border: warm.borderSubtle,
            background: "rgba(255,255,255,0.4)", 
            backdropFilter: "blur(8px)",
            color: warm.text, 
            fontWeight: 500,
            boxShadow: "0 2px 8px rgba(255, 138, 61, 0.05)"
        }}
      >
        ← 返回
      </button>
      
      <div className="text-sm font-bold" style={{ color: warm.sub, letterSpacing: "0.05em" }}>{title}</div>
      
      {showLog ? (
        <button 
          className="rounded-xl px-3 py-2 text-sm transition-all active:scale-95" 
          onClick={onOpenLog} 
          style={{ 
              border: warm.borderSubtle, 
              background: "rgba(255,255,255,0.4)", 
              backdropFilter: "blur(8px)",
              color: warm.text, 
              fontWeight: 500, 
              letterSpacing: "0.02em",
              boxShadow: "0 2px 8px rgba(255, 138, 61, 0.05)"
          }}
        >
          回顧食力
        </button>
      ) : (
        <div className="px-3 py-2 text-sm opacity-0 pointer-events-none">回顧食力</div>
      )}
    </div>
  );
}

function EnergyCore({ mode = "stable", temp = null, richness = 0.5, size = 220 }: { mode?: "chaos" | "stable" | "satisfied"; temp?: Temp | null; richness?: number; size?: number; }) {
  const glow = mode === "chaos" ? 0.25 : mode === "stable" ? 0.45 : 0.75;
  const blurBase = mode === "chaos" ? 26 : mode === "stable" ? 34 : 42;
  const jitter = mode === "chaos" ? 6 : 0;
  
  const palette = useMemo(() => {
    if (temp === "hot") return { a: "rgba(255, 107, 74, ", b: "rgba(255, 194, 76, ", ring: "rgba(255, 94, 58, 0.4)", glowColor: "rgba(255, 100, 60," };
    if (temp === "cold") return { a: "rgba(255, 160, 130, ", b: "rgba(240, 248, 255, ", ring: "rgba(176, 224, 230, 0.5)", glowColor: "rgba(255, 180, 160," };
    return { a: "rgba(255, 138, 61, ", b: "rgba(255, 211, 106, ", ring: "rgba(255, 138, 61, 0.28)", glowColor: "rgba(255, 138, 61," };
  }, [temp]);

  const isDefault = temp === null;
  const hazeBlur = isDefault ? blurBase : blurBase + (1 - richness) * 15;
  const coreOpacity = isDefault ? 0.65 : 0.55 + richness * 0.35;
  const glowOpacity = isDefault ? 0.2 : 0.1 + richness * 0.15;
  const dur = mode === "chaos" ? 1.4 : mode === "stable" ? 2.6 : 3.2;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle at 35% 30%, ${palette.b}${0.22 + 0.25 * glow}) 0%, ${palette.glowColor}${glowOpacity + 0.1 * glow}) 40%, rgba(0,0,0,0) 70%)`, filter: `blur(${hazeBlur}px)`, transform: "scale(1.05)", opacity: 0.9 }} />
      <motion.div className="absolute inset-6 rounded-[42%]" animate={mode === "chaos" ? { scale: [1, 1.06, 0.98, 1.04, 1], rotate: [0, -1.2, 0.6, -0.8, 0] } : mode === "stable" ? { scale: [1, 1.035, 1], rotate: [0, 0.2, 0] } : { scale: [1, 1.05, 1], rotate: [0, 0, 0] }} transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }} style={{ background: `radial-gradient(circle at 30% 30%, ${palette.b}0.7) 0%, ${palette.a}${coreOpacity}) 45%, rgba(255,255,255,0.12) 72%, rgba(255,255,255,0) 100%)`, boxShadow: `0 30px 80px ${palette.glowColor}${0.1 + 0.18 * glow}), inset 0 0 40px rgba(255,255,255,0.22)`, transform: `translate(${jitter}px, ${-jitter}px)` }} />
      <motion.div className="absolute inset-10 rounded-[48%]" animate={mode === "chaos" ? { opacity: [0.25, 0.6, 0.35, 0.7, 0.25], x: [0, 2, -2, 1, 0], y: [0, -1, 2, -2, 0] } : { opacity: [0.35, 0.55, 0.35] }} transition={{ duration: mode === "chaos" ? 1.2 : 2.8, repeat: Infinity, ease: "easeInOut" }} style={{ background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.55) 0%, ${palette.b}${0.16 + 0.2 * (isDefault ? 0.5 : richness)}) 35%, ${palette.a}0.10) 70%, rgba(0,0,0,0) 100%)`, filter: "blur(10px)" }} />
      <motion.div className="absolute inset-2 rounded-full" animate={mode === "satisfied" ? { opacity: [0.2, 0.55, 0.2] } : { opacity: 0 }} transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }} style={{ boxShadow: mode === "satisfied" ? `0 0 60px ${palette.b}0.35)` : "none" }} />
    </div>
  );
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="h-2 w-2 rounded-full" style={{ background: i === step ? warm.orange : "rgba(255, 138, 61, 0.15)", transform: i === step ? "scale(1.25)" : "scale(1)", transition: "all 220ms ease" }} />
      ))}
    </div>
  );
}

export default function App() {
  const { log, setLog } = useLocalStorageLog();
  const [screen, setScreen] = useState<Screen>("home");
  const [chooseStep, setChooseStep] = useState(0);
  const totalChooseSteps = 3;

  const [temp, setTemp] = useState<Temp | null>(null);
  const [hunger, setHunger] = useState<Hunger | null>(null);
  const [richness, setRichness] = useState(0.5);
  const [speed, setSpeed] = useState<Speed | null>(null);

  const pressTimer = useRef<number | null>(null);
  const [pressing, setPressing] = useState(false);

  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [realPlaces, setRealPlaces] = useState<Place[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isRealLoading, setIsRealLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  
  const derived = useMemo(() => computeTags({ temp, hunger, richness, speed }), [temp, hunger, richness, speed]);
  const tags = derived.tags;
  const style = derived.style;
  const mapsQuery = useMemo(() => buildMapsQuery(tags), [tags]);

  const groupedLogs = useMemo(() => groupLogsByDate(log), [log]);

  const VISIBLE_COUNT = 3;

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setUserLocation({ lat: p.coords.latitude, lng: p.coords.longitude }),
        (e) => console.warn("Loc Error", e)
      );
    }
  }, []);

  useEffect(() => {
    if (screen === "recommend" && userLocation) {
      if (!BACKEND_API_URL) return;
      setIsRealLoading(true);
      setApiError(null);
      
      const payload = { 
        lat: userLocation.lat, 
        lng: userLocation.lng, 
        query: mapsQuery,
        language: navigator.language 
      };

      fetch(BACKEND_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(async res => {
        if (!res.ok) throw new Error(await res.text());
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          const placesWithDist = data.map((p: any) => {
             const d = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, p.lat, p.lng);
             return { ...p, distance: d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`, distanceVal: d, type: temp, style: style, hunger: hunger, speed: speed };
          });
          setRealPlaces(placesWithDist);
        }
      })
      .catch(err => setApiError(`API Error: ${err.message}`))
      .finally(() => setIsRealLoading(false));
    }
  }, [screen, userLocation, mapsQuery, temp, hunger, richness, speed]);

  const filteredPlaces = useMemo(() => {
    if (!BACKEND_API_URL || realPlaces.length === 0) return [];
    
    const scored = realPlaces.map(p => {
      let score = 0;
      if (p.type === temp) score += 4; 
      if (p.style === style) score += 3;
      if (p.hunger === hunger) score += 2;
      if (p.speed === speed) score += 1;
      return { place: p, score: score };
    });
    
    const candidates = scored.filter(s => s.score >= 2); 
    const finalPool = candidates.length > 0 ? candidates : scored;
    
    finalPool.sort((a, b) => (a.place.distanceVal ?? 9999) - (b.place.distanceVal ?? 9999));
    
    return finalPool.slice(0, 20).map(s => s.place);
  }, [temp, hunger, speed, style, realPlaces]);

  const visiblePlaces = useMemo(() => filteredPlaces.slice(0, VISIBLE_COUNT), [filteredPlaces]);

  function resetFlow() {
    setChooseStep(0); setTemp(null); setHunger(null); setRichness(0.5); setSpeed(null);
    setPressing(false); setAiSuggestion(null); setRealPlaces([]); setApiError(null); 
    if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; }
  }

  function goHome() { resetFlow(); setScreen("home"); }

  function goBack() {
    if (screen === "choose") {
      if (chooseStep === 0) return goHome();
      setChooseStep((s) => s - 1);
      return;
    }
    if (screen === "recommend") return setScreen("choose"); 
    if (screen === "energy") return setScreen("recommend");
    if (screen === "log") return goHome();
    return goHome();
  }

  function startDecision() { resetFlow(); setScreen("choose"); }
  function nextChoose() { if (chooseStep < totalChooseSteps - 1) setChooseStep((s) => s + 1); else setScreen("recommend"); }

  function randomizeAll() {
    setTemp(Math.random() > 0.5 ? "hot" : "cold");
    setHunger(Math.random() > 0.5 ? "full" : "snack");
    setSpeed(Math.random() > 0.5 ? "fast" : "sit");
    setRichness(Math.random());
  }

  function handlePressDown() {
    setPressing(true);
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => { randomizeAll(); setPressing(false); pressTimer.current = null; setScreen("recommend"); }, 650);
  }

  function handlePressUp() { setPressing(false); if (pressTimer.current) { window.clearTimeout(pressTimer.current); pressTimer.current = null; } }

  function saveEnergy(choiceText: string, isCategory: boolean = false) {
    const entry: LogEntry = {
      id: `e_${Date.now()}`,
      at: nowISO(),
      tags,
      choiceText: choiceText || "",
      isCategory, 
      isPinned: false, // 預設不置頂
      sig: { warmth: clamp(0.35 + richness * 0.65, 0, 1), mode: "satisfied", temp, hunger, speed, richness },
    };
    setLog((prev) => [entry, ...prev]);
  }

  function togglePin(id: string) {
    setLog(prev => prev.map(item => item.id === id ? { ...item, isPinned: !item.isPinned } : item));
  }

  function deleteLog(id: string) {
    setLog(prev => prev.filter(item => item.id !== id));
  }

  function handleStartNav(place: Place | string) {
    const name = typeof place === 'string' ? place : place.name;
    const placeId = typeof place === 'object' ? place.googlePlaceId : undefined;
    const url = getGoogleMapsUrl(name, placeId); 
    
    // 立即記錄並跳轉，不等待 (手機體驗優先)
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
    
    const hiddenCandidates = filteredPlaces.slice(VISIBLE_COUNT);

    if (hiddenCandidates.length > 0) {
        targetPlace = hiddenCandidates[Math.floor(Math.random() * Math.min(5, hiddenCandidates.length))];
    } else if (filteredPlaces.length > 0) {
        targetPlace = filteredPlaces[Math.floor(Math.random() * filteredPlaces.length)];
    }

    let prompt = "";
    if (targetPlace) {
        prompt = `使用者想吃：${tags.join(', ')}。
        推薦一家店叫「${targetPlace.name}」。
        請用繁體中文，給出一個「推薦這家店」的理由，語氣要像在地老饕，簡潔有力，30字以內。
        格式：{ "dish": "${targetPlace.name}", "reason": "你的推薦理由" }`;
    } else {
        prompt = `使用者想吃：${tags.join(', ')}。
        請推薦一道具體且適合的台灣常見餐點。
        回傳 JSON 格式：{ "dish": "餐點名稱", "reason": "一句話推薦理由(30字內)" }`;
    }

    try {
      const response = await fetch(BACKEND_GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt })
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
    if (screen === "home") return "Come Grab a Bite";
    if (screen === "choose") return "做個輕鬆的選擇";
    if (screen === "recommend") return "附近可以吃什麼";
    if (screen === "energy") return "留下這次的食力";
    return "我的食力";
  }

  const card = { background: "rgba(255,255,255,0.72)", border: warm.borderSubtle, boxShadow: "0 16px 50px rgba(255, 159, 94, 0.08)" } as const;
  const showBack = screen !== "home"; 

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-3" style={{ background: warm.bg, color: warm.text }}>
      <div className="w-full max-w-[420px] pb-10">
        <TopBar title={subtleTitle()} onBack={goBack} onOpenLog={() => setScreen("log")} showBack={showBack} showLog={log.length > 0} />
        <div className="px-4 pt-4">
          <div className="rounded-[28px] overflow-hidden relative backdrop-blur-md" style={{ ...card, background: screen === "energy" || screen === "home" ? "rgba(255,255,255,0.6)" : "rgba(255,255,255,0.72)" }}>
            <AnimatePresence mode="wait">
              {screen === "home" && (
                <motion.div key="home" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-2xl mt-4" style={{ fontWeight: 700, letterSpacing: "0.02em", textAlign: "center" }}>來覓食</div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center", fontWeight: 400 }}>佛系覓食，點幾下就知道要吃什麼</div>
                  <div className="mt-8 flex flex-col items-center justify-center">
                    {log.length > 0 && log[0] ? <EnergyCore mode={log[0].sig?.mode ?? "chaos"} temp={log[0].sig?.temp} richness={log[0].sig?.richness ?? 0.5} size={220} /> : <EnergyCore mode="chaos" richness={0.5} size={220} />}
                  </div>
                  {log.length > 0 && log[0] && (
                    <div className="mt-4 flex justify-center w-full px-8">
                      <motion.button whileTap={{ scale: 0.98 }} onClick={() => handleReEat(log[0])} className="group flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors hover:bg-black/5 w-full max-w-[320px]" style={{ color: warm.sub }}>
                        <div className="flex items-center justify-center gap-2 text-xs opacity-60 w-full" style={{ letterSpacing: "0.05em" }}><span>↺ 上次吃</span><span className="opacity-50">·</span><span>{fmtDate(log[0].at)}</span></div>
                        <div className="text-base leading-snug font-medium text-center w-full break-words opacity-80" style={{ color: warm.text }}>{(log[0].choiceText || "").replace("搜尋：", "")}</div>
                      </motion.button>
                    </div>
                  )}
                  <div className="mt-12"><PrimaryButton onClick={startDecision}>開始覓食</PrimaryButton></div>
                  <div className="mt-6">
                    <button onMouseDown={handlePressDown} onMouseUp={handlePressUp} onMouseLeave={handlePressUp} onTouchStart={handlePressDown} onTouchEnd={handlePressUp} className="w-full rounded-2xl px-4 py-4 transition overflow-hidden relative" style={{ border: warm.border, background: pressing ? "linear-gradient(135deg, rgba(255,138,61,0.18) 0%, rgba(255,211,106,0.22) 100%)" : "rgba(255,255,255,0.75)", boxShadow: pressing ? warm.shadowActive : warm.shadow }}>
                      <div className="relative z-10 text-base" style={{ fontWeight: 600, color: warm.text, textAlign: "center", letterSpacing: "0.05em" }}>沒想法</div>
                      <div className="relative z-10 mt-1 text-sm" style={{ color: warm.sub, textAlign: "center" }}>長按一下，隨緣覓食</div>
                       {/* 增加流光質感 */}
                       <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
                    </button>
                  </div>
                </motion.div>
              )}

              {screen === "choose" && (
                <motion.div key="choose" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4" style={{ fontWeight: 700, letterSpacing: "0.02em", textAlign: "center" }}>做個輕鬆的選擇</div>
                  <ProgressDots step={chooseStep} total={totalChooseSteps} />
                  <div className="mt-8 space-y-4">
                    {chooseStep === 0 && (
                      <>
                        <PillButton active={temp === "hot"} onClick={() => setTemp("hot")}>熱的</PillButton>
                        <PillButton active={temp === "cold"} onClick={() => setTemp("cold")}>冷的</PillButton>
                        <div className="pt-4"><PrimaryButton onClick={nextChoose} disabled={!temp}>下一步</PrimaryButton></div>
                      </>
                    )}
                    {chooseStep === 1 && (
                      <>
                        <PillButton active={hunger === "full"} onClick={() => setHunger("full")}>吃飽</PillButton>
                        <PillButton active={hunger === "snack"} onClick={() => setHunger("snack")}>解饞</PillButton>
                        <div className="pt-4"><PrimaryButton onClick={nextChoose} disabled={!hunger}>下一步</PrimaryButton></div>
                      </>
                    )}
                    {chooseStep === 2 && (
                      <>
                        <div className="mt-2 rounded-2xl p-5" style={{ border: warm.borderSubtle, background: "rgba(255,255,255,0.5)" }}>
                          <div className="flex items-center justify-between"><span className="text-xs" style={{ color: warm.sub }}>清爽</span><span className="text-xs" style={{ color: warm.sub }}>重口</span></div>
                          {/* 美化拉條：客製化 Slider - 移除 transition-all 解決卡頓 */}
                          <div className="relative w-full h-6 mt-4 mb-2 flex items-center">
                            <div className="absolute w-full h-2 rounded-full overflow-hidden" style={{ background: "linear-gradient(90deg, #FAD961 0%, #F76B1C 100%)", opacity: 0.3 }}></div>
                            <input 
                              type="range" 
                              min={0} 
                              max={1} 
                              step={0.01} 
                              value={richness} 
                              onChange={(e) => setRichness(parseFloat(e.target.value))} 
                              className="w-full absolute z-10 opacity-0 cursor-pointer h-full"
                            />
                            <div 
                              className="absolute h-5 w-5 rounded-full shadow-md pointer-events-none" 
                              style={{ 
                                left: `calc(${richness * 100}% - 10px)`, 
                                background: `linear-gradient(135deg, ${warm.yellow} 0%, ${warm.orange} 100%)`,
                                border: "2px solid white",
                                boxShadow: "0 2px 6px rgba(0,0,0,0.15)"
                              }}
                            />
                          </div>
                          <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>現在偏好：{preferenceText(richness)}</div>
                          <div className="mt-6 grid grid-cols-2 gap-3">
                            <button onClick={() => setSpeed("fast")} className="rounded-2xl px-3 py-3 text-sm transition-all overflow-hidden relative" style={{ border: `1px solid ${speed === "fast" ? "rgba(255,138,61,0.5)" : "rgba(255, 138, 61, 0.18)"}`, background: speed === "fast" ? "#FFF8F3" : "rgba(255,255,255,0.6)", fontWeight: 500, color: warm.text, textAlign: "center", boxShadow: speed === "fast" ? "inset 0 1px 4px rgba(255,138,61,0.1)" : "none" }}>快點</button>
                            <button onClick={() => setSpeed("sit")} className="rounded-2xl px-3 py-3 text-sm transition-all overflow-hidden relative" style={{ border: `1px solid ${speed === "sit" ? "rgba(255,138,61,0.5)" : "rgba(255, 138, 61, 0.18)"}`, background: speed === "sit" ? "#FFF8F3" : "rgba(255,255,255,0.6)", fontWeight: 500, color: warm.text, textAlign: "center", boxShadow: speed === "sit" ? "inset 0 1px 4px rgba(255,138,61,0.1)" : "none" }}>坐下來吃</button>
                          </div>
                        </div>
                        <div className="pt-4"><PrimaryButton onClick={nextChoose} disabled={!speed}>完成</PrimaryButton></div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {screen === "recommend" && (
                <motion.div key="recommend" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4 text-center font-bold" style={{color: warm.text}}>附近可以吃什麼</div>
                  <div className="flex flex-col items-center justify-center mb-6">
                    <EnergyCore mode={pressing ? "chaos" : "stable"} temp={temp} richness={richness} size={160} />
                    <div className="mt-4 flex flex-wrap gap-2 justify-center">{tags.map((t) => (<Tag key={t}>{t}</Tag>))}</div>
                  </div>
                  
                  <div className="mt-4 space-y-4">
                    {isRealLoading && (
                      <div className="py-8 text-center text-gray-400 animate-pulse text-sm">
                         正在搜尋附近的美味...
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
                                        <div className="mt-1 text-sm font-medium" style={{ color: warm.sub }}>{p.distance} ・ <span style={{color: warm.orange}}>{p.rating ? `★${p.rating}` : '無評分'}</span></div>
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
                          <div className="flex items-center justify-center gap-2"><span className="animate-spin text-xl">✨</span><span className="font-bold text-sm">AI 大廚正在思考...</span></div>
                        ) : (
                          <>
                            <div className="text-sm font-bold flex items-center justify-center gap-2" style={{letterSpacing: "0.03em"}}><span>✨</span> 都不滿意？讓 AI 大廚幫你挑</div>
                          </>
                        )}
                      </motion.button>
                    </div>
                    {aiSuggestion && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-5 mb-4 text-left" style={{ background: "rgba(255,255,255,0.9)", border: `1px solid ${warm.orange}`, boxShadow: warm.shadowActive }}>
                        <div className="flex items-center justify-between mb-2"><div className="text-xs font-bold text-orange-500 tracking-wider">✨ AI 專屬推薦</div><button onClick={() => setAiSuggestion(null)} className="text-xs opacity-40 p-1">✕</button></div>
                        <div className="text-lg font-bold mb-1" style={{color: warm.text}}>{aiSuggestion.dish}</div>
                        <div className="text-sm opacity-80 mb-4 leading-relaxed font-medium" style={{color: "#6B5D52"}}>{aiSuggestion.reason}</div>
                        <PrimaryButton onClick={() => handleStartNav(aiSuggestion?.targetPlace || aiSuggestion?.dish || "")}>出發去吃！ →</PrimaryButton>
                      </motion.div>
                    )}
                    {/* 1. 修復：沒看到想吃的按鈕邊框 */}
                    <motion.button whileTap={{ scale: 0.98 }} onClick={handleSearchCategory} className="w-full rounded-2xl p-4 text-center mb-4 mt-2 flex flex-col items-center justify-center gap-1" style={{ background: "rgba(255,255,255,0.4)", border: warm.borderAction, color: warm.text }}>
                      <div className="text-sm opacity-60 font-medium">還是沒看到想吃的？</div>
                      <div className="text-sm opacity-90"><span className="underline font-bold" style={{textUnderlineOffset: 3}}>在地圖搜尋「{mapsQuery}」</span></div>
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {screen === "energy" && (
                <motion.div key="energy" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.22 }} className="p-6 pb-12">
                  <div className="text-xl mt-4" style={{ fontWeight: 700, letterSpacing: "0.02em", textAlign: "center" }}>留下這次的食力</div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>剛剛的選擇已自動紀錄。<br/>祝你用餐愉快！</div>
                  <div className="mt-8 flex items-center justify-center"><EnergyCore mode="satisfied" temp={temp} richness={richness} size={240} /></div>
                  <div className="mt-8 space-y-5"><PrimaryButton onClick={() => setScreen("log")}>看我的食力</PrimaryButton><PrimaryButton subtle onClick={goHome}>回到首頁</PrimaryButton></div>
                </motion.div>
              )}

              {screen === "log" && (
                <motion.div key="log" initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} transition={{ duration: 0.22 }} className="p-0 h-[600px] flex flex-col">
                  <div className="px-6 pt-8 pb-2 flex items-end justify-between gap-3 shrink-0">
                    <div><div className="text-xl" style={{ fontWeight: 700, letterSpacing: "0.02em" }}>我的食力</div><div className="mt-1 text-sm font-medium" style={{ color: warm.sub }}>回顧每一次的美味選擇</div></div>
                    {/* 2. 修復：清空按鈕邊框 */}
                    <button className="rounded-xl px-3 py-2 text-xs font-medium" style={{ border: warm.borderAction, background: "rgba(255,255,255,0.5)", color: warm.orange }} onClick={() => setLog([])} title="清空本機紀錄">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto relative px-6">
                    <div className="pt-4 pb-44 space-y-3">
                      {/* 新增：分組顯示 */}
                      {groupedLogs.length === 0 ? (
                        <div className="rounded-2xl p-6 mt-4 text-center" style={{ border: "1px dashed rgba(255,138,61,0.3)", background: "rgba(255,211,106,0.08)" }}>
                          <div className="text-base font-bold" style={{color: warm.text}}>還沒有食力</div><div className="mt-2 text-sm text-gray-500">這裡會記錄你所有的覓食歷程</div>
                        </div>
                      ) : (
                        groupedLogs.map((group) => (
                          <div key={group.title} className="mb-6">
                            <div className="flex items-center gap-2 mb-2 ml-1">
                                {group.type === 'pinned' && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={warm.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <line x1="12" y1="17" x2="12" y2="22"></line>
                                      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"></path>
                                    </svg>
                                )}
                                {group.type === 'date' && (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={warm.orange} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                      <line x1="16" y1="2" x2="16" y2="6"></line>
                                      <line x1="8" y1="2" x2="8" y2="6"></line>
                                      <line x1="3" y1="10" x2="21" y2="10"></line>
                                    </svg>
                                )}
                                <span className="text-xs font-bold" style={{ color: warm.orange, letterSpacing: "0.05em" }}>{group.title}</span>
                            </div>
                            {group.items.map((item) => (
                              <SwipeableLogItem 
                                key={item.id} 
                                item={item} 
                                onReEat={() => handleReEat(item)} 
                                onPin={() => togglePin(item.id)}
                                onDelete={() => deleteLog(item.id)}
                              />
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  {/* 3. 修復：底部間距問題，增加 pb-10 避免貼底 */}
                  <div className="absolute bottom-0 left-0 w-full px-6 pb-10 pt-12 space-y-5 pointer-events-none" style={{ background: "linear-gradient(to top, #FAF9F6 70%, rgba(250, 249, 246, 0.8) 85%, transparent 100%)" }}>
                    <div className="pointer-events-auto space-y-5"><PrimaryButton onClick={startDecision}>再覓食一次</PrimaryButton><PrimaryButton subtle onClick={goHome}>回首頁</PrimaryButton></div>
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


