import React, { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * 來覓食 — Warm, Chill Food Decision App (MVP)
 * - Home → Choose(3 steps) → State(Result) → Recommend → Save(食力) → Log(我的食力)
 * - Warm palette (orange/yellow) with calm neutrals
 * - Energy Core (abstract) is the visual hook
 * - 「沒想法」長按隨機
 * - LocalStorage log（佛系：不逼每天用，想用就用）
 */

const LS_KEY = "whatnow_energy_log_v1";

type Temp = "hot" | "cold";
type Form = "soup" | "dry";
type Speed = "fast" | "sit";
type Style = "light" | "rich";

type Screen = "home" | "choose" | "state" | "recommend" | "energy" | "log";

type Place = {
  id: string;
  name: string;
  type: Temp;
  style: Style;
  form: Form;
  speed: Speed;
  price: "budget" | "mid";
};

type LogEntry = {
  id: string;
  at: string;
  tags: string[];
  choiceText: string;
  sig?: {
    warmth: number;
    mode: "satisfied" | "stable" | "chaos";
    temp: Temp | null;
    form: Form | null;
    speed: Speed | null;
    richness: number;
  };
};

const mockPlaces: Place[] = [
  { id: "p1", name: "暖湯麵館", type: "hot", style: "light", form: "soup", speed: "sit", price: "budget" },
  { id: "p2", name: "炙燒丼飯", type: "hot", style: "rich", form: "dry", speed: "fast", price: "mid" },
  { id: "p3", name: "清爽沙拉碗", type: "cold", style: "light", form: "dry", speed: "fast", price: "mid" },
  { id: "p4", name: "麻辣鍋小攤", type: "hot", style: "rich", form: "soup", speed: "sit", price: "mid" },
  { id: "p5", name: "咖哩飯專門", type: "hot", style: "rich", form: "dry", speed: "sit", price: "mid" },
  { id: "p6", name: "便當快取", type: "hot", style: "light", form: "dry", speed: "fast", price: "budget" },
  { id: "p7", name: "日式烏龍", type: "hot", style: "light", form: "soup", speed: "fast", price: "mid" },
  { id: "p8", name: "冰涼麵食", type: "cold", style: "light", form: "dry", speed: "fast", price: "budget" },
];

const warm = {
  bg: "#FAF9F6",
  text: "#2A2A2A",
  sub: "#8F8A84",
  orange: "#FF8A3D",
  yellow: "#FFD36A",
} as const;

function clamp(n: number, a: number, b: number) {
  return Math.min(b, Math.max(a, n));
}

function nowISO() {
  return new Date().toISOString();
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function filterPlaces(args: { temp: Temp | null; form: Form | null; speed: Speed | null; style: Style }) {
  const { temp, form, speed, style } = args;

  const candidates = mockPlaces
    .filter((p) => (temp ? p.type === temp : true))
    .filter((p) => (form ? p.form === form : true))
    .filter((p) => (speed ? p.speed === speed : true))
    .filter((p) => p.style === style);

  const fallback = mockPlaces.filter((p) => (temp ? p.type === temp : true));

  return (candidates.length ? candidates : fallback).slice(0, 8).map((p, idx) => ({
    ...p,
    distance: `${(idx + 1) * 0.4} km`,
  }));
}

function buildMapsQuery(tags: string[]) {
  // Keep it simple & native: turn tags into a short Chinese query.
  // Example: "熱食 湯的 重口" → "麻辣鍋 拉麵"
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

  // Fallback to generic.
  if (pool.length === 0) pool.push("餐廳", "小吃", "便當", "麵");

  // Pick 1-2 keywords to keep results clean.
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  const a = pick(pool);
  const b = Math.random() > 0.55 ? pick(pool) : "";
  const uniq = Array.from(new Set([a, b].filter(Boolean)));
  return uniq.join(" ");
}

function buildMapsSearchUrl(lat: number, lng: number, query: string) {
  const q = encodeURIComponent(query);
  // Google Maps search near a coordinate.
  return `https://www.google.com/maps/search/${q}/@${lat},${lng},15z`;
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
    } catch {
      // ignore
    }
  }, [log]);

  return { log, setLog } as const;
}

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

  function up() {
    clear();
  }

  return (
    <button
      onClick={() => {
        if (disabled) return;
        // If we have long press and it already fired, ignore click.
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
        fontWeight: 800,
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
            fontWeight: 800,
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
  accent = 0.5,
  size = 220,
}: {
  mode?: "chaos" | "stable" | "satisfied";
  accent?: number;
  size?: number;
}) {
  const glow = mode === "chaos" ? 0.25 : mode === "stable" ? 0.45 : 0.75;
  const blur = mode === "chaos" ? 26 : mode === "stable" ? 34 : 42;
  const jitter = mode === "chaos" ? 6 : 0;

  const gradA = mode === "chaos" ? "rgba(255, 138, 61, 0.35)" : "rgba(255, 138, 61, 0.65)";
  const gradB = mode === "chaos" ? "rgba(255, 211, 106, 0.30)" : "rgba(255, 211, 106, 0.70)";

  const ring = mode === "satisfied" ? "rgba(255, 211, 106, 0.65)" : "rgba(255, 138, 61, 0.28)";

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
          background: `radial-gradient(circle at 35% 30%, rgba(255,211,106,${0.22 + 0.25 * glow}) 0%, rgba(255,138,61,${0.10 + 0.20 * glow}) 40%, rgba(0,0,0,0) 70%)`,
          filter: `blur(${blur}px)`,
          transform: "scale(1.05)",
          opacity: 0.9,
        }}
      />

      <motion.div
        className="absolute inset-6 rounded-[42%]"
        animate={pulse}
        transition={{ duration: dur, repeat: Infinity, ease: "easeInOut" }}
        style={{
          background: `radial-gradient(circle at 30% 30%, ${gradB} 0%, ${gradA} 45%, rgba(255,255,255,0.12) 72%, rgba(255,255,255,0) 100%)`,
          boxShadow: `0 30px 80px rgba(255,138,61,${0.10 + 0.18 * glow}), inset 0 0 40px rgba(255,255,255,0.22)`,
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
          background: `radial-gradient(circle at 40% 35%, rgba(255,255,255,0.55) 0%, rgba(255,211,106,${0.16 + 0.20 * accent}) 35%, rgba(255,138,61,0.10) 70%, rgba(0,0,0,0) 100%)`,
          filter: "blur(10px)",
        }}
      />

      <motion.div
        className="absolute inset-2 rounded-full"
        animate={mode === "satisfied" ? { opacity: [0.2, 0.55, 0.2] } : { opacity: [0.10, 0.18, 0.10] }}
        transition={{ duration: mode === "satisfied" ? 2.6 : 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          border: `1px solid ${ring}`,
          boxShadow: mode === "satisfied" ? "0 0 60px rgba(255,211,106,0.35)" : "none",
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

function runSelfTests() {
  try {
    console.assert(clamp(2, 0, 1) === 1, "clamp upper bound failed");
    console.assert(clamp(-1, 0, 1) === 0, "clamp lower bound failed");
    console.assert(typeof fmtDate(new Date().toISOString()) === "string", "fmtDate should return string");

    const t1 = computeTags({ temp: "hot", form: "soup", richness: 0.9, speed: "fast" });
    console.assert(t1.style === "rich", "style should be rich when richness >= 0.55");
    console.assert(t1.tags.includes("熱食"), "tags should include 熱食");
    console.assert(t1.tags.includes("湯的"), "tags should include 湯的");

    const t2 = computeTags({ temp: "cold", form: "dry", richness: 0.1, speed: "sit" });
    console.assert(t2.style === "light", "style should be light when richness < 0.55");
    console.assert(t2.tags.includes("冷食"), "tags should include 冷食");

    const ps = filterPlaces({ temp: "hot", form: "soup", speed: "sit", style: "rich" });
    console.assert(Array.isArray(ps) && ps.length > 0, "filterPlaces should return results");
    console.assert("distance" in ps[0], "filterPlaces should add distance");

    console.assert(preferenceText(0.1) === "清爽一點", "preferenceText low failed");
    console.assert(preferenceText(0.5) === "都可以", "preferenceText mid failed");
    console.assert(preferenceText(0.9) === "重口一點", "preferenceText high failed");

    const url = buildMapsSearchUrl(25.0, 121.5, "拉麵");
    console.assert(url.includes("google.com/maps/search"), "maps url should include search path");
    console.assert(url.includes("25") && url.includes("121.5"), "maps url should include coords");

    // UI gating logic (log button should only show when there is at least one entry)
    const shouldShowLogButton = ([{ id: "x", at: nowISO(), tags: [], choiceText: "" }] as LogEntry[]).length > 0;
    console.assert(shouldShowLogButton === true, "log button gate should be true when log has items");
    const shouldHideLogButton = ([] as LogEntry[]).length === 0;
    console.assert(shouldHideLogButton === true, "log button gate should be true when log is empty");
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Self tests error:", e);
  }
}

export default function App() {
  const { log, setLog } = useLocalStorageLog();

  const [screen, setScreen] = useState<Screen>("home");
  const [chooseStep, setChooseStep] = useState(0);
  const totalChooseSteps = 3;

  const [temp, setTemp] = useState<Temp | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [richness, setRichness] = useState(0.5);
  const [speed, setSpeed] = useState<Speed | null>(null);

  const pressTimer = useRef<number | null>(null);
  const [pressing, setPressing] = useState(false);
  const [geoStatus, setGeoStatus] = useState<string>("");

  const didTest = useRef(false);
  useEffect(() => {
    if (didTest.current) return;
    didTest.current = true;
    runSelfTests();
  }, []);

  const derived = useMemo(() => computeTags({ temp, form, richness, speed }), [temp, form, richness, speed]);
  const tags = derived.tags;
  const style = derived.style;

  const filteredPlaces = useMemo(() => filterPlaces({ temp, form, speed, style }), [temp, form, speed, style]);

  async function openMapsNearby() {
    const query = buildMapsQuery(tags);
    setGeoStatus("正在取得定位…");

    if (!navigator.geolocation) {
      setGeoStatus("這個裝置不支援定位。你仍可手動在地圖搜尋。");
      const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const url = buildMapsSearchUrl(latitude, longitude, query);
        setGeoStatus(`已準備好：${query}`);
        // Record the decision as soon as user decides to go out.
        saveEnergy("（前往附近覓食）");
        window.open(url, "_blank", "noopener,noreferrer");
      },
      (err) => {
        const msg = err.code === 1 ? "你拒絕了定位權限。" : "定位失敗。";
        setGeoStatus(`${msg} 你仍可手動在地圖搜尋。`);
        const url = `https://www.google.com/maps/search/${encodeURIComponent(query)}`;
        window.open(url, "_blank", "noopener,noreferrer");
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  function resetFlow() {
    setChooseStep(0);
    setTemp(null);
    setForm(null);
    setRichness(0.5);
    setSpeed(null);
    setPressing(false);
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
    // state screen intentionally has no back.
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

  function saveEnergy(choiceText: string) {
    const entry: LogEntry = {
      id: `e_${Date.now()}`,
      at: nowISO(),
      tags,
      choiceText: choiceText || "",
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
                  <div className="text-2xl" style={{ fontWeight: 900, letterSpacing: -0.3, textAlign: "center" }}>
                    來覓食
                  </div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                    佛系覓食，點幾下就知道要吃什麼
                  </div>

                  <div className="mt-6 flex items-center justify-center">
                    <EnergyCore mode="stable" accent={0.65} size={220} />
                  </div>

                  <div className="mt-6">
                    <PrimaryButton onClick={startDecision}>開始覓食</PrimaryButton>
                  </div>

                  <div className="mt-3">
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
                      <div className="text-base" style={{ fontWeight: 900, color: warm.text, textAlign: "center" }}>
                        沒想法
                      </div>
                      <div className="mt-1 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                        長按一下，隨緣覓食
                      </div>
                    </button>
                  </div>
                </motion.div>
              )}

              {screen === "choose" && (
                <motion.div
                  key="choose"
                  initial={{ opacity: 0, x: 14 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.22 }}
                  className="p-6"
                >
                  <div className="text-xl" style={{ fontWeight: 900, letterSpacing: -0.2, textAlign: "center" }}>
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
                                fontWeight: 900,
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
                                fontWeight: 900,
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
                  <div className="text-xl" style={{ fontWeight: 900, letterSpacing: -0.2, textAlign: "center" }}>
                    你現在想吃的是——
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {tags.map((t) => (
                      <Tag key={t}>{t}</Tag>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-center">
                    <EnergyCore mode={pressing ? "chaos" : "stable"} accent={clamp(0.35 + richness * 0.65, 0, 1)} size={220} />
                  </div>

                  {/* Result actions: no back on this screen */}
                  <div className="mt-6 space-y-3">
                    <PrimaryButton onClick={() => setScreen("recommend")}>看看附近可以吃什麼</PrimaryButton>
                    <PrimaryButton
                      subtle
                      onClick={() => {
                        // go back to step 0, but keep the vibe lightweight
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
                  <div className="text-xl" style={{ fontWeight: 900, letterSpacing: -0.2, textAlign: "center" }}>
                    附近可以吃什麼
                  </div>
                  <div className="mt-4">
                    <PrimaryButton onClick={openMapsNearby}>用 Google Maps 開啟附近（依你的選擇）</PrimaryButton>
                    {geoStatus ? (
                      <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                        {geoStatus}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-5 space-y-3">
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
                        onClick={() => {
                          saveEnergy(p.name);
                          setScreen("energy");
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-base" style={{ fontWeight: 900 }}>
                              {p.name}
                            </div>
                            <div className="mt-1 text-sm" style={{ color: warm.sub }}>
                              {p.distance} ・ {style === "rich" ? "偏重口" : "偏清爽"}
                            </div>
                          </div>
                          <div
                            className="h-9 w-9 rounded-2xl flex items-center justify-center"
                            style={{
                              background: "rgba(255,138,61,0.12)",
                              border: "1px solid rgba(255,138,61,0.22)",
                            }}
                          >
                            <span style={{ fontWeight: 900, color: warm.orange }} aria-hidden>
                              {"→"}
                            </span>
                          </div>
                        </div>
                      </motion.button>
                    ))}
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
                  <div className="text-xl" style={{ fontWeight: 900, letterSpacing: -0.2, textAlign: "center" }}>
                    留下這次的食力
                  </div>
                  <div className="mt-2 text-sm" style={{ color: warm.sub, textAlign: "center" }}>
                    不用每天。想記再記。
                  </div>

                  <div className="mt-6 flex items-center justify-center">
                    <EnergyCore mode="satisfied" accent={clamp(0.35 + richness * 0.65, 0, 1)} size={240} />
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
                      <div className="text-xl" style={{ fontWeight: 900, letterSpacing: -0.2 }}>
                        我的食力
                      </div>
                      <div className="mt-2 text-sm" style={{ color: warm.sub }}>
                        不是日記，而是回顧你的飲食狀態。
                      </div>
                    </div>
                    <button
                      className="rounded-2xl px-3 py-2 text-sm"
                      style={{
                        border: "1px solid rgba(30,31,36,0.10)",
                        background: "rgba(255,255,255,0.72)",
                        color: warm.text,
                        fontWeight: 800,
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
                        <div className="text-base" style={{ fontWeight: 900 }}>
                          還沒有食力
                        </div>
                        <div className="mt-4">
                          <PrimaryButton onClick={goHome}>回首頁</PrimaryButton>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-3">
                        {log.map((e, idx) => (
                          <motion.div
                            key={e.id}
                            className="rounded-2xl p-3"
                            style={{
                              border: "1px solid rgba(30,31,36,0.10)",
                              background: "rgba(255,255,255,0.72)",
                              boxShadow: "0 12px 26px rgba(20,20,20,0.06)",
                            }}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: Math.min(idx * 0.02, 0.12) }}
                          >
                            <div className="flex items-center justify-center py-2">
                              <EnergyCore mode="stable" accent={e.sig?.warmth ?? 0.6} size={140} />
                            </div>
                            <div className="mt-1 text-xs" style={{ color: warm.sub }}>
                              {fmtDate(e.at)}
                            </div>
                            <div className="mt-1 text-sm" style={{ fontWeight: 900 }}>
                              {e.choiceText ? e.choiceText : "（未選餐廳）"}
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
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-6 space-y-3">
                    <PrimaryButton onClick={goHome}>再覓食一次</PrimaryButton>
                    <PrimaryButton subtle onClick={() => setScreen("home")}>
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
