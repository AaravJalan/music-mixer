import type { DashboardInsights } from '@music-mixer/shared';

interface ListeningStoryProps {
  insights: DashboardInsights;
}

const STORY_ACCENTS = [
  'bg-accent-pink/40',
  'bg-accent-purple/40',
  'bg-accent-cyan/40',
  'bg-amber-400/40',
  'bg-emerald-400/40',
  'bg-rose-400/40',
];

export function ListeningStory({ insights }: ListeningStoryProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={[
            'text-xs px-2.5 py-1 rounded-full border',
            insights.listeningStyle === 'focused'
              ? 'bg-accent-purple/15 border-accent-purple/30 text-accent-purple'
              : 'bg-accent-cyan/15 border-accent-cyan/30 text-accent-cyan',
          ].join(' ')}
        >
          {insights.listeningStyle === 'focused' ? 'Focused listener' : 'Genre explorer'}
        </span>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {insights.summaries.map((line, index) => (
          <div
            key={line}
            className="flex gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/8 hover:border-white/15 transition-colors"
          >
            <span
              className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${STORY_ACCENTS[index % STORY_ACCENTS.length]}`}
              aria-hidden
            />
            <p className="text-sm text-white/75 leading-snug">{line}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
