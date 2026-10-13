import path from 'path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

import runtimeErrorOverlay from '@replit/vite-plugin-runtime-error-modal';
import { atomicBridgePlugin } from './server/atomic-bridge.mjs';

const managed = process.env.REPL_ID !== undefined;
const port = Number(process.env.PORT || 5173);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || '/';

export default defineConfig({
  base: basePath,
  define: {
    'import.meta.env.PIXELSTUDIO_LOCAL_BRIDGE': JSON.stringify(!managed),
  },
  plugins: [
    react(),
    tailwindcss(),
    ...(!managed ? [atomicBridgePlugin(basePath)] : [runtimeErrorOverlay()]),
    ...(process.env.NODE_ENV !== 'production' &&
    process.env.REPL_ID !== undefined
      ? [
          await import('@replit/vite-plugin-cartographer').then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, '..'),
            }),
          ),
          await import('@replit/vite-plugin-dev-banner').then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@assets': path.resolve(
        import.meta.dirname,
        '..',
        '..',
        'attached_assets',
      ),
    },
    dedupe: ['react', 'react-dom'],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, 'dist/public'),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: managed ? '0.0.0.0' : '127.0.0.1',
    allowedHosts: managed ? true : ['localhost'],
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: managed ? '0.0.0.0' : '127.0.0.1',
    allowedHosts: managed ? true : ['localhost'],
  },
});
