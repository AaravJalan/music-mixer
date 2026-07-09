import { useState } from 'react';
import type { DashboardTopArtist, DashboardTopTrack } from '@music-mixer/shared';
import { Button } from '../ui/Button';

const PAGE_SIZE = 5;
const MAX_ITEMS = 20;

function RankBadge({ rank }: { rank: number }) {
  const colors =
    rank === 1 ? 'bg-amber-400 text-black' :
    rank === 2 ? 'bg-gray-300 text-black' :
    rank === 3 ? 'bg-amber-700 text-white' :
    'bg-white/10 text-white/60';

  return (
    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${colors}`}>
      {rank}
    </span>
  );
}

function PlaceholderArt({ name }: { name: string }) {
  return (
    <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-accent-purple/40 to-accent-pink/40 flex items-center justify-center text-lg font-bold text-white/80 shrink-0">
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function LoadMoreButton({ visible, total, onClick }: { visible: number; total: number; onClick: () => void }) {
  if (visible >= total || visible >= MAX_ITEMS) return null;
  const next = Math.min(visible + PAGE_SIZE, MAX_ITEMS, total);
  return (
    <Button variant="ghost" size="sm" onClick={onClick} className="w-full mt-3">
      Load {next - visible} more
    </Button>
  );
}

export function TopArtistsList({ artists }: { artists: DashboardTopArtist[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const capped = artists.slice(0, MAX_ITEMS);
  const shown = capped.slice(0, visible);

  if (capped.length === 0) {
    return <p className="text-white/40 text-sm">No top artists for this period.</p>;
  }

  return (
    <>
      <ol className="space-y-2">
        {shown.map((artist) => (
          <li
            key={artist.id}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <RankBadge rank={artist.rank} />
            {artist.imageUrl ? (
              <img
                src={artist.imageUrl}
                alt=""
                className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-white/10"
              />
            ) : (
              <PlaceholderArt name={artist.name} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{artist.name}</p>
              {artist.primaryGenre && (
                <p className="text-[11px] text-white/40 truncate">{artist.primaryGenre}</p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <LoadMoreButton visible={visible} total={capped.length} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
    </>
  );
}

export function TopTracksList({ tracks }: { tracks: DashboardTopTrack[] }) {
  const [visible, setVisible] = useState(PAGE_SIZE);
  const capped = tracks.slice(0, MAX_ITEMS);
  const shown = capped.slice(0, visible);

  if (capped.length === 0) {
    return <p className="text-white/40 text-sm">No top tracks for this period.</p>;
  }

  return (
    <>
      <ol className="space-y-2">
        {shown.map((track) => (
          <li
            key={track.id}
            className="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <RankBadge rank={track.rank} />
            {track.albumArtUrl ? (
              <img
                src={track.albumArtUrl}
                alt=""
                className="w-12 h-12 rounded-lg object-cover shrink-0 ring-2 ring-white/10"
              />
            ) : (
              <PlaceholderArt name={track.name} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium truncate">{track.name}</p>
              <p className="text-[11px] text-white/40 truncate">
                {track.artist} · score {track.playScore}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <LoadMoreButton visible={visible} total={capped.length} onClick={() => setVisible((v) => v + PAGE_SIZE)} />
    </>
  );
}
