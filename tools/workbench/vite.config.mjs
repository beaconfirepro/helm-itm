/**
 * workbench — one app that renders your components AND edits their code.
 *
 * Runs with Vite using the host package's own deps (React, Tailwind, your
 * components), so what you see is the real thing. A tiny middleware reads/writes
 * files under the package (confined to it) for the Save button.
 *
 *   from your package:  npx vite --config workbench/vite.config.mjs
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url)); // workbench/
const pkg = path.resolve(here, '..'); // the host package root

const EXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', '.css']);
const SKIP = /\.(test|spec)\.|\.d\.ts$/;
function listFiles(dir = pkg, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'workbench' || e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) listFiles(full, out);
    else if (EXT.has(path.extname(e.name)) && !SKIP.test(e.name))
      out.push(path.relative(pkg, full).split(path.sep).join('/'));
  }
  return out;
}
const safe = (rel) => {
  const f = path.resolve(pkg, rel || '');
  return f === pkg || f.startsWith(pkg + path.sep) ? f : null;
};

const writeback = {
  name: 'workbench-writeback',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const url = new URL(req.url, 'http://x');
      const json = (code, obj) => {
        res.statusCode = code;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(obj));
      };
      if (url.pathname === '/__list') return json(200, { files: listFiles().sort() });
      if (url.pathname === '/__file') {
        const f = safe(url.searchParams.get('path'));
        if (!f || !fs.existsSync(f)) return json(404, { error: 'not found' });
        return json(200, { code: fs.readFileSync(f, 'utf8') });
      }
      if (url.pathname === '/__save' && req.method === 'POST') {
        let d = '';
        req.on('data', (c) => (d += c));
        req.on('end', () => {
          try {
            const b = JSON.parse(d);
            const f = safe(b.path);
            if (!f || !fs.existsSync(f)) return json(400, { error: 'bad path' });
            fs.writeFileSync(f, b.code, 'utf8');
            return json(200, { ok: true });
          } catch (e) {
            return json(500, { error: e.message });
          }
        });
        return;
      }
      next();
    });
  },
};

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss(), writeback],
  server: { port: Number(process.env.PORT || 6007), host: true, fs: { allow: [pkg] } },
});
