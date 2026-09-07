import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SimPoint } from "@/lib/halo/math";

function fmtDay(t: number) {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

export function CompareChart({ points }: { points: SimPoint[] }) {
  if (points.length < 2) {
    return (
      <div className="flex h-52 items-center justify-center text-sm text-muted">
        行情加载后会显示对照曲线
      </div>
    );
  }
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="haloNav" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="t"
            tickFormatter={fmtDay}
            tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={fmtMoney}
            tick={{ fill: "var(--color-subtle)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "var(--color-raised)",
              border: "1px solid var(--color-border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(v) => new Date(Number(v)).toLocaleDateString("zh-CN")}
            formatter={(value, name) => [
              `$${fmtMoney(Number(value))}`,
              name === "nav" ? "建议仓位" : "无脑定投",
            ]}
          />
          <Area type="monotone" dataKey="nav" stroke="var(--color-accent)" fill="url(#haloNav)" strokeWidth={2} />
          <Line type="monotone" dataKey="dca" stroke="var(--color-muted)" strokeDasharray="4 4" strokeWidth={1.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
