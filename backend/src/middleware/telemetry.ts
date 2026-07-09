import type { Request, Response, NextFunction } from 'express';
import { audioFeatureCache } from '../services/cache/audioFeatures';

interface TelemetryState {
  recommendationLatencies: number[];
  totalRequests: number;
}

const state: TelemetryState = {
  recommendationLatencies: [],
  totalRequests: 0,
};

export function recordRecommendationLatency(ms: number): void {
  state.recommendationLatencies.push(ms);
  if (state.recommendationLatencies.length > 100) {
    state.recommendationLatencies.shift();
  }
}

export function telemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  state.totalRequests++;
  const start = performance.now();

  const originalEnd = res.end.bind(res);
  res.end = ((...args: Parameters<typeof res.end>) => {
    const elapsed = performance.now() - start;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${elapsed.toFixed(2)}ms`);
    }
    return originalEnd(...args);
  }) as typeof res.end;

  next();
}

export function getMetricsSnapshot(recommendationLatencyMs: number) {
  const cacheStats = audioFeatureCache.getStats();
  return {
    recommendationLatencyMs,
    cacheHitRate: cacheStats.hitRate,
    cacheHits: cacheStats.hits,
    cacheMisses: cacheStats.misses,
    totalRequests: state.totalRequests,
  };
}
