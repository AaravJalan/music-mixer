import type { DailyListeningPoint } from '@music-mixer/shared';

interface ListeningLineChartProps {
  points: DailyListeningPoint[];
}

const W = 640;
const H = 200;
const PAD = { top: 16, right: 12, bottom: 24, left: 28 };

export function ListeningLineChart({ points }: ListeningLineChartProps) {
  if (points.length === 0) {
    return <p className="text-white/40 text-sm">No listening history yet.</p>;
  }

  const maxHours = Math.max(...points.map((p) => p.hours), 1);
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW);
  const y = (hours: number) => PAD.top + plotH - (hours / maxHours) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.hours).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${x(points.length - 1).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} L ${x(0).toFixed(1)} ${(PAD.top + plotH).toFixed(1)} Z`;

  const gridLines = [0, 0.5, 1];
  const tickEvery = Math.ceil(points.length / 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
      <defs>
        <linearGradient id="habitArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridLines.map((g) => {
        const gy = PAD.top + plotH - g * plotH;
        return (
          <g key={g}>
            <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
            <text x={4} y={gy + 3} fill="rgba(255,255,255,0.35)" fontSize={9}>
              {(g * maxHours).toFixed(1)}
            </text>
          </g>
        );
      })}

      <path d={areaPath} fill="url(#habitArea)" />
      <path d={linePath} fill="none" stroke="#c084fc" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {points.map((p, i) =>
        i % tickEvery === 0 ? (
          <text key={p.date} x={x(i)} y={H - 6} fill="rgba(255,255,255,0.35)" fontSize={9} textAnchor="middle">
            {p.date.slice(5)}
          </text>
        ) : null,
      )}
    </svg>
  );
}
