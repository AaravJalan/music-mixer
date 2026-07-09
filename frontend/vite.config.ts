import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/** Edge/Chrome partition cookies differently — force 127.0.0.1 so OAuth cookies stick. */
function localhostRedirect(): Plugin {
  return {
    name: 'localhost-redirect',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const host = req.headers.host ?? '';
        if (host.startsWith('localhost:')) {
          res.writeHead(302, { Location: `http://127.0.0.1:${host.split(':')[1] ?? '5173'}${req.url ?? '/'}` });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localhostRedirect()],
  resolve: {
    alias: {
      '@music-mixer/shared': path.resolve(__dirname, '../packages/shared/src/index.ts'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => {
            const cookies = proxyRes.headers['set-cookie'];
            if (cookies) {
              proxyRes.headers['set-cookie'] = cookies.map((cookie) =>
                cookie
                  .replace(/;?\s*Domain=[^;]*/gi, '')
                  .replace(/;?\s*Secure/gi, '')
                  .replace(/;?\s*SameSite=[^;]*/gi, '; SameSite=Lax'),
              );
            }
          });
        },
      },
    },
  },
});
