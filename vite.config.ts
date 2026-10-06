
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    // Vite không tự động cung cấp global 'process'. 
    // Chúng ta cần shim nó để các thư viện sử dụng process.env không bị crash.
    'process.env': {
      API_KEY: process.env.API_KEY
    }
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },
  server: {
    port: 3000,
  },
});
