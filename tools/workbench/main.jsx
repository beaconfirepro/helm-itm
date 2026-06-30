import React from 'react';
import { createRoot } from 'react-dom/client';

// Two-pane workbench: your real Storybook renders in the left frame (it composes
// every component correctly), the code editor is on the right. Save writes the
// file; Storybook's own dev server hot-reloads the left frame.
//
// In a Codespace, set the Storybook port to PUBLIC so the iframe can embed it,
// and paste its forwarded URL into the field. Locally, http://localhost:6006.

const EDITABLE = /\.(tsx|ts|jsx|js|mjs|json|css)$/;
const SKIP = /\.(test|spec)\.|\.d\.ts$/;

function App() {
  const [sbUrl, setSbUrl] = React.useState(() => localStorage.getItem('wb_sb') || 'http://localhost:6006');
  const [sbSrc, setSbSrc] = React.useState(() => localStorage.getItem('wb_sb') || 'http://localhost:6006');
  const [files, setFiles] = React.useState([]);
  const [filter, setFilter] = React.useState('');
  const [editPath, setEditPath] = React.useState('');
  const [code, setCode] = React.useState('');
  const [clean, setClean] = React.useState('');
  const [status, setStatus] = React.useState('');

  React.useEffect(() => {
    fetch('/__list').then((r) => r.json()).then((d) => setFiles((d.files || []).filter((f) => EDITABLE.test(f) && !SKIP.test(f))));
  }, []);

  const loadSb = () => {
    localStorage.setItem('wb_sb', sbUrl);
    setSbSrc(sbUrl + (sbUrl.includes('?') ? '' : '') + '#' + Date.now()); // force reload
  };
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
          setStatus('✓ saved — Storybook hot-reloads');
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
  const shown = files.filter((f) => f.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div style={{ display: 'flex', height: '100%', fontSize: 13 }}>
      {/* left: Storybook in a frame */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ ...bar, gap: 6 }}>
          <span style={{ fontSize: 11, color: '#6b7280' }}>Storybook</span>
          <input value={sbUrl} onChange={(e) => setSbUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadSb()} placeholder="paste your Storybook URL"
            style={{ flex: 1, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }} />
          <button onClick={loadSb} style={btn(false)}>Load</button>
        </div>
        <iframe key={sbSrc} src={sbSrc} title="storybook" style={{ flex: 1, border: 0, width: '100%' }} />
      </div>

      {/* right: code editor */}
      <div style={{ width: 520, borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={bar}>
          <select value={editPath} onChange={(e) => openFile(e.target.value)} style={{ flex: 1, padding: 5, fontSize: 12 }}>
            <option value="">— pick a file to edit —</option>
            {shown.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <button onClick={save} disabled={!editPath || !dirty} style={btn(!editPath || !dirty)}>Save</button>
        </div>
        <input placeholder="filter files…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ margin: 8, padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 6 }} />
        <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} placeholder="pick a file above"
          style={{ flex: 1, border: 0, borderTop: '1px solid #e5e7eb', outline: 'none', padding: 12, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12.5, lineHeight: 1.5, whiteSpace: 'pre', resize: 'none' }} />
        <div style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', color: dirty ? '#b45309' : '#6b7280', fontSize: 12 }}>
          {status || (editPath ? (dirty ? 'unsaved — Ctrl/Cmd+S' : 'saved') : 'edit a file; the Storybook frame hot-reloads')}
        </div>
      </div>
    </div>
  );
}

const bar = { padding: 8, borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44 };
const btn = (dis) => ({ padding: '6px 14px', border: 0, borderRadius: 6, background: dis ? '#9ca3af' : '#2563eb', color: '#fff', fontWeight: 600, cursor: dis ? 'default' : 'pointer', fontSize: 12 });

createRoot(document.getElementById('root')).render(<App />);
