import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth';
import collisionRoutes from './routes/collision';
import healthRoutes from './routes/health';
import friendsRoutes from './routes/friends';
import dashboardRoutes from './routes/dashboard';
import playlistRoutes from './routes/playlist';
import sandboxRoutes from './routes/sandbox';
import { telemetryMiddleware } from './middleware/telemetry';
import { rateLimiter } from './middleware/rateLimiter';
import { env } from './config/env';

export function createApp() {
  const app = express();

  const allowedOrigins = [
    env.frontendUrl,
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://localhost:5173',
    'http://localhost:5174',
  ];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));
  app.use(express.json());
  app.use(cookieParser());

  // Disable Vercel/CDN caching globally for all API routes
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    next();
  });

  app.use(telemetryMiddleware);
  app.use(rateLimiter);

  app.use('/api/health', healthRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/collision', collisionRoutes);
  app.use('/api/friends', friendsRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/playlist', playlistRoutes);
  app.use('/api/sandbox', sandboxRoutes);

  return app;
}
