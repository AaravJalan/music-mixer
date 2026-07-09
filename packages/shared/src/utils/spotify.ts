export const normalizeSpotifyId = (id: string) => id.replace(/^spotify:(artist|track):/, '').trim();
