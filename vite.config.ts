
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Chạy thử trên máy: phục vụ trạm trung chuyển Gemini của bản demo giống trên Vercel
const demoGeminiProxy = () => ({
  name: 'demo-gemini-proxy',
  configureServer(server: any) {
    server.middlewares.use('/api/gemini', async (req: any, res: any) => {
      // @ts-ignore – file JS dùng chung với Vercel Function
      const { default: handler } = await import('./api/gemini.js');
      req.url = '/api/gemini' + req.url;
      return handler(req, res);
    });
  }
});

export default defineConfig({
  plugins: [react(), demoGeminiProxy()],
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
