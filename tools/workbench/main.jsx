import React from 'react';
import { createRoot } from 'react-dom/client';

// 1) Global styles (Tailwind entry + tokens + CSS modules) — eager side-effect
//    imports so components look real. CSS imports don't throw.
import.meta.glob('../src/**/*.css', { eager: true });

// 2) Lazy loaders — loaded one-by-one with error isolation so a single story
//    that can't run standalone (e.g. an addon artifact) never blanks the app.
const previewLoaders = import.meta.glob('../.storybook/preview.{js,jsx,ts,tsx}');
const storyLoaders = {
  ...import.meta.glob('../stories/**/*.stories.{tsx,jsx,ts,js}'),
  ...import.meta.glob('../src/**/*.stories.{tsx,jsx,ts,js}'),
};

class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.err) this.setState({ err: null });
  }
  render() {
    if (this.state.err)
      return <pre style={errBox}>{String(this.state.err?.stack || this.state.err)}</pre>;
    return this.props.children;
  }
}

function renderStory(item, globalDecorators) {
  const { story, meta } = item;
  const args = { ...(meta.args || {}), ...(story.args || {}) };
  const ctx = { args, globals: {}, parameters: { ...(meta.parameters || {}), ...(story.parameters || {}) }, component: meta.component };
  const base = () => {
    if (story.render) return story.render(args, ctx);
    if (meta.component) return React.createElement(meta.component, args);
    return <div style={{ color: '#9ca3af' }}>This story has no component or render function.</div>;
  };
  let fn = base;
  for (const d of [...(story.decorators || []), ...globalDecorators]) {
    const inner = fn;
    fn = () => d(inner, ctx);
  }
  try {
    return fn();
  } catch (e) {
    return <pre style={errBox}>{String(e?.stack || e)}</pre>;
  }
}

function App() {
  const [stories, setStories] = React.useState([]);
  const [decorators, setDecorators] = React.useState([]);
  const [skipped, setSkipped] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [sel, setSel] = React.useState(null);

  const [files, setFiles] = React.useState([]);
  const [filter, setFilter] = React.useState('');
  const [editPath, setEditPath] = React.useState('');
  const [code, setCode] = React.useState('');
  const [clean, setClean] = React.useState('');
  const [status, setStatus] = React.useState('');

  // Load preview decorators + stories, isolating failures.
  React.useEffect(() => {
    (async () => {
      let decs = [];
      for (const load of Object.values(previewLoaders)) {
        try {
          decs = (await load()).default?.decorators || [];
        } catch { /* ignore */ }
      }
      const out = [];
      const errs = [];
      await Promise.all(
        Object.entries(storyLoaders).map(async ([file, load]) => {
          try {
            const mod = await load();
            const meta = mod.default || {};
            const title = meta.title || file.split('/').pop().replace(/\.stories\.\w+$/, '');
            for (const [name, val] of Object.entries(mod)) {
              if (name === 'default' || val == null) continue;
              if (typeof val !== 'object' && typeof val !== 'function') continue;
              out.push({ id: `${title}::${name}`, title, name, file, story: typeof val === 'function' ? { render: val } : val, meta });
            }
          } catch (e) {
            errs.push(file.split('/').pop());
          }
        }),
      );
      out.sort((a, b) => a.id.localeCompare(b.id));
      setStories(out);
      setDecorators(decs);
      setSkipped(errs);
      setSel(out[0] || null);
      setLoading(false);
    })();
    fetch('/__list').then((r) => r.json()).then((d) => setFiles(d.files || []));
  }, []);

  const openFile = (p) => {
    if (!p) return;
    fetch('/__file?path=' + encodeURIComponent(p)).then((r) => r.json()).then((d) => {
      setEditPath(p);
      setCode(d.code || '');
      setClean(d.code || '');
      setStatus('');
    });
  };
  const save = () => {
    setStatus('saving…');
    fetch('/__save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: editPath, code }) })
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
        if (editPath && code !== clean) save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const dirty = code !== clean;
  const grouped = {};
  for (const s of stories) (grouped[s.title] = grouped[s.title] || []).push(s);
  const shownFiles = files.filter((f) => f.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ display: 'flex', height: '100%', fontSize: 13 }}>
      {/* component list */}
      <div style={{ width: 230, borderRight: '1px solid #e5e7eb', overflow: 'auto', flexShrink: 0 }}>
        <div style={hd}>Components</div>
        {loading && <div style={{ padding: 12, color: '#9ca3af' }}>loading…</div>}
        {!loading && stories.length === 0 && <div style={{ padding: 12, color: '#9ca3af' }}>No stories found.</div>}
        {Object.entries(grouped).map(([title, items]) => (
          <div key={title}>
            <div style={grp}>{title}</div>
            {items.map((s) => (
              <div key={s.id} onClick={() => setSel(s)} style={row(sel && sel.id === s.id)}>
                {s.name}
              </div>
            ))}
          </div>
        ))}
        {skipped.length > 0 && <div style={{ padding: 12, color: '#9ca3af', fontSize: 11 }}>skipped {skipped.length} non-renderable file(s)</div>}
      </div>

      {/* live preview */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ ...bar, justifyContent: 'space-between' }}>
          <strong>{sel ? `${sel.title} — ${sel.name}` : 'Preview'}</strong>
        </div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--background, #fff)', color: 'var(--foreground, inherit)' }}>
          <Boundary resetKey={sel ? sel.id : 'none'}>
            {sel ? renderStory(sel, decorators) : <div style={{ color: '#9ca3af' }}>← pick a component</div>}
          </Boundary>
        </div>
      </div>

      {/* code editor */}
      <div style={{ width: 460, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={bar}>
          <select value={editPath} onChange={(e) => openFile(e.target.value)} style={{ flex: 1, padding: 5, fontSize: 12 }}>
            <option value="">— pick a file to edit —</option>
            {shownFiles.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <button onClick={save} disabled={!editPath || !dirty} style={btn(!editPath || !dirty)}>Save</button>
        </div>
        <input placeholder="filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ margin: 8, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6 }} />
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          placeholder="pick a file above to see and edit its code"
          style={{ flex: 1, border: 0, borderTop: '1px solid #e5e7eb', outline: 'none', padding: 12, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre', resize: 'none' }}
        />
        <div style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', color: dirty ? '#b45309' : '#6b7280', fontSize: 12 }}>
          {status || (editPath ? (dirty ? 'unsaved — Ctrl/Cmd+S' : 'saved') : 'edits write to the file; preview hot-reloads')}
        </div>
      </div>
    </div>
  );
}

const errBox = { color: '#b91c1c', whiteSpace: 'pre-wrap', padding: 16, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' };
const hd = { fontSize: 12, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff' };
const grp = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#9ca3af', padding: '8px 12px 2px' };
const row = (active) => ({ padding: '5px 12px', cursor: 'pointer', borderLeft: '3px solid ' + (active ? '#2563eb' : 'transparent'), background: active ? '#eff6ff' : 'transparent', fontWeight: active ? 600 : 400 });
const bar = { padding: 8, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8 };
const btn = (dis) => ({ padding: '6px 14px', border: 0, borderRadius: 6, background: dis ? '#9ca3af' : '#2563eb', color: '#fff', fontWeight: 600, cursor: dis ? 'default' : 'pointer', fontSize: 12 });

createRoot(document.getElementById('root')).render(<App />);
