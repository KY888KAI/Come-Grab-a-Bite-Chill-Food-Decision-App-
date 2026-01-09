import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";

const LS_KEY = "whatnow_energy_log_v2"; 
const LS_SWIPE_COUNT_KEY = "whatnow_swipe_tease_count"; 
// 使用相對路徑，自動對應您的 Vercel 網域
const BACKEND_API_URL = "/api/places"; 
const BACKEND_GEMINI_URL = "/api/gemini";
const BACKEND_IMAGE_GEN_URL = "/api/image";

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
  aiImageUrl?: string; 
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
  // 1. 文案優化：標籤也要跟著改，避免誤會
  if (speed) t.push(speed === "fast" ? "方便吃" : "慢慢吃");
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

// 移除舊的 hardcoded buildMapsQuery，改用 AI 邏輯

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

function SwipeableLogItem({ item, onReEat, onPin, onDelete, tease = false, onTeaseComplete }: { item: LogEntry; onReEat: () => void; onPin: () => void; onDelete: () => void; tease?: boolean; onTeaseComplete?: () => void }) {
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
          <EnergyCore 
            mode={item.sig?.mode ?? "satisfied"} 
            temp={item.sig?.temp} 
            richness={item.sig?.richness ?? 0.5} 
            size={88} 
            imageUrl={item.aiImageUrl} 
          />
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-center h-full py-1 overflow-hidden">
            <div className="flex justify-between items-center mb-1">
                <div className="text-xs font-medium tracking-wide" style={{ color: warm.sub }}>{fmtDate(item.at)}</div>
                {item.isPinned && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={warm.orange} stroke="none">
                        <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>