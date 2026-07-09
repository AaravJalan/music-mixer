import type { SharedArtist } from '@music-mixer/shared';

interface SharedArtistsListProps {
  artists: SharedArtist[];
}

export function SharedArtistsList({ artists }: SharedArtistsListProps) {
  if (artists.length === 0) {
    return (
      <p className="text-sm text-white/45 text-center py-4">
        No shared top artists — your charts don&apos;t overlap in this window.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {artists.map((artist, index) => (
        <li
          key={artist.id}
          className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.03] border border-white/8"
        >
          <span className="text-[10px] text-white/30 w-4 shrink-0">{index + 1}</span>
          {artist.imageUrl ? (
            <img src={artist.imageUrl} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-accent-purple/20 flex items-center justify-center text-xs text-white/50 shrink-0">
              {artist.name.charAt(0)}
            </div>
          )}
          <span className="text-xs text-white/80 truncate">{artist.name}</span>
        </li>
      ))}
    </ul>
  );
}
