import { motion } from 'framer-motion';

interface ScoreRingProps {
  score: number;
  label: string;
  size?: 'default' | 'compact';
}

export function ScoreRing({ score, label, size = 'default' }: ScoreRingProps) {
  const percentage = Math.round(score * 100);
  const compact = size === 'compact';
  const svgSize = compact ? 180 : 187;
  const radius = compact ? 68 : 78;
  const stroke = compact ? 9 : 10;
  const center = svgSize / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score * circumference);

  return (
    <div className="relative flex flex-col items-center">
      <svg width={svgSize} height={svgSize} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ff2d6a" />
            <stop offset="50%" stopColor="#8b5cf6" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-4xl font-bold text-gradient"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
        >
          {percentage}%
        </motion.span>
        <span className="text-white/50 mt-1 text-sm">{label}</span>
      </div>
    </div>
  );
}

export function getCompatibilityLabel(score: number): string {
  if (score >= 0.95) return 'Soulmates';
  if (score >= 0.85) return 'Perfect Harmony';
  if (score >= 0.75) return 'Great Match';
  if (score >= 0.60) return 'Solid Vibe';
  if (score >= 0.45) return 'Interesting Mix';
  if (score >= 0.30) return 'Opposites Attract';
  return 'Chaotic Energy';
}
