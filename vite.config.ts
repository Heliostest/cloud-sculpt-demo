import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  server: { port: 3001 },
  preview: { port: 3002 },
  build: { target: 'es2022' },
});
