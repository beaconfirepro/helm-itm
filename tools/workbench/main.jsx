import React from 'react';
import { createRoot } from 'react-dom/client';

// Global styles (Tailwind entry + tokens + CSS modules).
import.meta.glob('../src/**/*.css', { eager: true });

// Theme/provider wrappers from the team's Storybook preview, if present.
const previewLoaders = import.meta.glob('../.storybook/preview.{js,jsx,ts,tsx}');

// Stories are the renderable examples (this is how a compositional library shows
// each component properly). Lazy + per-file error isolation. Vite-tracked, so
// editing a component file hot-reloads its preview via React Fast Refresh.
const storyLoaders = {
  ...import.meta.glob('../stories/**/*.stories.{tsx,jsx,ts,js}'),
  ...import.meta.glob('../src/**/*.stories.{tsx,jsx,ts,js}'),
};

const stripDots = (k) => k.replace(/^\.\.\//, ''); // '../src/..' -> 'src/..'
const noext = (f) => f.replace(/\.\w+$/, '');
const dirname = (p) => p.slice(0, p.lastIndexOf('/'));
const lastTitle = (t) => String(t).split('/').pop();

function resolveRel(fromFile, spec) {
  const parts = dirname(fromFile).split('/');
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    else if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

/** Find the component SOURCE file a story renders, by parsing its imports.
 *  Returns a package-relative path, or null. */
function resolveComponentFile(storyFile, source, componentName, title, files) {
  const want = componentName || lastTitle(title);
  const importRe = /import\s+(?:([A-Za-z_$][\w$]*)\s*,?\s*)?(?:\{([^}]*)\})?\s*from\s*['"]([^'"]+)['"]/g;
  const candidates = [];
  let m;
  while ((m = importRe.exec(source))) {
    const def = m[1];
    const named = (m[2] || '').split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const spec = m[3];
    const provides = (def && def === want) || named.includes(want);
    candidates.push({ spec, provides });
  }
  // Prefer the import that provides the wanted component name.
  const ordered = [...candidates.filter((c) => c.provides), ...candidates];
  for (const { spec } of ordered) {
    let target;
    if (spec.startsWith('.')) target = resolveRel(storyFile, spec);
    else target = spec.replace(/^(@\/|~\/|src\/)/, '').replace(/^@[\w-]+\//, '');
    let hit = files.find((f) => noext(f) === target);
    if (!hit) hit = files.find((f) => noext(f).endsWith('/' + target) || noext(f).endsWith(target));
    if (hit) return hit;
  }
  // Fallback: a component file whose name matches the story title.
  const pasc = lastTitle(title).replace(/[^A-Za-z0-9]/g, '').toLowerCase();
  return files.find((f) => /\/components\//.test(f) && f.split('/').pop().replace(/\.\w+$/, '').replace(/[^A-Za-z0-9]/g, '').toLowerCase() === pasc) || null;
}

class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null });
  }
  render() {
    if (this.state.err) return <pre style={errBox}>{String(this.state.err?.stack || this.state.err)}</pre>;
    return this.props.children;
  }
}

function App() {
  const [items, setItems] = React.useState([]);
  const [decorators, setDecorators] = React.useState([]);
  const [files, setFiles] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [srcPath, setSrcPath] = React.useState(''); // resolved component file (the link)
  const [code, setCode] = React.useState('');
  const [clean, setClean] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      for (const load of Object.values(previewLoaders)) {
        try {
          setDecorators((await load()).default?.decorators || []);
        } catch { /* ignore */ }
      }
      const out = [];
      await Promise.all(
        Object.entries(storyLoaders).map(async ([key, load]) => {
          try {
            const mod = await load();
            const meta = mod.default || {};
            const title = meta.title || key.split('/').pop().replace(/\.stories\.\w+$/, '');
            const names = Object.keys(mod).filter((n) => n !== 'default' && (typeof mod[n] === 'object' || typeof mod[n] === 'function'));
            if (!names.length) return;
            const primary = mod.Default && names.includes('Default') ? 'Default' : names[0];
            const val = mod[primary];
            out.push({
              key: stripDots(key),
              title,
              label: lastTitle(title),
              componentName: meta.component?.displayName || meta.component?.name || '',
              meta,
              story: typeof val === 'function' ? { render: val } : val,
            });
          } catch { /* skip non-renderable file */ }
        }),
      );
      out.sort((a, b) => a.label.localeCompare(b.label));
      setItems(out);
      setSel(out[0] || null);
      setLoading(false);
    })();
    fetch('/__list').then((r) => r.json()).then((d) => setFiles(d.files || []));
  }, []);

  // On select: resolve + load the component's source file (the editor target + link).
  React.useEffect(() => {
    if (!sel || files.length === 0) return;
    setStatus('');
    (async () => {
      const storySrc = await fetch('/__file?path=' + encodeURIComponent(sel.key)).then((r) => r.json()).then((d) => d.code || '');
      const compFile = resolveComponentFile(sel.key, storySrc, sel.componentName, sel.title, files) || sel.key;
      setSrcPath(compFile);
      const d = await fetch('/__file?path=' + encodeURIComponent(compFile)).then((r) => r.json());
      setCode(d.code || '');
      setClean(d.code || '');
    })();
  }, [sel && sel.key, files.length]);

  const save = () => {
    setStatus('saving…');
    fetch('/__save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: srcPath, code }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setClean(code);
          setStatus('✓ saved — preview hot-reloads');
        } else setStatus('✗ ' + (d.error || 'failed'));
      });
  };
  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (srcPath && code !== clean) save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const dirty = code !== clean;
  let preview = <div style={{ color: '#9ca3af' }}>← pick a component</div>;
  if (sel) {
    const { story, meta } = sel;
    const args = { ...(meta.args || {}), ...(story.args || {}) };
    const ctx = { args, globals: {}, parameters: { ...(meta.parameters || {}), ...(story.parameters || {}) } };
    let fn = () => (story.render ? story.render(args, ctx) : meta.component ? React.createElement(meta.component, args) : null);
    for (const d of [...(story.decorators || []), ...decorators]) {
      const inner = fn;
      fn = () => d(inner, ctx);
    }
    preview = (
      <Boundary resetKey={sel.key}>
        {(() => {
          try {
            return fn();
          } catch (e) {
            return <pre style={errBox}>{String(e?.stack || e)}</pre>;
          }
        })()}
      </Boundary>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', fontSize: 13 }}>
      <div style={{ width: 220, borderRight: '1px solid #e5e7eb', overflow: 'auto', flexShrink: 0 }}>
        <div style={hd}>Components</div>
        {loading && <div style={{ padding: 12, color: '#9ca3af' }}>loading…</div>}
        {!loading && items.length === 0 && <div style={{ padding: 12, color: '#9ca3af' }}>No stories found to render from.</div>}
        {items.map((it) => (
          <div key={it.key} onClick={() => setSel(it)} style={row(sel && sel.key === it.key)}>{it.label}</div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={bar}><strong>{sel ? sel.label : 'Preview'}</strong></div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--background, #fff)', color: 'var(--foreground, inherit)' }}>{preview}</div>
      </div>

      <div style={{ width: 480, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        {/* the component <-> code link */}
        <div style={{ ...bar, flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#6b7280' }}>{sel ? sel.label : ''} →</span>
            <code style={{ flex: 1, fontSize: 12, color: '#111', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{srcPath || '—'}</code>
            <button onClick={save} disabled={!srcPath || !dirty} style={btn(!srcPath || !dirty)}>Save</button>
          </div>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          style={{ flex: 1, border: 0, outline: 'none', padding: 12, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre', resize: 'none' }}
        />
        <div style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', color: dirty ? '#b45309' : '#6b7280', fontSize: 12 }}>
          {status || (dirty ? 'unsaved — Ctrl/Cmd+S' : 'editing the component’s real source; Save hot-reloads the preview')}
        </div>
      </div>
    </div>
  );
}

const errBox = { color: '#b91c1c', whiteSpace: 'pre-wrap', padding: 16, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' };
const hd = { fontSize: 12, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff' };
const row = (active) => ({ padding: '6px 12px', cursor: 'pointer', borderLeft: '3px solid ' + (active ? '#2563eb' : 'transparent'), background: active ? '#eff6ff' : 'transparent', fontWeight: active ? 600 : 400 });
const bar = { padding: 8, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42 };
const btn = (dis) => ({ padding: '6px 14px', border: 0, borderRadius: 6, background: dis ? '#9ca3af' : '#2563eb', color: '#fff', fontWeight: 600, cursor: dis ? 'default' : 'pointer', fontSize: 12 });

createRoot(document.getElementById('root')).render(<App />);
