#!/usr/bin/env node
/**
 * component-editor — the dead-simple version.
 *
 * Lists every component file in a folder, shows its source in an editable pane,
 * and a Save button writes it straight back to disk. No Storybook, no addon, no
 * build step, no dependencies — just Node's built-ins.
 *
 *   node component-editor.mjs [dir] [--port 6007]
 *
 *   dir   folder to scan (default: src/components), relative to where you run it
 *
 * Open the forwarded port in your browser, pick a component, edit, Save.
 * Then commit / open a PR like any code change.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const PORT = portFlag !== -1 ? Number(args[portFlag + 1]) : Number(process.env.PORT || 6007);
const DIR_ARG = args.find((a) => !a.startsWith('--') && a !== String(PORT)) || 'src/components';
const ROOT = path.resolve(process.cwd(), DIR_ARG);

const EXT = new Set(['.tsx', '.ts', '.jsx', '.js']);
const SKIP = /\.(stories|test|spec)\.|\.d\.ts$/;

if (!fs.existsSync(ROOT) || !fs.statSync(ROOT).isDirectory()) {
  console.error(`\n  ✗ Folder not found: ${ROOT}\n    Run this from your package and pass the components folder, e.g.\n    node component-editor.mjs src/components\n`);
  process.exit(1);
}

/** Recursively list editable component files, relative to ROOT. */
function listFiles(dir = ROOT, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(full, out);
    else if (EXT.has(path.extname(entry.name)) && !SKIP.test(entry.name)) {
      out.push(path.relative(ROOT, full).split(path.sep).join('/'));
    }
  }
  return out.sort();
}

/** Resolve a client-supplied relative path and refuse anything outside ROOT. */
function safeResolve(rel) {
  const full = path.resolve(ROOT, rel || '');
  if (full !== ROOT && !full.startsWith(ROOT + path.sep)) return null;
  return full;
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(PAGE);
  }

  if (req.method === 'GET' && url.pathname === '/api/list') {
    return sendJson(res, 200, { dir: ROOT, files: listFiles() });
  }

  if (req.method === 'GET' && url.pathname === '/api/file') {
    const full = safeResolve(url.searchParams.get('path'));
    if (!full || !fs.existsSync(full)) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, { path: url.searchParams.get('path'), code: fs.readFileSync(full, 'utf8') });
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'bad json' });
    }
    const full = safeResolve(body.path);
    if (!full || !fs.existsSync(full)) return sendJson(res, 400, { error: 'file not found / outside folder' });
    try {
      fs.writeFileSync(full, body.code, 'utf8');
      console.log(`saved ${body.path} (${body.code.length} bytes)`);
      return sendJson(res, 200, { ok: true, path: body.path, bytes: body.code.length });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  component-editor → editing ${ROOT}`);
  console.log(`  open  http://localhost:${PORT}  (in a Codespace, use the Ports tab)\n`);
});

const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Component Editor</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; height: 100vh; display: flex; color: #111; }
  #side { width: 300px; border-right: 1px solid #e5e7eb; overflow: auto; flex-shrink: 0; }
  #side h1 { font-size: 13px; padding: 12px; margin: 0; color: #6b7280; position: sticky; top: 0; background: #fff; border-bottom: 1px solid #f3f4f6; }
  #filter { width: calc(100% - 16px); margin: 8px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
  #list a { display: block; padding: 6px 12px; font-size: 13px; cursor: pointer; text-decoration: none; color: #111; border-left: 3px solid transparent; }
  #list a:hover { background: #f9fafb; }
  #list a.active { background: #eff6ff; border-left-color: #2563eb; font-weight: 600; }
  #main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
  #bar { padding: 10px 14px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 12px; }
  #bar code { font-size: 13px; color: #374151; }
  #save { padding: 7px 16px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; font-size: 13px; }
  #save:disabled { background: #9ca3af; cursor: default; }
  #status { font-size: 12px; color: #6b7280; }
  textarea { flex: 1; border: 0; outline: none; padding: 14px; font-family: ui-monospace, Menlo, monospace; font-size: 13px; line-height: 1.5; resize: none; white-space: pre; tab-size: 2; }
  #empty { margin: auto; color: #9ca3af; }
</style></head>
<body>
  <div id="side">
    <h1>Components</h1>
    <input id="filter" placeholder="filter…" oninput="render()">
    <div id="list"></div>
  </div>
  <div id="main">
    <div id="bar">
      <code id="cur">— pick a component —</code>
      <span style="flex:1"></span>
      <span id="status"></span>
      <button id="save" onclick="save()" disabled>Save</button>
    </div>
    <textarea id="code" spellcheck="false" oninput="dirty()" placeholder=""></textarea>
    <div id="empty" style="display:none"></div>
  </div>
<script>
let files = [], current = null, clean = '';
const $ = (id) => document.getElementById(id);

async function load() {
  const r = await fetch('/api/list').then(r => r.json());
  files = r.files; render();
  $('cur').textContent = r.dir;
}
function render() {
  const q = $('filter').value.toLowerCase();
  const list = $('list');
  list.textContent = '';
  for (const f of files.filter(x => x.toLowerCase().includes(q))) {
    const a = document.createElement('a');
    a.textContent = f;                 // textContent — never innerHTML (safe for any filename)
    if (f === current) a.className = 'active';
    a.addEventListener('click', () => open_(f));
    list.appendChild(a);
  }
}
async function open_(f) {
  if (current && $('code').value !== clean && !confirm('Discard unsaved changes to ' + current + '?')) return;
  const r = await fetch('/api/file?path=' + encodeURIComponent(f)).then(r => r.json());
  current = f; clean = r.code;
  $('code').value = r.code; $('cur').textContent = f;
  $('save').disabled = true; $('status').textContent = '';
  render();
}
function dirty() { $('save').disabled = ($('code').value === clean); $('status').textContent = ($('code').value === clean ? '' : 'unsaved'); }
async function save() {
  if (!current) return;
  $('save').disabled = true; $('status').textContent = 'saving…';
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: current, code: $('code').value }) }).then(r => r.json());
  if (r.ok) { clean = $('code').value; $('status').textContent = '✓ saved'; }
  else { $('status').textContent = '✗ ' + (r.error || 'failed'); $('save').disabled = false; }
}
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } });
load();
</script>
</body></html>`;
