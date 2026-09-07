import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CircleDollarSign,
  House,
  Settings2,
  Sparkles,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getKlines, getTickers, type Ticker24h } from "@/lib/binance";
import type { Candle } from "@/lib/indicators";
import { DEFAULT_SYMBOL, WATCHLIST, findPair } from "@/lib/symbols";
import {
  DEFAULT_PARAMS,
  features,
  marketTone,
  searchParams,
  signalOf,
  simulate,
  targetWeight,
  toneLabel,
  type Params,
} from "@/lib/halo/math";
import { useHalo } from "@/lib/halo/store";
import { HaloRing } from "./ring";
import { CompareChart } from "./chart";

type Tab = "today" | "compare" | "wallet" | "settings";

function money(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 1000 ? 0 : 2 });
}

function pct(n: number) {
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}

function qtyFmt(n: number) {
  if (n >= 100) return n.toFixed(2);
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

export function HaloApp({
  initialTickers,
  initialCandles,
}: {
  initialTickers: Ticker24h[];
  initialCandles: Candle[];
}) {
  const symbol = useHalo((s) => s.symbol);
  const tab = useHalo((s) => s.tab);
  const params = useHalo((s) => s.params);
  const spawn = useHalo((s) => s.spawn);
  const cash = useHalo((s) => s.cash);
  const holdings = useHalo((s) => s.holdings);
  const lastOptimize = useHalo((s) => s.lastOptimize);
  const setSymbol = useHalo((s) => s.setSymbol);
  const setTab = useHalo((s) => s.setTab);
  const setParams = useHalo((s) => s.setParams);
  const setSpawn = useHalo((s) => s.setSpawn);
  const applyTarget = useHalo((s) => s.applyTarget);
  const injectMonth = useHalo((s) => s.injectMonth);
  const resetPaper = useHalo((s) => s.resetPaper);
  const setOptimize = useHalo((s) => s.setOptimize);

  const [note, setNote] = useState("现货模拟 · 不是投资建议");
  const [busy, setBusy] = useState(false);

  const tickersQ = useQuery({
    queryKey: ["halo-tickers"],
    queryFn: async () => {
      const res = await getTickers({ data: { symbols: WATCHLIST.map((p) => p.symbol).join(",") } });
      if (!res.ok) throw new Error(res.error);
      return res.tickers;
    },
    initialData: initialTickers,
    refetchInterval: 12_000,
  });

  const klinesQ = useQuery({
    queryKey: ["halo-klines", symbol],
    queryFn: async () => {
      const res = await getKlines({ data: { symbol, interval: "1d" } });
      if (!res.ok) throw new Error(res.error);
      return res.candles;
    },
    initialData: symbol === DEFAULT_SYMBOL && initialCandles.length ? initialCandles : undefined,
    staleTime: 60_000,
  });

  const pair = findPair(symbol);
  const ticker = (tickersQ.data ?? []).find((t) => t.symbol === symbol);
  const price = ticker?.lastPrice ?? klinesQ.data?.at(-1)?.close ?? 0;
  const changePct = ticker ? ticker.priceChangePercent / 100 : 0;
  const closes = useMemo(() => (klinesQ.data ?? []).map((c) => c.close), [klinesQ.data]);
  const times = useMemo(() => (klinesQ.data ?? []).map((c) => c.time), [klinesQ.data]);

  const qty = holdings[symbol]?.qty ?? 0;
  const positionVal = qty * price;
  const equity = cash + Object.entries(holdings).reduce((sum, [sym, h]) => {
    const t = (tickersQ.data ?? []).find((x) => x.symbol === sym);
    const px = t?.lastPrice ?? (sym === symbol ? price : 0);
    return sum + h.qty * px;
  }, 0);
  const currentW = equity > 0 ? positionVal / equity : 0;
  const sig = closes.length ? signalOf(closes, params) : 0;
  const tw = closes.length ? targetWeight(sig, currentW, params) : 0.5;
  const tone = closes.length ? marketTone(closes) : "quiet";
  const feat = closes.length ? features(closes) : { p: 0, v: 0, a: 0 };
  const sim = useMemo(() => {
    if (closes.length < 50) return null;
    return simulate(closes, times, params, spawn);
  }, [closes, times, params, spawn]);

  const deltaVal = tw * equity - positionVal;
  const action =
    Math.abs(deltaVal) < spawn.minOrder
      ? "对齐"
      : deltaVal > 0
        ? "加仓"
        : "减仓";

  function onAlign() {
    const res = applyTarget(symbol, price, tw);
    setNote(res.note);
  }

  function onOptimize() {
    if (closes.length < 50) {
      setNote("K 线还不够，稍后再试");
      return;
    }
    setBusy(true);
    setNote("正在对照定投搜索更好的仓位节奏…");
    window.setTimeout(() => {
      const found = searchParams(closes, times, spawn, 40);
      setParams(found.params);
      setOptimize(found.result.score, found.result.alpha);
      setBusy(false);
      setNote(
        found.result.score > 0
          ? `找到一组对照定投更好的节奏，超额 ${pct(found.result.alpha)}`
          : "这轮没跑赢定投，保持当前设置",
      );
    }, 40);
  }

  return (
    <div className="halo-shell">
      <div className="halo-phone">
        <header className="px-6 pt-7 pb-2">
          <p className="text-[13px] font-medium tracking-[0.08em] text-subtle">HALO</p>
          <div className="mt-1 flex items-end justify-between gap-3">
            <h1 className="font-display text-[28px] font-semibold tracking-tight text-fg">现货仓位</h1>
            <p className={`text-[13px] font-medium tabular-nums ${changePct >= 0 ? "text-up" : "text-down"}`}>
              {ticker ? `${changePct >= 0 ? "+" : ""}${ticker.priceChangePercent.toFixed(2)}%` : "—"}
            </p>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto px-6 pb-4 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WATCHLIST.slice(0, 6).map((p) => {
            const on = p.symbol === symbol;
            return (
              <button
                key={p.symbol}
                type="button"
                onClick={() => setSymbol(p.symbol)}
                className={`h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium transition-colors ${
                  on ? "bg-fg text-bg" : "bg-raised text-muted"
                }`}
              >
                {p.base}
              </button>
            );
          })}
        </div>

        <main className="flex-1 overflow-y-auto px-5 pb-28">
          {tab === "today" && (
            <section className="space-y-4">
              <div className="rounded-xl bg-card px-4 pb-6 pt-5 shadow-card">
                <HaloRing
                  value={tw}
                  label={`${pair.base} 建议持仓`}
                  sub={closes.length ? `${toneLabel(tone)}市 · 只做现货` : "正在读取行情"}
                />
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Stat k="现价" v={price ? `$${money(price)}` : "—"} />
                  <Stat k="当前持仓" v={`${Math.round(currentW * 100)}%`} />
                </div>
                <Button className="mt-5 h-12 w-full rounded-full text-[15px]" onClick={onAlign} disabled={!price}>
                  {action}到 {Math.round(tw * 100)}%
                </Button>
                <p className="mt-3 text-center text-[12px] text-subtle">{note}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Pill k="偏离" v={feat.p.toFixed(2)} />
                <Pill k="涨速" v={feat.v.toFixed(2)} />
                <Pill k="节奏" v={toneLabel(tone)} />
              </div>
            </section>
          )}

          {tab === "compare" && (
            <section className="space-y-4">
              <div className="rounded-xl bg-card p-5 shadow-card">
                <h2 className="text-[15px] font-semibold">对照无脑定投</h2>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  同一段日线、同一笔本金。蓝线是建议仓位，灰虚线是每月全买。
                </p>
                <div className="mt-4">
                  <CompareChart points={sim?.points ?? []} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <StatCard k="建议仓位收益" v={sim ? pct(sim.roi) : "—"} up={!!sim && sim.roi >= 0} />
                <StatCard k="定投收益" v={sim ? pct(sim.dcaRoi) : "—"} up={!!sim && sim.dcaRoi >= 0} />
                <StatCard k="相对定投" v={sim ? pct(sim.alpha) : "—"} up={!!sim && sim.alpha >= 0} />
                <StatCard k="最大回撤" v={sim ? pct(-sim.maxDd) : "—"} up={false} />
              </div>
              <p className="px-1 text-[12px] leading-relaxed text-subtle">
                跑不赢定投，就没有必要用这套节奏。优化只在这段历史上搜索，换一段行情可能失效。
              </p>
            </section>
          )}

          {tab === "wallet" && (
            <section className="space-y-4">
              <div className="rounded-xl bg-card p-5 shadow-card">
                <p className="text-[13px] text-muted">模拟总资产</p>
                <p className="mt-1 font-display text-[40px] font-semibold tracking-tight tabular-nums">
                  ${money(equity)}
                </p>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Stat k="现金" v={`$${money(cash)}`} />
                  <Stat k={`${pair.base} 数量`} v={qtyFmt(qty)} />
                </div>
                <div className="mt-5 flex gap-2">
                  <Button className="h-11 flex-1 rounded-full" variant="subtle" onClick={injectMonth}>
                    注入本月定投
                  </Button>
                  <Button className="h-11 flex-1 rounded-full" variant="outline" onClick={resetPaper}>
                    重置模拟
                  </Button>
                </div>
              </div>
              <div className="rounded-xl bg-card p-2 shadow-card">
                {WATCHLIST.slice(0, 6).map((p) => {
                  const q = holdings[p.symbol]?.qty ?? 0;
                  const t = (tickersQ.data ?? []).find((x) => x.symbol === p.symbol);
                  const px = t?.lastPrice ?? 0;
                  return (
                    <button
                      key={p.symbol}
                      type="button"
                      onClick={() => {
                        setSymbol(p.symbol);
                        setTab("today");
                      }}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-3 text-left"
                    >
                      <span className="text-[15px] font-medium">{p.base}</span>
                      <span className="text-right">
                        <span className="block text-[15px] font-medium tabular-nums">${money(px)}</span>
                        <span className="block text-[12px] text-subtle tabular-nums">{qtyFmt(q)}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {tab === "settings" && (
            <section className="space-y-4">
              <div className="rounded-xl bg-card p-5 shadow-card">
                <h2 className="text-[15px] font-semibold">本金与节奏</h2>
                <label className="mt-4 block text-[13px] text-muted">起始本金</label>
                <input
                  className="halo-field"
                  type="number"
                  min={100}
                  value={spawn.seed}
                  onChange={(e) => setSpawn({ seed: Number(e.target.value) || 0 })}
                />
                <label className="mt-4 block text-[13px] text-muted">每月定投</label>
                <input
                  className="halo-field"
                  type="number"
                  min={0}
                  value={spawn.monthly}
                  onChange={(e) => setSpawn({ monthly: Number(e.target.value) || 0 })}
                />
                <Button
                  className="mt-5 h-12 w-full rounded-full"
                  onClick={onOptimize}
                  disabled={busy}
                >
                  <Sparkles className="size-4" />
                  {busy ? "搜索中…" : "对照定投优化一次"}
                </Button>
                {lastOptimize && (
                  <p className="mt-3 text-[12px] text-subtle">
                    上次超额 {pct(lastOptimize.alpha)} · 综合评分 {lastOptimize.score.toFixed(3)}
                  </p>
                )}
              </div>
              <div className="rounded-xl bg-card p-5 shadow-card">
                <h2 className="text-[15px] font-semibold">敏感度</h2>
                <p className="mt-1 text-[13px] text-muted">越小越钝，越大越勤调仓。</p>
                <Knob
                  label="价格偏离"
                  value={params.wp}
                  min={-1.6}
                  max={1.6}
                  onChange={(wp) => setParams({ ...params, wp })}
                />
                <Knob
                  label="涨速"
                  value={params.wv}
                  min={-1.6}
                  max={1.6}
                  onChange={(wv) => setParams({ ...params, wv })}
                />
                <Knob
                  label="加减仓力度"
                  value={params.beta}
                  min={0.4}
                  max={2.6}
                  onChange={(beta) => setParams({ ...params, beta })}
                />
                <button
                  type="button"
                  className="mt-3 text-[13px] text-accent"
                  onClick={() => setParams(DEFAULT_PARAMS)}
                >
                  恢复默认
                </button>
              </div>
              <p className="px-1 pb-2 text-[12px] leading-relaxed text-subtle">
                Halo 只做现货模拟，密钥不会上传。建议仓位来自收盘价的偏离与涨速，不是预言。
              </p>
            </section>
          )}
        </main>

        <nav className="halo-tabbar">
          <TabBtn id="today" tab={tab} onClick={setTab} icon={<House className="size-[22px]" />} label="今日" />
          <TabBtn id="compare" tab={tab} onClick={setTab} icon={<CircleDollarSign className="size-[22px]" />} label="对照" />
          <TabBtn id="wallet" tab={tab} onClick={setTab} icon={<Wallet className="size-[22px]" />} label="钱包" />
          <TabBtn id="settings" tab={tab} onClick={setTab} icon={<Settings2 className="size-[22px]" />} label="设置" />
        </nav>
      </div>
    </div>
  );
}

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md bg-raised px-3 py-3">
      <p className="text-[11px] text-subtle">{k}</p>
      <p className="mt-0.5 text-[17px] font-semibold tabular-nums">{v}</p>
    </div>
  );
}

function Pill({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-lg bg-card px-3 py-3 text-center shadow-card">
      <p className="text-[11px] text-subtle">{k}</p>
      <p className="mt-0.5 text-[14px] font-medium tabular-nums">{v}</p>
    </div>
  );
}

function StatCard({ k, v, up }: { k: string; v: string; up: boolean }) {
  return (
    <div className="rounded-lg bg-card px-4 py-4 shadow-card">
      <p className="text-[12px] text-subtle">{k}</p>
      <p className={`mt-1 text-[22px] font-semibold tabular-nums ${up ? "text-up" : "text-down"}`}>{v}</p>
    </div>
  );
}

function Knob({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="mt-4 block">
      <span className="flex items-center justify-between text-[13px]">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-fg">{value.toFixed(2)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.05}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="halo-range mt-2"
      />
    </label>
  );
}

function TabBtn({
  id,
  tab,
  onClick,
  icon,
  label,
}: {
  id: Tab;
  tab: Tab;
  onClick: (t: Tab) => void;
  icon: ReactNode;
  label: string;
}) {
  const on = tab === id;
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      className={`flex min-h-11 flex-1 flex-col items-center gap-0.5 pt-1 text-[10px] font-medium ${
        on ? "text-accent" : "text-subtle"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
