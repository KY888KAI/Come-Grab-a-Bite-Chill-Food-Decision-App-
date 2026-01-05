import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const LS_KEY = "whatnow_energy_log_v1";

// ==========================================
// 🚀 正式環境設定區 (Production Config)
// ==========================================

// 1. Google Places 後端網址 (Vercel)
const BACKEND_API_URL = "https://come-grab-a-bite-chill-food-decision.vercel.app/api/places"; 

// 2. Gemini AI 後端網址 (Vercel)
const BACKEND_GEMINI_URL = "https://come-grab-a-bite-chill-food-decision.vercel.app/api/gemini";

// ==========================================

type Temp = "hot" | "cold";
type Form = "soup" | "dry";
type Speed = "fast" | "sit";
type Style = "light" | "rich";

type Screen = "home" | "choose" | "state" | "recommend" | "energy" | "log";

type Place = {
  id: string;
  name: string;
  type?: Temp;
  style?: Style;
  form?: Form;
  speed?: Speed;
  price?: "budget" | "mid";
  queryKeyword?: string; 
  distance: string; 
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
  sig?: {
    warmth: number; 
    mode: "satisfied" | "stable" | "chaos";
    temp: Temp | null;
    form: Form | null;
    speed: Speed | null;
    richness: number;
  };
};

type AiSuggestion = {
  dish: string;
  reason: string;
} | null;

const warm = {
  bg: "#FAF9F6",
  text: "#43403B",
  sub: "#9C968F",
  orange: "#FF9F5E",
  yellow: "#FFD97F",
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
  const isToday = d.toDateString() === now.toDateString();
  
  if (isToday) {
    return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }

  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

// Haversine 距離計算公式
function getDistanceFromLatLonInKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; 
}

function computeTags(args: { temp: Temp | null; form: Form | null; richness: number; speed: Speed | null }) {
  const { temp, form, richness, speed } = args;
  const style: Style = richness >= 0.55 ? "rich" : "light";
  const t: string[] = [];
  if (temp) t.push(temp === "hot" ? "熱食" : "冷食");
  if (form) t.push(form === "soup" ? "湯的" : "乾的");
  t.push(style === "rich" ? "重口" : "清爽");
  if (speed) t.push(speed === "fast" ? "快點" : "坐下來吃");
  return { tags: t, style };
}

function preferenceText(richness: number) {
  if (richness < 0.4) return "清爽一點";
  if (richness > 0.6) return "重口一點";
  return "都可以";
}

// ✅ 修正後的 Google Maps URL 生成函數
function getGoogleMapsUrl(query: string, placeId?: string) {
  const encodedQuery = encodeURIComponent(query);
  if (placeId) {
    // 使用 query_place_id 可以精確定位到特定店家
    return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}&query_place_id=${placeId}`;
  }
  // 一般搜尋
  return `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
}

function buildMapsQuery(tags: string[]) {
  const hasHot = tags.includes("熱食");
  const hasCold = tags.includes("冷食");
  const hasSoup = tags.includes("湯的");
  const hasDry = tags.includes("乾的");
  const hasRich = tags.includes("重口");
  const hasLight = tags.includes("清爽");
  const pool: string[] = [];
  if (hasRich && hasSoup && hasHot) pool.push("麻辣鍋", "牛肉麵", "拉麵", "酸辣湯");
  if (hasLight && hasSoup && hasHot) pool.push("清湯麵", "粥", "味噌湯", "烏龍麵");
  if (hasRich && hasDry && hasHot) pool.push("燒肉飯", "咖哩飯", "丼飯", "炸雞");
  if (hasLight && hasDry) pool.push("沙拉", "健康餐盒", "越南河粉", "涼麵");
  if (hasCold) pool.push("沙拉", "涼麵", "生魚片");
  if (pool.length === 0) pool.push("餐廳", "小吃", "便當", "麵");
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return pick(pool);
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
      className="inline-flex items-center rounded-full px-3 py-1 text-sm"
      style={{
        background: "rgba(255, 211, 106, 0.22)",
        color: warm.text,
        border: "1px solid rgba(255, 138, 61, 0.18)",
      }}
    >
      {children}
    </span>
  );
}

function PillButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl px-4 py-4 text-left transition"
      style={{
        border: `1px solid ${active ? "rgba(255,138,61,0.55)" : "rgba(30,31,36,0.10)"}`,
        background: active ? "rgba(255,138,61,0.10)" : "rgba(255,255,255,0.7)",
        boxShadow: active ? "0 12px 30px rgba(255,138,61,0.14)" : "0 10px 24px rgba(20,20,20,0.06)",
      }}
    >
      <div className="text-base" style={{ color: warm.text, fontWeight: 600, textAlign: "center" }}>
        {children}
      </div>
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
  subtle,
  onLongPress,
  longPressMs = 650,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  subtle?: boolean;
  onLongPress?: () => void;
  longPressMs?: number;
}) {
  const tRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  function clear() {
    if (tRef.current) {
      window.clearTimeout(tRef.current);
      tRef.current = null;
    }
  }

  function down() {
    if (!onLongPress) return;
    longPressedRef.current = false;
    clear();
    tRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
      clear();
    }, longPressMs);
  }

  function up() { clear(); }

  return (
    <button
      onClick={() => {
        if (disabled) return;
        if (onLongPress && longPressedRef.current) return;
        onClick?.();
      }}
      disabled={disabled}
      onMouseDown={down}
      onMouseUp={up}
      onMouseLeave={up}
      onTouchStart={down}
      onTouchEnd={up}
      className="w-full rounded-2xl px-4 py-4 transition active:scale-[0.99] disabled:opacity-50"
      style={{
        background: subtle
          ? "rgba(255, 255, 255, 0.75)"
          : `linear-gradient(135deg, ${warm.orange} 0%, ${warm.yellow} 100%)`,
        color: warm.text,
        border: `1px solid ${subtle ? "rgba(30,31,36,0.10)" : "rgba(255,138,61,0.25)"}`,
        boxShadow: subtle ? "0 10px 24px rgba(20,20,20,0.06)" : "0 16px 40px rgba(255,138,61,0.18)",
        fontWeight: subtle ? 600 : 700, 
        textAlign: "center",
      }}
    >
      {children}
    </button>
  );
}

function TopBar({
  title,
  onBack,
  onOpenLog,
  showBack,
  showLog,
}: {
  title: string;
  onBack: () => void;
  onOpenLog: () => void;
  showBack: boolean;
  showLog: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 pt-5">
      <button
        className={`rounded-xl px-3 py-2 text-sm ${showBack ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onBack}
        style={{
          border: "1px solid rgba(30,31,36,0.10)",
          background: "rgba(255,255,255,0.65)",
          color: warm.text,
        }}
      >
        ← 返回
      </button>
      <div className="text-sm" style={{ color: warm.sub, fontWeight: 700 }}>
        {title}
      </div>
      {showLog ? (
        <button
          className="rounded-xl px-3 py-2 text-sm"
          onClick={onOpenLog}
          style={{
            border: "1px solid rgba(30,31,36,0.10)",
            background: "rgba(255,255,255,0.65)",
            color: warm.text,
            fontWeight: 700, 
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

function EnergyCore({
  mode = "stable",
  temp = null,
  richness = 0.5,
  size = 220,
}: {
  mode?: "chaos" | "stable" | "satisfied";
  temp?: Temp | null;
  richness?: number;
  size?: number;
}) {
  const glow = mode === "chaos" ? 0.25 : mode === "stable" ? 0.45 : 0.75;
  const blurBase = mode === "chaos" ? 26 : mode === "stable" ? 34 : 42;
  const jitter = mode === "chaos" ? 6 : 0;

  const palette = useMemo(() => {
    if (temp === "hot") {
      return {
        a: "rgba(255, 107, 74, ",
        b: "rgba(255, 194, 76, ",
        ring: "rgba(255, 94, 58, 0.4)",
        glowColor: "rgba(255, 100, 60,",
      };
    }
    if (temp === "cold") {
      return {
        a: "rgba(255, 160, 130, ",
        b: "rgba(240, 248, 255, ",
        ring: "rgba(176, 224, 230, 0.5)",
        glowColor: "rgba(255, 180, 160,",
      };
    }
    return {
      a: "rgba(255, 138, 61, ",
      b: "rgba(255, 211, 106, ",
      ring: "rgba(255, 138, 61, 0.28)",
      glowColor: "rgba(255, 138, 61,",
    };
  }, [temp]);

  const isDefault = temp === null;
  const hazeBlur = isDefault ? blurBase : blurBase + (1 - richness) * 15;
  const coreOpacity = isDefault ? 0.65 : 0.55 + richness * 0.35;
  const glowOpacity = isDefault ? 0.2 : 0.1 + richness * 0.15;

  const pulse =
    mode === "chaos"
      ? { scale: [1, 1.06, 0.98, 1.04, 1], rotate: [0, -1.2, 0.6, -0.8, 0] }
      : mode === "stable"
        ? { scale: [1, 1.035, 1], rotate: [0, 0.2, 0] }
        : { scale: [1, 1.05, 1], rotate: [0, 0, 0] };

  const dur = mode === "chaos" ? 1.4 : mode === "stable" ? 2.6 : 3.2;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle at 35% 30%, ${palette.b}${0.22 + 0.25 * glow}) 0%, ${palette.glowColor}${glowOpacity + 0.1 * glow}) 40%, rgba(0,0,0,0) 70%)`,
          filter: `blur(${hazeBlur}px)`,
          transform: "scale(1.05)",
          opacity: 0.9,
        }}
      />
      <motion.div
        className="absolute inset-6 rounded-[42%]"
        animate={pulse}
        transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(circle at 30% 30%, ${palette.b}0.7) 0%, ${palette.a}${coreOpacity}) 45%, rgba(255,255,255,0.12) 72%, rgba(255,255,255,0) 100%)`,
          boxShadow: `0 30px 80px ${palette.glowColor}${0.1 + 0.18 * glow}), inset 0 0 40px rgba(255,255,255,0.22)`,
          transform: `translate(${jitter}px, ${-jitter}px)`,
        }}
      />
      <motion.div
        className="absolute inset-10 rounded-[48%]"
        animate={
          mode === "chaos"
            ? { opacity: [0.25, 0.6, 0.35, 0.7, 0.25], x: [0, 2, -2, 1, 0], y: [0, -1, 2, -2, 0] }
            : { opacity: [0.35, 0.55, 0.35] }
        }
        transition={{ duration: mode === "chaos" ? 1.2 : 2.8, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.55) 0%, ${palette.b}${0.16 + 0.2 * (isDefault ? 0.5 : richness)}) 35%, ${palette.a}0.10) 70%, rgba(0,0,0,0) 100%)`,
          filter: "blur(10px)",
        }}
      />
      <motion.div
        className="absolute inset-2 rounded-full"
        animate={mode === "satisfied" ? { opacity: [0.2, 0.55, 0.2] } : { opacity: 0 }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        style={{
          boxShadow: mode === "satisfied" ? `0 0 60px ${palette.b}0.35)` : "none",
        }}
      />
    </div>
  );
}

function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-2 w-2 rounded-full"
          style={{
            background: i === step ? warm.orange : "rgba(30,31,36,0.12)",
            transform: i === step ? "scale(1.25)" : "scale(1)",
            transition: "all 220ms ease",
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const { log, setLog } = useLocalStorageLog();
  // 移除未使用的 lastSig 變數
  
  const [screen, setScreen] = useState<Screen>("home");
  const [chooseStep, setChooseStep] = useState(0);
  const totalChooseSteps = 3;

  const [temp, setTemp] = useState<Temp | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [richness, setRichness] = useState(0.5);
  const [speed, setSpeed] = useState<Speed | null>(null);

  const pressTimer = useRef<number | null>(null);
  const [pressing, setPressing] = useState(false);

  // Gemini AI 狀態
  const [aiSuggestion, setAiSuggestion] = useState<AiSuggestion>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 真實資料狀態
  const [realPlaces, setRealPlaces] = useState<Place[]>([]);
  const [userLocation, setUserLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isRealLoading, setIsRealLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // 變數計算 (derived, tags, style...)
  const derived = useMemo(() => computeTags({ temp, form, richness, speed }), [temp, form, richness, speed]);
  const tags = derived.tags;
  const style = derived.style;
  const mapsQuery = useMemo(() => buildMapsQuery(tags), [tags]);

  // 1. 初始化時嘗試抓取位置
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          console.warn("無法取得位置，將使用預設距離", error);
        }
      );
    }
  }, []);

  // 2. 資料抓取函式：呼叫 Vercel Backend
  useEffect(() => {
    // 當進入推薦頁面，且有位置時，呼叫後端 API
    if (screen === "recommend" && userLocation) {
      if (!BACKEND_API_URL) {
        // 如果沒有設定後端網址，就不會嘗試 fetch
        return;
      }

      setIsRealLoading(true);
      setApiError(null);
      
      const payload = {
        lat: userLocation.lat,
        lng: userLocation.lng,
        query: mapsQuery,
      };

      fetch(BACKEND_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
      .then(res => {
        if (!res.ok) throw new Error("API response not ok");
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          // 計算每個結果的距離
          const placesWithDist = data.map((p: any) => {
             const d = getDistanceFromLatLonInKm(userLocation.lat, userLocation.lng, p.lat, p.lng);
             return {
               ...p,
               distance: d < 1 ? `${(d * 1000).toFixed(0)}m` : `${d.toFixed(1)}km`,
               // 保留使用者偏好標籤，以顯示正確的資訊
               type: temp,
               style: style,
               form: form,
               speed: speed,
             };
          });
          setRealPlaces(placesWithDist);
        }
      })
      .catch(err => {
        console.error("API Error:", err);
        setApiError("無法連接到餐廳資料庫");
      })
      .finally(() => setIsRealLoading(false));
    }
  }, [screen, userLocation, mapsQuery, temp, form, richness, speed]);

  // filteredPlaces: 純依賴真實資料
  const filteredPlaces = useMemo(() => {
    // 如果沒有後端網址，就回傳空陣列（不顯示任何卡片，只顯示提示）
    if (!BACKEND_API_URL || realPlaces.length === 0) return [];

    const scored = realPlaces.map(p => {
      let score = 0;
      if (p.type === temp) score += 4; 
      if (p.style === style) score += 3;
      if (p.form === form) score += 2;
      if (p.speed === speed) score += 1;
      return { place: p, score: score + Math.random() * 0.5 };
    });

    scored.sort((a, b) => b.score - a.score);
    const filtered = scored.filter(s => s.score >= 3); 
    const finalCandidates = filtered.length >= 6 ? filtered : scored.slice(0, 6);

    return finalCandidates.slice(0, 10).map(s => s.place);
  }, [temp, form, speed, style, realPlaces]);

  function resetFlow() {
    setChooseStep(0);
    setTemp(null);
    setForm(null);
    setRichness(0.5);
    setSpeed(null);
    setPressing(false);
    setAiSuggestion(null);
    setRealPlaces([]); 
    setApiError(null);
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function goHome() {
    resetFlow();
    setScreen("home");
  }

  function goBack() {
    if (screen === "choose") {
      if (chooseStep === 0) return goHome();
      setChooseStep((s) => s - 1);
      return;
    }
    if (screen === "recommend") return setScreen("state");
    if (screen === "energy") return setScreen("recommend");
    if (screen === "log") return goHome();
    return goHome();
  }

  function startDecision() {
    resetFlow();
    setScreen("choose");
  }

  function nextChoose() {
    if (chooseStep < totalChooseSteps - 1) setChooseStep((s) => s + 1);
    else setScreen("state");
  }

  function randomizeAll() {
    const t: Temp = Math.random() > 0.5 ? "hot" : "cold";
    const f: Form = Math.random() > 0.5 ? "soup" : "dry";
    const sp: Speed = Math.random() > 0.5 ? "fast" : "sit";
    const r = Math.random();
    setTemp(t);
    setForm(f);
    setSpeed(sp);
    setRichness(r);
  }

  function handlePressDown() {
    setPressing(true);
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      randomizeAll();
      setPressing(false);
      pressTimer.current = null;
      setScreen("state");
    }, 650);
  }

  function handlePressUp() {
    setPressing(false);
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  function saveEnergy(choiceText: string, isCategory: boolean = false) {
    const entry: LogEntry = {
      id: `e_${Date.now()}`,
      at: nowISO(),
      tags,
      choiceText: choiceText || "",
      isCategory, 
      sig: {
        warmth: clamp(0.35 + richness * 0.65, 0, 1),
        mode: "satisfied",
        temp,
        form,
        speed,
        richness,
      },
    };
    setLog((prev) => [entry, ...prev]);
  }

  function handleGoEat(place: Place | string) {
    const name = typeof place === 'string' ? place : place.name;
    // 如果有 googlePlaceId，用它來精確導航；否則用店名
    const placeId = typeof place === 'object' ? place.googlePlaceId : undefined;
    
    saveEnergy(name, false); 
    const url = getGoogleMapsUrl(name, placeId); 
    window.open(url, "_blank", "noopener,noreferrer");
    setScreen("energy");
  }

  function handleSearchCategory() {
    saveEnergy(`搜尋：${mapsQuery}`, true); 
    const url = getGoogleMapsUrl(mapsQuery);
    window.open(url, "_blank", "noopener,noreferrer");
    setScreen("energy");
  }

  function handleReEat(entry: LogEntry) {
    let query = entry.choiceText || ""; 
    if (query.startsWith("搜尋：")) {
      query = query.replace("搜尋：", "");
    }
    const url = getGoogleMapsUrl(query);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // --- Gemini API 呼叫 (透過後端) ---
  async function callGeminiRecommendation() {
    // 這裡我們改用 BACKEND_GEMINI_URL
    if (!BACKEND_GEMINI_URL) {
      alert("請先設定後端 Gemini API 網址以啟用 AI 功能！");
      return;
    }
    setIsAiLoading(true);
    
    const prompt = `你是一個台灣美食專家。使用者現在想吃：${tags.join(', ')}。
    請推薦一道具體且適合的台灣常見餐點（例如：牛肉麵、滷肉飯、火鍋...）。
    請回傳 JSON 格式：{ "dish": "餐點名稱", "reason": "一句話推薦理由（繁體中文，輕鬆語氣）" }
    不要包含 Markdown 標記。`;

    try {
      const response = await fetch(BACKEND_GEMINI_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt })
      });
      
      const data = await response.json();
      
      if (data.dish) {
         setAiSuggestion(data);
      } else if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
         // Fallback
         const text = data.candidates[0].content.parts[0].text;
         const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
         setAiSuggestion(JSON.parse(cleanText));
      }
    } catch (error) {
      console.error("AI Error:", error);
      alert("AI 腦力激盪中斷了，請再試一次");
    } finally {
      setIsAiLoading(false);
    }
  }

  function subtleTitle() {
    return screen === "home"
      ? "Come Grab a Bite"
      : screen === "choose"
        ? "做個輕鬆的選擇"
        : screen === "state"
          ? "你的飲食狀態"
          : screen === "recommend"
            ? "附近可以吃什麼"
            : screen === "energy"
              ? "留下這次的食力"
              : "我的食力";
  }

  const card = {
    background: "rgba(255,255,255,0.72)",
    border: "1px solid rgba(30,31,36,0.10)",
    boxShadow: "0 16px 50px rgba(20,20,20,0.07)",
  } as const;

  const showBack = screen !== "home" && screen !== "state";

  return (
    <div className="min-h-screen w-full flex items-start justify-center px-3" style={{ background: warm.bg, color: warm.text }}>
      <div className="w-full max-w-[420px] pb-10">
        <TopBar title={subtleTitle()} onBack={goBack} onOpenLog={() => setScreen("log")} showBack={showBack} showLog={log.length > 0} />

        <div className="px-4 pt-4">
          <div
            className="rounded-[28px] overflow-hidden"
            style={{
              ...card,
              background: screen === "energy" || screen === "home" ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.72)",
            }}
          >
            <AnimatePresence mode="wait">
              {screen === "home" && (
                <motion.div
                  key="home"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="text-2xl" style={{ fontWeight: 800, letterSpacing: -0.3, textAlign: "center" }}>
                    來覓食
                  </div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                    佛系覓食，點幾下就知道要吃什麼
                  </div>

                  <div className="mt-6 flex flex-col items-center justify-center">
                    {log.length > 0 && log[0] ? (
                       <EnergyCore 
                         mode={log[0].sig?.mode ?? "chaos"}
                         temp={log[0].sig?.temp}
                         richness={log[0].sig?.richness ?? 0.5}
                         size={220} 
                       />
                    ) : (
                       <EnergyCore mode="chaos" richness={0.5} size={220} />
                    )}
                  </div>

                  {log.length > 0 && log[0] && (
                    <div className="mt-1 flex justify-center">
                      <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleReEat(log[0])}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm transition-colors hover:bg-black/5"
                          style={{ color: warm.sub }}
                      >
                        <span className="font-medium opacity-80">
                          上次：{(log[0].choiceText || "").replace("搜尋：", "")}
                        </span>
                        <span className="text-xs opacity-50">({fmtDate(log[0].at)}) ↺</span>
                      </motion.button>
                    </div>
                  )}

                  <div className="mt-10">
                    <PrimaryButton onClick={startDecision}>開始覓食</PrimaryButton>
                  </div>

                  <div className="mt-4">
                    <button
                      onMouseDown={handlePressDown}
                      onMouseUp={handlePressUp}
                      onMouseLeave={handlePressUp}
                      onTouchStart={handlePressDown}
                      onTouchEnd={handlePressUp}
                      className="w-full rounded-2xl px-4 py-4 transition"
                      style={{
                        border: "1px solid rgba(255,138,61,0.28)",
                        background: pressing
                          ? "linear-gradient(135deg, rgba(255,138,61,0.18) 0%, rgba(255,211,106,0.22) 100%)"
                          : "rgba(255,255,255,0.75)",
                        boxShadow: pressing ? "0 18px 44px rgba(255,138,61,0.14)" : "0 10px 24px rgba(20,20,20,0.06)",
                      }}
                    >
                      <div className="text-base" style={{ fontWeight: 800, color: warm.text, textAlign: "center" }}>
                        沒想法
                      </div>
                      <div className="mt-1 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                        長按一下，隨緣覓食
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}
              {/* Screen: Choose */}
              {screen === "choose" && (
                <motion.div
                  key="choose"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="text-xl" style={{ fontWeight: 800, letterSpacing: -0.2, textAlign: "center" }}>
                    做個輕鬆的選擇
                  </div>

                  <ProgressDots step={chooseStep} total={totalChooseSteps} />

                  <div className="mt-6 space-y-3">
                    {chooseStep === 0 && (
                      <>
                        <PillButton active={temp === "hot"} onClick={() => setTemp("hot")}>
                          熱的
                        </PillButton>
                        <PillButton active={temp === "cold"} onClick={() => setTemp("cold")}>
                          冷的
                        </PillButton>
                        <div className="pt-2">
                          <PrimaryButton onClick={nextChoose} disabled={!temp}>
                            下一步
                          </PrimaryButton>
                        </div>
                      </>
                    )}

                    {chooseStep === 1 && (
                      <>
                        <PillButton active={form === "soup"} onClick={() => setForm("soup")}>
                          湯的
                        </PillButton>
                        <PillButton active={form === "dry"} onClick={() => setForm("dry")}>
                          乾的
                        </PillButton>
                        <div className="pt-2">
                          <PrimaryButton onClick={nextChoose} disabled={!form}>
                            下一步
                          </PrimaryButton>
                        </div>
                      </>
                    )}

                    {chooseStep === 2 && (
                      <>
                        <div
                          className="mt-2 rounded-2xl p-4"
                          style={{ border: "1px solid rgba(30,31,36,0.10)", background: "rgba(255,255,255,0.65)" }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs" style={{ color: warm.sub }}>
                              清爽
                            </span>
                            <span className="text-xs" style={{ color: warm.sub }}>
                              重口
                            </span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.01}
                            value={richness}
                            onChange={(e) => setRichness(parseFloat(e.target.value))}
                            className="w-full mt-3"
                            style={{ accentColor: warm.orange }}
                          />
                          <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                            現在偏好：{preferenceText(richness)}
                          </div>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setSpeed("fast")}
                              className="rounded-2xl px-3 py-3 text-sm"
                              style={{
                                border: `1px solid ${speed === "fast" ? "rgba(255,138,61,0.55)" : "rgba(30,31,36,0.10)"}`,
                                background: speed === "fast" ? "rgba(255,138,61,0.10)" : "rgba(255,255,255,0.7)",
                                fontWeight: 700,
                                color: warm.text,
                                textAlign: "center",
                              }}
                            >
                              快點
                            </button>
                            <button
                              onClick={() => setSpeed("sit")}
                              className="rounded-2xl px-3 py-3 text-sm"
                              style={{
                                border: `1px solid ${speed === "sit" ? "rgba(255,138,61,0.55)" : "rgba(30,31,36,0.10)"}`,
                                background: speed === "sit" ? "rgba(255,138,61,0.10)" : "rgba(255,255,255,0.7)",
                                fontWeight: 700,
                                color: warm.text,
                                textAlign: "center",
                              }}
                            >
                              坐下來吃
                            </button>
                          </div>
                        </div>

                        <div className="pt-2">
                          <PrimaryButton onClick={nextChoose} disabled={!speed}>
                            完成
                          </PrimaryButton>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}

              {screen === "state" && (
                <motion.div
                  key="state"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="text-xl" style={{ fontWeight: 800, letterSpacing: -0.2, textAlign: "center" }}>
                    你現在想吃的是——
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-center">
                    <EnergyCore 
                      mode={pressing ? "chaos" : "stable"} 
                      temp={temp} 
                      richness={richness}
                      size={220} 
                    />
                  </div>

                  <div className="mt-6 space-y-3">
                    <PrimaryButton onClick={() => setScreen("recommend")}>看看附近可以吃什麼</PrimaryButton>
                    <PrimaryButton
                      subtle
                      onClick={() => {
                        setChooseStep(0);
                        setScreen("choose");
                      }}
                    >
                      重想一次
                    </PrimaryButton>
                    <PrimaryButton
                      subtle
                      onLongPress={() => {
                        setPressing(true);
                        randomizeAll();
                        setPressing(false);
                        setScreen("state");
                      }}
                    >
                      沒想法（長按隨機）
                    </PrimaryButton>
                  </div>
                </motion.div>
              )}

              {screen === "recommend" && (
                <motion.div
                  key="recommend"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="text-xl" style={{ fontWeight: 800, letterSpacing: -0.2, textAlign: "center" }}>
                    附近可以吃什麼
                  </div>

                  <div className="mt-5 space-y-3">
                    {/* 未設定 API URL 時的提示 */}
                    {!BACKEND_API_URL && (
                      <div className="p-4 text-center rounded-2xl bg-orange-50 border border-orange-200">
                        <div className="text-sm font-bold text-orange-800">⚠️ 請設定後端網址</div>
                        <div className="text-xs text-orange-600 mt-1">請在程式碼中設定 BACKEND_API_URL 以連接您的 Vercel 後端。</div>
                      </div>
                    )}

                    {/* 載入中動畫 */}
                    {isRealLoading && (
                      <div className="py-8 text-center text-gray-400 animate-pulse">正在搜尋附近的 {mapsQuery}...</div>
                    )}

                    {/* 錯誤訊息 */}
                    {apiError && (
                      <div className="py-8 text-center text-red-400">{apiError}</div>
                    )}

                    {/* 真實資料列表 */}
                    {filteredPlaces.length > 0 && (
                      <>
                        {filteredPlaces.map((p) => (
                          <motion.button
                            key={p.id}
                            whileTap={{ scale: 0.99 }}
                            className="w-full rounded-2xl p-4 text-left"
                            style={{
                              border: "1px solid rgba(30,31,36,0.10)",
                              background: "rgba(255,255,255,0.72)",
                              boxShadow: "0 12px 28px rgba(20,20,20,0.06)",
                            }}
                            onClick={() => handleGoEat(p)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="text-base" style={{ fontWeight: 800 }}>
                                  {p.name}
                                </div>
                                <div className="mt-1 text-sm" style={{ color: warm.sub }}>
                                  {p.distance} ・ {p.rating ? `★${p.rating}` : '無評分'}
                                </div>
                              </div>
                              <div
                                className="h-9 w-9 rounded-2xl flex items-center justify-center"
                                style={{
                                  background: "rgba(255,138,61,0.12)",
                                  border: "1px solid rgba(255,138,61,0.22)",
                                }}
                              >
                                <span style={{ fontWeight: 800, color: warm.orange }} aria-hidden>
                                  {"→"}
                                </span>
                              </div>
                            </div>
                          </motion.button>
                        ))}
                      </>
                    )}

                    {/* ✨ AI 靈感按鈕 */}
                    <div className="pt-2 pb-2">
                      <motion.button
                          whileTap={{ scale: 0.98 }}
                          onClick={callGeminiRecommendation}
                          disabled={isAiLoading}
                          className="w-full rounded-2xl p-4 text-center relative overflow-hidden"
                          style={{
                            background: "linear-gradient(135deg, #FFF8E7 0%, #FFF0D4 100%)",
                            border: "1px dashed rgba(255,159,94,0.4)",
                            color: warm.text
                          }}
                      >
                        {isAiLoading ? (
                          <div className="flex items-center justify-center gap-2">
                            <span className="animate-spin text-xl">✨</span>
                            <span className="font-bold text-sm">AI 大廚正在思考...</span>
                          </div>
                        ) : (
                          <>
                            <div className="text-sm font-bold flex items-center justify-center gap-2">
                              <span>✨</span> 不知道吃什麼？問問 AI
                            </div>
                            <div className="text-xs opacity-60 mt-1">根據你的偏好推薦隱藏菜單</div>
                          </>
                        )}
                      </motion.button>
                    </div>

                    {/* AI 推薦結果卡片 */}
                    {aiSuggestion && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="rounded-2xl p-5 mb-4 text-left"
                        style={{
                          background: "rgba(255,255,255,0.9)",
                          border: `2px solid ${warm.orange}`,
                          boxShadow: "0 16px 40px rgba(255,159,94,0.15)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-bold text-orange-500">✨ AI 專屬推薦</div>
                          <button 
                            onClick={() => setAiSuggestion(null)}
                            className="text-xs opacity-40 p-1"
                          >
                            ✕
                          </button>
                        </div>
                        <div className="text-lg font-black mb-1">{aiSuggestion.dish}</div>
                        <div className="text-sm opacity-70 mb-4 leading-relaxed">
                          {aiSuggestion.reason}
                        </div>
                        <PrimaryButton onClick={() => handleGoEat(aiSuggestion.dish)}>
                          出發去吃！ →
                        </PrimaryButton>
                      </motion.div>
                    )}

                    {/* 廣泛搜尋分類 */}
                    <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={handleSearchCategory}
                        className="w-full rounded-2xl p-4 text-center mb-4 mt-2"
                        style={{
                          background: "rgba(255,255,255,0.5)",
                          border: "1px solid rgba(0,0,0,0.05)",
                          color: warm.text
                        }}
                    >
                      <div className="text-sm opacity-60">
                        還是沒看到想吃的？
                        <span className="underline font-bold ml-1">在地圖搜尋「{mapsQuery}」</span>
                      </div>
                    </motion.button>

                  </div>

                </motion.div>
              )}

              {screen === "energy" && (
                <motion.div
                  key="energy"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="text-xl" style={{ fontWeight: 800, letterSpacing: -0.2, textAlign: "center" }}>
                    留下這次的食力
                  </div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                    剛剛的選擇已自動紀錄。<br/>祝你用餐愉快！
                  </div>

                  <div className="mt-6 flex items-center justify-center">
                    <EnergyCore 
                      mode="satisfied" 
                      temp={temp}
                      richness={richness} 
                      size={240} 
                    />
                  </div>

                  <div className="mt-6 space-y-3">
                    <PrimaryButton onClick={() => setScreen("log")}>看我的食力</PrimaryButton>
                    <PrimaryButton subtle onClick={goHome}>
                      回到首頁
                    </PrimaryButton>
                  </div>
                </motion.div>
              )}

              {screen === "log" && (
                <motion.div
                  key="log"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xl" style={{ fontWeight: 800, letterSpacing: -0.2 }}>
                        我的食力
                      </div>
                      <div className="mt-2 text-sm" style={{ color: warm.sub }}>
                        回顧每一次的美味選擇
                      </div>
                    </div>
                    <button
                      className="rounded-2xl px-3 py-2 text-sm"
                      style={{
                        border: "1px solid rgba(30,31,36,0.10)",
                        background: "rgba(255,255,255,0.72)",
                        color: warm.text,
                        fontWeight: 700,
                      }}
                      onClick={() => setLog([])}
                      title="清空本機紀錄"
                    >
                      清空
                    </button>
                  </div>

                  <div className="mt-6">
                    {log.length === 0 ? (
                      <div
                        className="rounded-2xl p-5"
                        style={{
                          border: "1px dashed rgba(255,138,61,0.35)",
                          background: "rgba(255,211,106,0.12)",
                        }}
                      >
                        <div className="text-base" style={{ fontWeight: 800 }}>
                          還沒有食力
                        </div>
                        <div className="mt-4">
                          <PrimaryButton onClick={goHome}>回首頁</PrimaryButton>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {log.map((e, idx) => (
                          <motion.button
                            key={e.id}
                            className="rounded-2xl p-3 text-left transition"
                            style={{
                              border: "1px solid rgba(30,31,36,0.10)",
                              background: "rgba(255,255,255,0.72)",
                              boxShadow: "0 12px 26px rgba(20,20,20,0.06)",
                            }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.12) }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleReEat(e)}
                          >
                            <div className="flex items-center justify-center py-2 pointer-events-none">
                              <EnergyCore
                                mode={e.sig?.mode ?? "satisfied"}
                                temp={e.sig?.temp}
                                richness={e.sig?.richness ?? 0.5}
                                size={140}
                              />
                            </div>
                            <div className="mt-1 text-xs" style={{ color: warm.sub }}>
                              {fmtDate(e.at)}
                            </div>
                            <div className="mt-1 text-sm" style={{ fontWeight: 800 }}>
                              {(e.choiceText || "").replace("搜尋：", "")}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1">
                              {e.tags?.slice(0, 3).map((t) => (
                                <span
                                  key={t}
                                  className="rounded-full px-2 py-0.5 text-[11px]"
                                  style={{
                                    background: "rgba(255,211,106,0.18)",
                                    border: "1px solid rgba(255,138,61,0.16)",
                                    color: warm.text,
                                  }}
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          </motion.button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 space-y-3">
                    <PrimaryButton onClick={startDecision}>再覓食一次</PrimaryButton>
                    <PrimaryButton subtle onClick={goHome}>
                      回首頁
                    </PrimaryButton>
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
