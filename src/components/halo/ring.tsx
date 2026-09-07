type RingProps = {
  value: number;
  label: string;
  sub: string;
};

export function HaloRing({ value, label, sub }: RingProps) {
  const pct = Math.max(0, Math.min(1, value));
  const size = 236;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * pct;
  return (
    <div className="relative mx-auto grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-track)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          className="transition-[stroke-dasharray] duration-500 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <p className="text-[11px] font-medium tracking-wide text-muted">{label}</p>
        <p className="mt-1 font-display text-[56px] font-semibold leading-none tracking-tight text-fg tabular-nums">
          {Math.round(pct * 100)}
          <span className="text-[22px] font-medium text-muted">%</span>
        </p>
        <p className="mt-2 max-w-[9.5rem] text-[13px] leading-snug text-subtle">{sub}</p>
      </div>
    </div>
  );
}
