import type { GenreStat } from '@music-mixer/shared';

interface GenreChartProps {
  genres: GenreStat[];
  title?: string;
  highlight?: string[];
}

export function GenreChart({ genres, title, highlight = [] }: GenreChartProps) {
  if (genres.length === 0) {
    return <p className="text-white/40 text-sm">No genre data available yet.</p>;
  }

  const max = genres[0]?.count ?? 1;
  const highlightSet = new Set(highlight);

  return (
    <div>
      {title && <h3 className="text-sm font-medium text-white/60 mb-3">{title}</h3>}
      <div className="space-y-4">
        {genres.map((g) => (
          <div key={g.genre}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className={highlightSet.has(g.genre) ? 'text-accent-cyan font-medium' : 'text-white/70'}>
                {formatGenre(g.genre)}
                {highlightSet.has(g.genre) && ' ✦'}
              </span>
              <span className="text-white/40">{g.percentage}%</span>
            </div>
            <div className="h-2.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className={`h-full rounded-full ${highlightSet.has(g.genre) ? 'bg-accent-cyan' : 'bg-accent-purple/70'}`}
                style={{ width: `${(g.count / max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatGenre(genre: string): string {
  return genre.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
