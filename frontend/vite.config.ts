import { createReadStream } from 'node:fs';
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const HTML_ENTRY_FILES = ['teacher-portal.html', 'viz-studio.html'];

function canServeHtmlAsset(relativePath: string) {
  return HTML_ENTRY_FILES.includes(relativePath) || relativePath.startsWith('viz/');
}

function htmlStaticAssetsPlugin(): Plugin {
  let outDir = '';
  let htmlDir = '';

  return {
    name: 'eduresource-html-static-assets',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
      htmlDir = path.resolve(config.root, '..', 'html');
    },
    configureServer(server) {
      server.middlewares.use('/html', async (req, res, next) => {
        try {
          const pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
          const relativePath = (pathname.replace(/^\/+/, '') || 'index.html').replace(/\\/g, '/');
          if (!canServeHtmlAsset(relativePath)) {
            next();
            return;
          }

          const targetPath = path.resolve(htmlDir, relativePath);

          if (!targetPath.startsWith(`${htmlDir}${path.sep}`) && targetPath !== htmlDir) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }

          const info = await stat(targetPath);
          if (!info.isFile()) {
            next();
            return;
          }

          res.setHeader('Content-Type', CONTENT_TYPES[path.extname(targetPath)] ?? 'application/octet-stream');
          createReadStream(targetPath)
            .on('error', next)
            .pipe(res);
        } catch {
          next();
        }
      });
    },
    async closeBundle() {
      const targetDir = path.join(outDir, 'html');
      await rm(targetDir, { recursive: true, force: true });
      await mkdir(targetDir, { recursive: true });
      await Promise.all(HTML_ENTRY_FILES.map((file) => cp(path.join(htmlDir, file), path.join(targetDir, file))));
      await cp(path.join(htmlDir, 'viz'), path.join(targetDir, 'viz'), { recursive: true });
    },
  };
}

// 与后端 FastAPI（默认 8000）配合：所有 /api 请求转发到后端，SSE 长连接同样走代理。
export default defineConfig({
  plugins: [react(), htmlStaticAssetsPlugin()],
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
