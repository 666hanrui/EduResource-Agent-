import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 与后端 FastAPI（默认 8000）配合：所有 /api 请求转发到后端，SSE 长连接同样走代理。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        // SSE 是 chunked 长连接，不能压缩缓冲，否则前端拿不到事件
        ws: false,
      },
    },
  },
});
