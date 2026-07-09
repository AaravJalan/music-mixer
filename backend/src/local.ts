/**
 * Local development entry point.
 *
 * Starts the Express app on a local TCP port.
 * This file is ONLY used for `npm run dev` — it is NOT deployed to Lambda.
 * The Lambda entry point is lambda.ts, which wraps the same app via serverless-http.
 */
import dns from 'node:dns';
import { createApp } from './app';
import { env } from './config/env';

// Prefer IPv4 — Node may try IPv6 first and fail with EHOSTUNREACH on some networks.
dns.setDefaultResultOrder('ipv4first');

const app = createApp();

const server = app.listen(env.port, '127.0.0.1', () => {
  console.log(`MusicMixer API running on http://127.0.0.1:${env.port}`);
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${env.port} is already in use.`);
    console.error(`Run: node scripts/kill-dev-ports.mjs\n`);
    process.exit(1);
  }
  throw err;
});

function shutdown(signal: string): void {
  console.log(`\n${signal} received — shutting down gracefully`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
