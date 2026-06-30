#!/usr/bin/env node
/**
 * component-editor — the dead-simple version.
 *
 * Lists every editable file across one or more folders, shows the source in a
 * TWO-PANE split editor (open a token file and a component at the same time),
 * and a Save button writes each pane back to disk. No Storybook, no addon, no
 * build step, no dependencies — just Node's built-ins.
 *
 *   node component-editor.mjs [dir ...] [--port 6007]
 *
 *   dir   one or more folders to scan (default: src/components). Pass several to
 *         edit them together, e.g.  node component-editor.mjs src/components src/tokens
 *
 * Open the forwarded port, pick files into the two panes, edit, Save.
 * Then commit / open a PR like any code change.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

// ---- args -----------------------------------------------------------------
const argv = process.argv.slice(2);
let PORT = Number(process.env.PORT || 6007);
const dirArgs = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--port') PORT = Number(argv[++i]);
  else dirArgs.push(argv[i]);
}
if (dirArgs.length === 0) dirArgs.push('src/components');

const ROOTS = dirArgs
  .map((d) => ({ abs: path.resolve(process.cwd(), d), label: d }))
  .filter((r) => {
    const ok = fs.existsSync(r.abs) && fs.statSync(r.abs).isDirectory();
    if (!ok) console.error(`  ⚠ skipping missing folder: ${r.label}`);
    return ok;
  });

if (ROOTS.length === 0) {
  console.error(`\n  ✗ No folders found. Run from your package and pass folders, e.g.\n    node component-editor.mjs src/components src/tokens\n`);
  process.exit(1);
}

const EXT = new Set(['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json', '.css']);
const SKIP = /\.(stories|test|spec)\.|\.d\.ts$/;

// ---- file listing ---------------------------------------------------------
function listFiles() {
  const out = [];
  ROOTS.forEach((root, idx) => {
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (EXT.has(path.extname(entry.name)) && !SKIP.test(entry.name)) {
          const rel = path.relative(root.abs, full).split(path.sep).join('/');
          out.push({ id: `${idx}:${rel}`, group: root.label, name: rel });
        }
      }
    };
    walk(root.abs);
  });
  return out.sort((a, b) => (a.group + a.name).localeCompare(b.group + b.name));
}

/** Resolve a client file id (`rootIndex:relpath`), confined to that root. */
function safeResolve(id) {
  const i = String(id).indexOf(':');
  if (i < 0) return null;
  const root = ROOTS[Number(String(id).slice(0, i))];
  const rel = String(id).slice(i + 1);
  if (!root) return null;
  const full = path.resolve(root.abs, rel);
  if (full !== root.abs && !full.startsWith(root.abs + path.sep)) return null;
  return full;
}

// ---- server ---------------------------------------------------------------
const sendJson = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let d = '';
    req.on('data', (c) => (d += c));
    req.on('end', () => resolve(d));
  });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(PAGE);
  }
  if (req.method === 'GET' && url.pathname === '/api/list') {
    return sendJson(res, 200, { roots: ROOTS.map((r) => r.label), files: listFiles() });
  }
  if (req.method === 'GET' && url.pathname === '/api/file') {
    const full = safeResolve(url.searchParams.get('id'));
    if (!full || !fs.existsSync(full)) return sendJson(res, 404, { error: 'not found' });
    return sendJson(res, 200, { id: url.searchParams.get('id'), code: fs.readFileSync(full, 'utf8') });
  }
  if (req.method === 'POST' && url.pathname === '/api/save') {
    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch {
      return sendJson(res, 400, { error: 'bad json' });
    }
    const full = safeResolve(body.id);
    if (!full || !fs.existsSync(full)) return sendJson(res, 400, { error: 'file not found / outside folder' });
    try {
      fs.writeFileSync(full, body.code, 'utf8');
      console.log(`saved ${body.id} (${body.code.length} bytes)`);
      return sendJson(res, 200, { ok: true, id: body.id, bytes: body.code.length });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }
  res.writeHead(404);
  res.end('not found');
});

server.listen(PORT, () => {
  console.log(`\n  component-editor → editing ${ROOTS.map((r) => r.label).join(' + ')}`);
  console.log(`  open  http://localhost:${PORT}  (in a Codespace, use the Ports tab)\n`);
});

// ---- page (no deps; safe DOM, no innerHTML for file data) ------------------
const PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Component Editor</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; height: 100vh; display: flex; color: #111; }
  #side { width: 290px; border-right: 1px solid #e5e7eb; overflow: auto; flex-shrink: 0; }
  #side h1 { font-size: 12px; padding: 10px 12px; margin: 0; color: #6b7280; position: sticky; top: 0; background: #fff; border-bottom: 1px solid #f3f4f6; }
  #filter { width: calc(100% - 16px); margin: 8px; padding: 6px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 13px; }
  .grp { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #9ca3af; padding: 10px 12px 4px; }
  #list a { display: flex; justify-content: space-between; gap: 6px; padding: 5px 12px; font-size: 13px; cursor: pointer; color: #111; border-left: 3px solid transparent; }
  #list a:hover { background: #f9fafb; }
  #list a .badge { font-size: 10px; font-weight: 700; color: #2563eb; }
  #main { flex: 1; display: flex; min-width: 0; }
  .pane { flex: 1; display: flex; flex-direction: column; min-width: 0; border-right: 1px solid #e5e7eb; }
  .pane:last-child { border-right: 0; }
  .pane.active .bar { background: #eff6ff; }
  .bar { padding: 8px 12px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; gap: 10px; }
  .bar code { font-size: 12px; color: #374151; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar .pill { font-size: 10px; font-weight: 700; color: #fff; background: #9ca3af; border-radius: 4px; padding: 1px 6px; }
  .pane.active .pill { background: #2563eb; }
  .bar .status { font-size: 11px; color: #6b7280; }
  .bar button { padding: 6px 14px; border: 0; border-radius: 6px; background: #2563eb; color: #fff; font-weight: 600; cursor: pointer; font-size: 12px; }
  .bar button:disabled { background: #9ca3af; cursor: default; }
  textarea { flex: 1; border: 0; outline: none; padding: 12px; font-family: ui-monospace, Menlo, monospace; font-size: 12.5px; line-height: 1.5; resize: none; white-space: pre; tab-size: 2; }
</style></head>
<body>
  <div id="side">
    <h1 id="roots">Files</h1>
    <input id="filter" placeholder="filter…" oninput="render()">
    <div id="list"></div>
  </div>
  <div id="main">
    <div class="pane active" data-p="a">
      <div class="bar"><span class="pill">A</span><code>— pick a file —</code><span class="status"></span><button disabled>Save</button></div>
      <textarea spellcheck="false"></textarea>
    </div>
    <div class="pane" data-p="b">
      <div class="bar"><span class="pill">B</span><code>— pick a file —</code><span class="status"></span><button disabled>Save</button></div>
      <textarea spellcheck="false"></textarea>
    </div>
  </div>
<script>
let files = [], active = 'a';
const pane = { a: { id: null, clean: '' }, b: { id: null, clean: '' } };
const els = {};
for (const p of ['a','b']) {
  const root = document.querySelector('.pane[data-p="'+p+'"]');
  els[p] = { root, code: root.querySelector('textarea'), name: root.querySelector('code'), status: root.querySelector('.status'), save: root.querySelector('button') };
  els[p].code.addEventListener('focus', () => setActive(p));
  els[p].code.addEventListener('input', () => dirty(p));
  els[p].save.addEventListener('click', () => save(p));
  root.addEventListener('mousedown', () => setActive(p));
}
function setActive(p) { active = p; for (const q of ['a','b']) els[q].root.classList.toggle('active', q === p); }
const $ = (id) => document.getElementById(id);

async function load() {
  const r = await fetch('/api/list').then(r => r.json());
  files = r.files; $('roots').textContent = r.roots.join('  +  ');
  render();
}
function render() {
  const q = $('filter').value.toLowerCase();
  const list = $('list'); list.textContent = '';
  let group = null;
  for (const f of files.filter(x => (x.group + ' ' + x.name).toLowerCase().includes(q))) {
    if (f.group !== group) { group = f.group; const h = document.createElement('div'); h.className = 'grp'; h.textContent = group; list.appendChild(h); }
    const a = document.createElement('a');
    const nm = document.createElement('span'); nm.textContent = f.name; a.appendChild(nm);
    const open = (pane.a.id === f.id ? 'A' : '') + (pane.b.id === f.id ? 'B' : '');
    if (open) { const b = document.createElement('span'); b.className = 'badge'; b.textContent = open; a.appendChild(b); }
    a.addEventListener('click', () => openInto(active, f.id, f.name));
    list.appendChild(a);
  }
}
async function openInto(p, id, name) {
  const e = els[p];
  if (pane[p].id && e.code.value !== pane[p].clean && !confirm('Discard unsaved changes in pane ' + p.toUpperCase() + '?')) return;
  const r = await fetch('/api/file?id=' + encodeURIComponent(id)).then(r => r.json());
  pane[p].id = id; pane[p].clean = r.code;
  e.code.value = r.code; e.name.textContent = name; e.save.disabled = true; e.status.textContent = '';
  render();
}
function dirty(p) {
  const changed = els[p].code.value !== pane[p].clean;
  els[p].save.disabled = !changed; els[p].status.textContent = changed ? 'unsaved' : '';
}
async function save(p) {
  if (!pane[p].id) return;
  els[p].save.disabled = true; els[p].status.textContent = 'saving…';
  const r = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: pane[p].id, code: els[p].code.value }) }).then(r => r.json());
  if (r.ok) { pane[p].clean = els[p].code.value; els[p].status.textContent = '✓ saved'; }
  else { els[p].status.textContent = '✗ ' + (r.error || 'failed'); els[p].save.disabled = false; }
}
document.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(active); } });
load();
</script>
</body></html>`;
