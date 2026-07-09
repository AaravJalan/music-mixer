import type { TrackFeature } from '@music-mixer/shared';

interface CacheEntry {
  value: TrackFeature;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

class InMemoryAudioFeatureCache {
  private store = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  get(trackId: string): TrackFeature | null {
    const entry = this.store.get(trackId);
    if (!entry) {
      this.misses++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(trackId);
      this.misses++;
      return null;
    }
    this.hits++;
    return entry.value;
  }

  set(trackId: string, feature: TrackFeature, ttlMs = DEFAULT_TTL_MS): void {
    this.store.set(trackId, { value: feature, expiresAt: Date.now() + ttlMs });
  }

  getMany(trackIds: string[]): { cached: TrackFeature[]; missing: string[] } {
    const cached: TrackFeature[] = [];
    const missing: string[] = [];
    for (const id of trackIds) {
      const hit = this.get(id);
      if (hit) cached.push(hit);
      else missing.push(id);
    }
    return { cached, missing };
  }

  getStats() {
    const total = this.hits + this.misses;
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: total === 0 ? 0 : this.hits / total,
    };
  }
}

export const audioFeatureCache = new InMemoryAudioFeatureCache();
