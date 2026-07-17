const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;

function simulateSpotifyFetch(params) {
  console.log('Fetching with params:', params);
  
  if (params.after && params.before) {
    throw new Error('Only one of before or after can be specified');
  }
  
  // Tracks in reverse chronological order (newest first).
  const allItems = [
    { played_at: new Date(400).toISOString(), track: { duration_ms: 1000 } },
    { played_at: new Date(300).toISOString(), track: { duration_ms: 1000 } },
    { played_at: new Date(200).toISOString(), track: { duration_ms: 1000 } },
    { played_at: new Date(100).toISOString(), track: { duration_ms: 1000 } },
  ];
  
  // Simulate pagination
  if (!params.before) {
    return {
      items: [allItems[0], allItems[1]],
      cursors: { before: '300' }
    };
  } else if (params.before === '300') {
    return {
      items: [allItems[2], allItems[3]],
      cursors: { before: '100' }
    };
  }
  return { items: [] };
}

async function doMeasureListeningMsSince(sinceMs) {
  let totalMs = 0;
  let before = undefined;

  try {
    for (let page = 0; page < 8; page++) {
      const params = { limit: '50' };
      if (before) params.before = before;

      const data = simulateSpotifyFetch(params);

      if (!data.items?.length) break;

      let reachedCutoff = false;
      for (const item of data.items) {
        const playedAt = new Date(item.played_at).getTime();
        if (playedAt <= sinceMs) {
          reachedCutoff = true;
          continue;
        }
        totalMs += item.track.duration_ms && item.track.duration_ms > 0
          ? item.track.duration_ms
          : DEFAULT_TRACK_MS;
      }

      const oldest = data.items[data.items.length - 1];
      if (!oldest || reachedCutoff) break;

      const oldestTime = new Date(oldest.played_at).getTime();
      if (oldestTime <= sinceMs) break;

      const nextBefore = data.cursors?.before ?? oldest.played_at;
      if (nextBefore === before) break;
      before = nextBefore;
    }
  } catch (err) {
    console.warn('[tracks] measureListeningMsSince failed:', err.message);
  }

  return totalMs;
}

doMeasureListeningMsSince(150).then(console.log);
