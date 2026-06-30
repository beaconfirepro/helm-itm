import React from 'react';
import { createRoot } from 'react-dom/client';

// Global styles (Tailwind entry + tokens + CSS modules) so components look real.
import.meta.glob('../src/**/*.css', { eager: true });

// Theme/provider wrappers from the team's Storybook preview, if present.
const previewLoaders = import.meta.glob('../.storybook/preview.{js,jsx,ts,tsx}');

const COMP = /^src\/components\/.*\.(tsx|jsx)$/;
const SKIP = /\.(stories|test|spec)\.|\/index\.|\.d\.ts$/;
const TOKEN = /^src\/tokens\/.*\.json$/;

const pascal = (file) =>
  file
    .split('/')
    .pop()
    .replace(/\.\w+$/, '')
    .replace(/(^|[-_ ])(\w)/g, (_, __, c) => c.toUpperCase());

const isComp = (v) => typeof v === 'function' || (v && typeof v === 'object' && '$$typeof' in v);

function pickComponent(mod, file) {
  if (isComp(mod.default)) return mod.default;
  const name = pascal(file);
  if (isComp(mod[name])) return mod[name];
  for (const [k, v] of Object.entries(mod)) if (/^[A-Z]/.test(k) && isComp(v)) return v;
  return null;
}

// Import a component file ON DEMAND via Vite's /@fs, so nothing is scanned up
// front — a file with a bad import only errors its own tile, never the app.
const fsUrl = (root, file) => '/@fs/' + root.replace(/^\//, '') + '/' + file;
function importComponent(root, file, version) {
  return import(/* @vite-ignore */ fsUrl(root, file) + '?t=' + version);
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
  const [root, setRoot] = React.useState('');
  const [components, setComponents] = React.useState([]);
  const [tokens, setTokens] = React.useState([]);
  const [decorators, setDecorators] = React.useState([]);
  const [sel, setSel] = React.useState(null);
  const [Rendered, setRendered] = React.useState(null);
  const [renderErr, setRenderErr] = React.useState('');
  const [version, setVersion] = React.useState(0); // bumped on save to force re-import

  const [code, setCode] = React.useState('');
  const [clean, setClean] = React.useState('');
  const [status, setStatus] = React.useState('');

  // discover files (server-side) + preview decorators
  React.useEffect(() => {
    fetch('/__list').then((r) => r.json()).then((d) => {
      setRoot(d.root);
      const comps = (d.files || []).filter((f) => COMP.test(f) && !SKIP.test(f)).map((f) => ({ kind: 'component', file: f, name: pascal(f) }));
      const toks = (d.files || []).filter((f) => TOKEN.test(f)).map((f) => ({ kind: 'file', file: f, name: f.split('/').pop() }));
      setComponents(comps);
      setTokens(toks);
      setSel(comps[0] || toks[0] || null);
    });
    (async () => {
      for (const load of Object.values(previewLoaders)) {
        try {
          setDecorators((await load()).default?.decorators || []);
        } catch { /* ignore */ }
      }
    })();
  }, []);

  // load source + (for components) import & render, on selection or save-bump
  React.useEffect(() => {
    if (!sel || !root) return;
    setStatus('');
    fetch('/__file?path=' + encodeURIComponent(sel.file)).then((r) => r.json()).then((d) => {
      setCode(d.code || '');
      setClean(d.code || '');
    });
    if (sel.kind !== 'component') {
      setRendered(null);
      setRenderErr('');
      return;
    }
    setRendered(null);
    setRenderErr('');
    let cancelled = false;
    importComponent(root, sel.file, version)
      .then((mod) => {
        if (cancelled) return;
        const Comp = pickComponent(mod, sel.file);
        if (!Comp) setRenderErr('No component export found in this file.');
        else setRendered(() => Comp);
      })
      .catch((e) => !cancelled && setRenderErr(String(e?.message || e)));
    return () => {
      cancelled = true;
    };
  }, [sel && sel.file, root, version]);

  const save = () => {
    setStatus('saving…');
    fetch('/__save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: sel.file, code }) })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setClean(code);
          setStatus('✓ saved');
          setVersion((v) => v + 1); // re-import the fresh module -> preview updates
        } else setStatus('✗ ' + (d.error || 'failed'));
      });
  };
  React.useEffect(() => {
    const h = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        if (sel && code !== clean) save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const dirty = code !== clean;
  let preview;
  if (!sel) preview = <div style={{ color: '#9ca3af' }}>← pick a component</div>;
  else if (sel.kind !== 'component') preview = <div style={{ color: '#9ca3af' }}>No visual preview for this file — edit it on the right.</div>;
  else if (renderErr) preview = <pre style={errBox}>{renderErr}</pre>;
  else if (Rendered) {
    let fn = () => React.createElement(Rendered, {}, sel.name);
    for (const d of decorators) {
      const inner = fn;
      fn = () => d(inner, { args: {}, globals: {}, parameters: {} });
    }
    preview = (
      <Boundary resetKey={sel.file + version}>
        {(() => {
          try {
            return fn();
          } catch (e) {
            return <pre style={errBox}>{String(e?.stack || e)}</pre>;
          }
        })()}
      </Boundary>
    );
  } else preview = <div style={{ color: '#9ca3af' }}>rendering…</div>;

  const Item = ({ it }) => <div onClick={() => setSel(it)} style={row(sel && sel.file === it.file)}>{it.name}</div>;

  return (
    <div style={{ display: 'flex', height: '100%', fontSize: 13 }}>
      <div style={{ width: 230, borderRight: '1px solid #e5e7eb', overflow: 'auto', flexShrink: 0 }}>
        <div style={hd}>Components</div>
        {components.map((it) => <Item key={it.file} it={it} />)}
        {components.length === 0 && <div style={{ padding: 12, color: '#9ca3af' }}>No components in src/components.</div>}
        {tokens.length > 0 && <div style={grp}>Tokens</div>}
        {tokens.map((it) => <Item key={it.file} it={it} />)}
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={bar}><strong>{sel ? sel.name : 'Preview'}</strong></div>
        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: 'var(--background, #fff)', color: 'var(--foreground, inherit)' }}>{preview}</div>
      </div>

      <div style={{ width: 480, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ ...bar, justifyContent: 'space-between' }}>
          <code style={{ fontSize: 12, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sel ? sel.file : ''}</code>
          <button onClick={save} disabled={!sel || !dirty} style={btn(!sel || !dirty)}>Save</button>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck={false}
          style={{ flex: 1, border: 0, outline: 'none', padding: 12, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre', resize: 'none' }}
        />
        <div style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', color: dirty ? '#b45309' : '#6b7280', fontSize: 12 }}>
          {status || (dirty ? 'unsaved — Ctrl/Cmd+S' : 'this is the component’s source; Save re-renders the preview')}
        </div>
      </div>
    </div>
  );
}

const errBox = { color: '#b91c1c', whiteSpace: 'pre-wrap', padding: 16, fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace' };
const hd = { fontSize: 12, color: '#6b7280', padding: '10px 12px', borderBottom: '1px solid #f3f4f6', position: 'sticky', top: 0, background: '#fff' };
const grp = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '.04em', color: '#9ca3af', padding: '12px 12px 2px' };
const row = (active) => ({ padding: '5px 12px', cursor: 'pointer', borderLeft: '3px solid ' + (active ? '#2563eb' : 'transparent'), background: active ? '#eff6ff' : 'transparent', fontWeight: active ? 600 : 400 });
const bar = { padding: 8, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42 };
const btn = (dis) => ({ padding: '6px 14px', border: 0, borderRadius: 6, background: dis ? '#9ca3af' : '#2563eb', color: '#fff', fontWeight: 600, cursor: dis ? 'default' : 'pointer', fontSize: 12 });

createRoot(document.getElementById('root')).render(<App />);
