type Props = {
  score: number;
};

const ZONES = [
  { label: "Freeze", color: "#1d4ed8" },
  { label: "Cool", color: "#4f46e5" },
  { label: "Build", color: "#06b6d4" },
  { label: "Warm", color: "#a855f7" },
  { label: "Hot", color: "#ec4899" },
  { label: "Euphoria", color: "#fb7185" },
] as const;

function polar(cx: number, cy: number, r: number, angleRad: number) {
  return {
    x: cx + r * Math.cos(angleRad),
    y: cy - r * Math.sin(angleRad),
  };
}

function arcStroke(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0);
  const p1 = polar(cx, cy, r, a1);
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y}`;
}

function zoneIndex(score: number) {
  if (score >= 100) return 5;
  return Math.min(5, Math.floor((score / 100) * ZONES.length));
}

/**
 * Semicircular hype gauge (Fear-&-Greed style): zones + needle, compact for the Current Hype row.
 */
export default function HypeGauge({ score }: Props) {
  const s = Math.max(0, Math.min(100, score));
  const cx = 100;
  const cy = 100;
  const rTrack = 82;
  const strokeW = 11;
  const needleAngle = Math.PI * (1 - s / 100);
  const needleLen = 68;
  const tip = polar(cx, cy, needleLen, needleAngle);
  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="relative flex w-full max-w-[15.5rem] flex-col items-center overflow-visible">
      <svg
        viewBox="-15 0 230 112"
        className="h-auto w-full shrink-0 overflow-visible drop-shadow-[0_0_20px_rgba(34,211,238,0.08)]"
        role="img"
        aria-label={`Hype gauge at ${s} out of 100`}
      >
        <defs>
          <linearGradient id="hypeGaugeTrack" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#334155" />
            <stop offset="100%" stopColor="#475569" />
          </linearGradient>
        </defs>
        {/* Wider viewBox gives both side margins so ticks remain visible while staying centered. */}
        <path
          d={arcStroke(cx, cy, rTrack, Math.PI, 0)}
          fill="none"
          stroke="url(#hypeGaugeTrack)"
          strokeWidth={strokeW}
          strokeLinecap="round"
          opacity={0.55}
        />
        {ZONES.map((zone, i) => {
          const a0 = Math.PI * (1 - i / ZONES.length);
          const a1 = Math.PI * (1 - (i + 1) / ZONES.length);
          return (
            <path
              key={zone.label}
              d={arcStroke(cx, cy, rTrack, a0, a1)}
              fill="none"
              stroke={zone.color}
              strokeWidth={strokeW - 2}
              strokeLinecap="butt"
              opacity={0.95}
            />
          );
        })}
        {ticks.map((t) => {
          const a = Math.PI * (1 - t / 100);
          const outer = polar(cx, cy, rTrack + strokeW / 2 + 9, a);
          return (
            <text
              key={t}
              x={outer.x}
              y={outer.y}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-slate-500"
              style={{ fontSize: 9, fontWeight: 600 }}
            >
              {t}
            </text>
          );
        })}
        <line
          x1={cx}
          y1={cy}
          x2={tip.x}
          y2={tip.y}
          stroke="#f8fafc"
          strokeWidth={2.25}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={5} fill="#0f172a" stroke="#e2e8f0" strokeWidth={1.5} />
      </svg>
      <p className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {ZONES[zoneIndex(s)].label}
      </p>
    </div>
  );
}
