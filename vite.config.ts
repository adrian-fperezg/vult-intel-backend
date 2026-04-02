import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(env.VITE_OUTREACH_API_URL || env.NEXT_PUBLIC_API_URL || ''),
      'process.env.NEXT_PUBLIC_APP_URL': JSON.stringify(env.FRONTEND_URL || env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            ui: ['framer-motion', 'lucide-react', 'recharts', 'reactflow'],
            vendor: ['react', 'react-dom', 'react-router-dom']
          }
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@shared': path.resolve(__dirname, './shared'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var
      // Do not modify file watching is disabled to prevent flickering during agent edits
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
