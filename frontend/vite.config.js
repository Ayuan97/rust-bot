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
    },
  };
});
