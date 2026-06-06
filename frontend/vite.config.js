import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const envDir = resolve(__dirname, '..');
  void mode;

  return {
    envDir,
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      allowedHosts: ['.rustplusplus.com'],
      // 本地开发：把 WebSocket(socket.io) 代理到后端 3000（前后端分端口时实时层才能连上）
      proxy: {
        '/socket.io': { target: 'http://localhost:3000', ws: true },
      },
    },
  };
});
