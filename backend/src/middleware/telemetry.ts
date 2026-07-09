import type { Request, Response, NextFunction } from 'express';

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
  const latencies = state.recommendationLatencies;
  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : 0;

  return {
    recommendationLatencyMs,
    avgRecommendationLatencyMs: Math.round(avgLatency * 100) / 100,
    totalRequests: state.totalRequests,
  };
}
