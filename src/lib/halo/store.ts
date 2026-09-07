import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_PARAMS, DEFAULT_SPAWN, type Params, type Spawn } from "./math";

export type Holding = {
  qty: number;
};

export type HaloState = {
  symbol: string;
  tab: "today" | "compare" | "wallet" | "settings";
  params: Params;
  spawn: Spawn;
  cash: number;
  holdings: Record<string, Holding>;
  lastOptimize: { at: number; score: number; alpha: number } | null;
  setSymbol: (symbol: string) => void;
  setTab: (tab: HaloState["tab"]) => void;
  setParams: (params: Params) => void;
  setSpawn: (patch: Partial<Spawn>) => void;
  applyTarget: (symbol: string, price: number, targetWeight: number) => { ok: boolean; note: string };
  injectMonth: () => void;
  resetPaper: () => void;
  setOptimize: (score: number, alpha: number) => void;
};

const KEY = "halo-v1";

export const useHalo = create<HaloState>()(
  persist(
    (set, get) => ({
      symbol: "BTCUSDT",
      tab: "today",
      params: DEFAULT_PARAMS,
      spawn: DEFAULT_SPAWN,
      cash: DEFAULT_SPAWN.seed,
      holdings: {},
      lastOptimize: null,
      setSymbol: (symbol) => set({ symbol }),
      setTab: (tab) => set({ tab }),
      setParams: (params) => set({ params }),
      setSpawn: (patch) => set({ spawn: { ...get().spawn, ...patch } }),
      applyTarget: (symbol, price, targetWeight) => {
        if (!(price > 0)) return { ok: false, note: "价格无效" };
        const { cash, holdings, spawn } = get();
        const qty = holdings[symbol]?.qty ?? 0;
        const others = Object.entries(holdings).reduce((sum, [k, h]) => {
          if (k === symbol) return sum;
          return sum + h.qty; // valued only for current symbol action
        }, 0);
        void others;
        const equity = cash + qty * price;
        const targetVal = Math.max(0, Math.min(1, targetWeight)) * equity;
        const delta = targetVal - qty * price;
        if (Math.abs(delta) < spawn.minOrder) {
          return { ok: false, note: "差额太小，先不用动" };
        }
        if (delta > 0) {
          const spend = Math.min(cash, delta);
          if (spend < spawn.minOrder) return { ok: false, note: "现金不足" };
          const add = (spend * (1 - spawn.fee)) / price;
          set({
            cash: cash - spend,
            holdings: { ...holdings, [symbol]: { qty: qty + add } },
          });
          return { ok: true, note: "已按建议加仓" };
        }
        const sellVal = Math.min(qty * price, -delta);
        if (sellVal < spawn.minOrder) return { ok: false, note: "可减仓位太少" };
        const sellQty = sellVal / price;
        set({
          cash: cash + sellVal * (1 - spawn.fee),
          holdings: { ...holdings, [symbol]: { qty: Math.max(0, qty - sellQty) } },
        });
        return { ok: true, note: "已按建议减仓" };
      },
      injectMonth: () => {
        const { cash, spawn } = get();
        set({ cash: cash + spawn.monthly });
      },
      resetPaper: () => {
        const { spawn } = get();
        set({ cash: spawn.seed, holdings: {}, lastOptimize: null, params: DEFAULT_PARAMS });
      },
      setOptimize: (score, alpha) =>
        set({ lastOptimize: { at: Date.now(), score, alpha } }),
    }),
    { name: KEY },
  ),
);
