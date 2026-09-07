export type Params = {
  wp: number;
  wv: number;
  wa: number;
  beta: number;
  gamma: number;
};

export type MarketTone = "quiet" | "up" | "down";

export type Spawn = {
  seed: number;
  monthly: number;
  fee: number;
  minOrder: number;
};

export type SimPoint = {
  t: number;
  nav: number;
  dca: number;
};

export type SimResult = {
  points: SimPoint[];
  roi: number;
  dcaRoi: number;
  alpha: number;
  maxDd: number;
  dcaMaxDd: number;
  score: number;
  fatal: boolean;
};

export const DEFAULT_PARAMS: Params = {
  wp: 0.85,
  wv: -0.45,
  wa: 0.25,
  beta: 1.15,
  gamma: 0.35,
};

export const DEFAULT_SPAWN: Spawn = {
  seed: 10_000,
  monthly: 1000,
  fee: 0.001,
  minOrder: 12,
};

const EMA = 21;
const STD = 21;

function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

export function emaLast(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = values[0]!;
  for (let i = 1; i < values.length; i++) e = values[i]! * k + e * (1 - k);
  return e;
}

export function sampleStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  let s = 0;
  for (const v of values) s += (v - mean) ** 2;
  return Math.sqrt(s / (values.length - 1));
}

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const a = closes[i - 1]!;
    const b = closes[i]!;
    if (a > 0 && b > 0) out.push(Math.log(b / a));
  }
  return out;
}

export function features(closes: number[]): { p: number; v: number; a: number } {
  const n = closes.length;
  if (n < EMA + 2) return { p: 0, v: 0, a: 0 };
  const window = closes.slice(-Math.max(STD + 2, EMA + 2));
  const price = window[window.length - 1]!;
  const mean = emaLast(window, EMA);
  const rets = logReturns(window);
  const sigma = Math.max(sampleStd(window.slice(-STD)), 1e-8);
  const rSigma = Math.max(sampleStd(rets.slice(-STD)), 1e-8);
  const v = rets.length ? rets[rets.length - 1]! / rSigma : 0;
  const vPrev = rets.length > 1 ? rets[rets.length - 2]! / rSigma : 0;
  const p = (price - mean) / sigma;
  return { p, v, a: v - vPrev };
}

export function signalOf(closes: number[], params: Params): number {
  const f = features(closes);
  return params.wp * f.p + params.wv * f.v + params.wa * f.a;
}

export function targetWeight(
  signal: number,
  currentWeight: number,
  params: Params,
): number {
  const beta = Math.max(0.01, params.beta);
  const bias = clamp(currentWeight, 0, 1) - 0.5;
  const exponent = beta * signal + params.gamma * bias;
  return clamp(1 / (1 + Math.exp(exponent)), 0, 1);
}

export function marketTone(closes: number[]): MarketTone {
  const f = features(closes);
  const energy = Math.abs(f.v) + Math.abs(f.a) * 0.6;
  if (energy < 0.35) return "quiet";
  if (f.v > 0 && f.a >= -0.15) return "up";
  return "down";
}

export function maxDrawdown(nav: number[]): number {
  let peak = nav[0] ?? 0;
  let dd = 0;
  for (const v of nav) {
    if (v > peak) peak = v;
    if (peak > 0) dd = Math.max(dd, (peak - v) / peak);
  }
  return dd;
}

function monthKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
}

function modifiedDietz(start: number, end: number, cashflows: { t: number; amt: number }[], t0: number, t1: number) {
  const span = Math.max(1, t1 - t0);
  let weighted = 0;
  let sum = 0;
  for (const cf of cashflows) {
    sum += cf.amt;
    const w = (t1 - cf.t) / span;
    weighted += cf.amt * clamp(w, 0, 1);
  }
  const den = start + weighted;
  if (den <= 0) return 0;
  return (end - start - sum) / den;
}

export function simulate(
  closes: number[],
  times: number[],
  params: Params,
  spawn: Spawn,
): SimResult {
  const n = Math.min(closes.length, times.length);
  const warmup = Math.min(40, Math.floor(n * 0.2));
  const start = Math.max(warmup, EMA + 4);
  if (n - start < 20) {
    return {
      points: [],
      roi: 0,
      dcaRoi: 0,
      alpha: 0,
      maxDd: 0,
      dcaMaxDd: 0,
      score: -1,
      fatal: false,
    };
  }

  let cash = spawn.seed;
  let qty = 0;
  let dcaCash = 0;
  let dcaQty = spawn.seed / closes[start]!;
  let injected = 0;
  const cfs: { t: number; amt: number }[] = [];
  const dcaCfs: { t: number; amt: number }[] = [];
  const nav: number[] = [];
  const dcaNav: number[] = [];
  const points: SimPoint[] = [];
  let lastMonth = monthKey(times[start]!);

  for (let i = start; i < n; i++) {
    const price = closes[i]!;
    const t = times[i]!;
    const month = monthKey(t);
    if (month !== lastMonth) {
      cash += spawn.monthly;
      dcaCash += spawn.monthly;
      injected += spawn.monthly;
      cfs.push({ t, amt: spawn.monthly });
      dcaCfs.push({ t, amt: spawn.monthly });
      lastMonth = month;
    }

    if (dcaCash > spawn.minOrder) {
      const buy = dcaCash * (1 - spawn.fee);
      dcaQty += buy / price;
      dcaCash = 0;
    }

    const slice = closes.slice(0, i + 1);
    const equity = cash + qty * price;
    const currentW = equity > 0 ? (qty * price) / equity : 0;
    const sig = signalOf(slice, params);
    let tw = targetWeight(sig, currentW, params);
    const tone = marketTone(slice);
    if (tone === "quiet") {
      const deltaW = tw - currentW;
      if (Math.abs(deltaW) < 0.04) tw = currentW;
    }
    const targetVal = tw * equity;
    const deltaVal = targetVal - qty * price;
    if (Math.abs(deltaVal) >= spawn.minOrder) {
      if (deltaVal > 0) {
        const spend = Math.min(cash, deltaVal);
        if (spend >= spawn.minOrder) {
          qty += (spend * (1 - spawn.fee)) / price;
          cash -= spend;
        }
      } else {
        const sellVal = Math.min(qty * price, -deltaVal);
        if (sellVal >= spawn.minOrder) {
          const sellQty = sellVal / price;
          qty -= sellQty;
          cash += sellVal * (1 - spawn.fee);
        }
      }
    }

    const e = cash + qty * price;
    const d = dcaCash + dcaQty * price;
    nav.push(e);
    dcaNav.push(d);
    if (i % 2 === 0 || i === n - 1) points.push({ t, nav: e, dca: d });
  }

  const t0 = times[start]!;
  const t1 = times[n - 1]!;
  const roi = modifiedDietz(spawn.seed, nav[nav.length - 1]!, cfs, t0, t1);
  const dcaRoi = modifiedDietz(spawn.seed, dcaNav[dcaNav.length - 1]!, dcaCfs, t0, t1);
  const dd = maxDrawdown(nav);
  const dcaDd = maxDrawdown(dcaNav);
  const fatal = dd >= 0.88;
  const alpha = roi - dcaRoi;
  const slice = fatal ? -99999 : alpha - 1.5 * Math.max(0, dd - dcaDd);
  return {
    points,
    roi,
    dcaRoi,
    alpha,
    maxDd: dd,
    dcaMaxDd: dcaDd,
    score: slice,
    fatal,
  };
}

function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}

export function sampleParams(): Params {
  return {
    wp: rand(-1.6, 1.6),
    wv: rand(-1.6, 1.6),
    wa: rand(-1.2, 1.2),
    beta: rand(0.4, 2.6),
    gamma: rand(0, 1.2),
  };
}

export function searchParams(
  closes: number[],
  times: number[],
  spawn: Spawn,
  rounds = 36,
): { params: Params; result: SimResult } {
  let bestParams = DEFAULT_PARAMS;
  let best = simulate(closes, times, bestParams, spawn);
  for (let i = 0; i < rounds; i++) {
    const p = sampleParams();
    const r = simulate(closes, times, p, spawn);
    if (r.score > best.score) {
      best = r;
      bestParams = p;
    }
  }
  return { params: bestParams, result: best };
}

export function toneLabel(tone: MarketTone): string {
  if (tone === "quiet") return "平静";
  if (tone === "up") return "上行";
  return "回落";
}
