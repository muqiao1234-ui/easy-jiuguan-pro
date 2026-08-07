import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// 仅用于构建 module-preview.html 单文件预览，便于离线截图验证组件样式。
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    outDir: 'dist-preview',
    emptyOutDir: true,
    rollupOptions: {
      input: 'module-preview.html',
      output: {
        inlineDynamicImports: true,
        manualChunks: undefined,
      },
    },
  },
});
