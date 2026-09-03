import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  base: './',
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, '.') },
      { find: /^three$/, replacement: 'three/src/Three.js' },
    ],
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome100', 'safari13'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          const normalized = id.split(path.sep).join('/');

          // three는 반드시 단일 청크로 유지한다.
          // src/renderers 등을 별도 청크로 쪼개면 three 내부 순환 참조 때문에
          // 청크 그래프에 사이클이 생겨 프로덕션 빌드에서만
          // "Cannot access 'X' before initialization" TDZ 오류로 3D 미리보기가 죽는다(회귀 주의).
          if (normalized.includes('/node_modules/three/')) return 'vendor-three';
          if (normalized.includes('/node_modules/pdfjs-dist/')) return 'vendor-pdfjs';
          if (
            normalized.includes('/node_modules/@tiptap/')
            || normalized.includes('/node_modules/prosemirror-')
            || normalized.includes('/node_modules/orderedmap/')
          ) {
            return 'vendor-tiptap';
          }
          if (
            normalized.includes('/node_modules/marked/')
            || normalized.includes('/node_modules/turndown/')
          ) {
            return 'vendor-markdown';
          }
          if (normalized.includes('/node_modules/highlight.js/')) return 'vendor-highlight';
          if (
            normalized.includes('/node_modules/react/')
            || normalized.includes('/node_modules/react-dom/')
            || normalized.includes('/node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }
          if (normalized.includes('/node_modules/@tauri-apps/')) return 'vendor-tauri';
          if (
            normalized.includes('/node_modules/lucide-react/')
            || normalized.includes('/node_modules/@dnd-kit/')
            || normalized.includes('/node_modules/uuid/')
          ) {
            return 'vendor-ui';
          }

          return undefined;
        },
      },
    },
  },
});
