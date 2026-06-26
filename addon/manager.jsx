/**
 * Manager-side UI: the "Instances" panel.
 *
 * Reads the `autoDetect` parameter attached to each generated story's meta and
 * shows the component's governance status, its conformance role (canonical /
 * variant / rework), and every usage site (instance) across the codebase.
 * Read-only for now — interactive actions (approve, align, fix-outside) arrive
 * with the manager→Node bridge.
 */

import React from 'react';
import { addons, types, useParameter } from 'storybook/manager-api';
import { AddonPanel, IconButton } from 'storybook/internal/components';

const ADDON_ID = 'auto-detect';
const PANEL_ID = `${ADDON_ID}/panel`;
const TOOL_ID = `${ADDON_ID}/tool`;

/** Emit a rerun and reload once the server confirms, so the regroup is visible. */
function triggerRerun() {
  const channel = addons.getChannel();
  const cb = (r) => {
    if (r.action !== 'rerun') return;
    channel.off && channel.off('auto-detect/result', cb);
    window.location.reload();
  };
  channel.on('auto-detect/result', cb);
  channel.emit('auto-detect/rerun', {});
}

const RerunTool = () => (
  <IconButton key={TOOL_ID} title="Auto-detect: re-scan, re-audit & re-group" onClick={triggerRerun}>
    <span style={{ fontWeight: 600 }}>↻ Auto-detect</span>
  </IconButton>
);

const STATUS_COLOR = {
  surfaced: '#9ca3af',
  'in-review': '#f59e0b',
  approved: '#16a34a',
};

const StatusBadge = ({ status }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 999,
      fontSize: 11,
      fontWeight: 700,
      color: 'white',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      background: STATUS_COLOR[status] || '#9ca3af',
    }}
  >
    {status || 'surfaced'}
  </span>
);

const Conformance = ({ conformance = {} }) => {
  const role = conformance.role || 'clean';
  if (role === 'clean') return null;

  const box = (bg, border, color, children) => (
    <div style={{ margin: '0 0 16px', padding: 12, background: bg, border: `1px solid ${border}`, borderRadius: 6, color }}>
      {children}
    </div>
  );

  if (role === 'canonical') {
    const from = conformance.alignsFrom || [];
    return box(
      '#f0fdf4',
      '#bbf7d0',
      '#166534',
      <>
        <div style={{ fontWeight: 700, marginBottom: 6 }}>
          ✓ Approved canonical — {conformance.totalNonConforming} instance(s) to align
        </div>
        {from.map((v) => (
          <div key={v.variant}>
            <code>{v.variant}</code> → this ({v.instances} usage{v.instances === 1 ? '' : 's'})
          </div>
        ))}
      </>,
    );
  }

  if (role === 'variant') {
    return box(
      '#fffbeb',
      '#fde68a',
      '#92400e',
      <>
        <div style={{ fontWeight: 700 }}>
          ⚠ Non-conforming — should be <code>{conformance.alignsTo}</code>
        </div>
        <div>{conformance.instances} usage{conformance.instances === 1 ? '' : 's'} would be repointed on align.</div>
      </>,
    );
  }

  if (role === 'rework') {
    return box(
      '#fef2f2',
      '#fecaca',
      '#991b1b',
      <>
        <div style={{ fontWeight: 700 }}>
          ✎ Flagged for rework — should become <code>{conformance.target}</code>
        </div>
        <div>{conformance.instances} usage{conformance.instances === 1 ? '' : 's'} — needs real code changes (agents).</div>
      </>,
    );
  }
  return null;
};

const ActionButton = ({ onClick, tone, children }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      padding: '6px 12px',
      borderRadius: 6,
      border: '1px solid #d1d5db',
      cursor: 'pointer',
      fontWeight: 600,
      fontSize: 12,
      background: tone === 'primary' ? '#2563eb' : 'white',
      color: tone === 'primary' ? 'white' : '#374151',
    }}
  >
    {children}
  </button>
);

const inputStyle = {
  padding: '4px 8px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 12,
  width: 90,
};

function resultText(r) {
  if (!r.ok) return `Failed: ${r.error || 'unknown error'}`;
  if (r.action === 'approve') {
    return `Approved ${r.approved} — aligned ${r.aligned} instance(s) across ${r.files} file(s). Restart Storybook to re-group.`;
  }
  if (r.action === 'fix-outside') {
    return r.fixOutside
      ? `Flagged ${r.component} for fixing outside Storybook.`
      : `Cleared fix-outside on ${r.component}.`;
  }
  if (r.action === 'rerun') {
    return `Re-ran — regenerated ${r.regenerated} stor${r.regenerated === 1 ? 'y' : 'ies'}. Sidebar refreshing…`;
  }
  if (r.action === 'add-variant') {
    return `Added ${r.variant}.${r.value} to ${r.component}.`;
  }
  if (r.action === 'set-prop') {
    return `${r.component}.${r.prop}: ${r.from} → ${r.to} (library + ${(r.files || []).length} file(s)).`;
  }
  if (r.action === 'set-spacing') {
    return r.changed
      ? `${r.component} ${r.property}: ${r.from} → ${r.to} (${r.count} occurrence${r.count === 1 ? '' : 's'}).`
      : `No ${r.property}: ${r.from} found in ${r.component}.`;
  }
  if (r.action === 'tokenize-spacing') {
    return `Tokenized ${r.component} ${r.property}: ${r.value} → --spacing-${r.token}. Now governed.`;
  }
  return 'Done.';
}

/** Suggest a design-token name for a hardcoded spacing value, e.g. padding 16 → "space-16". */
function suggestToken(property, value) {
  const sanitized = String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return /^\d/.test(sanitized) ? `space-${sanitized}` : sanitized || 'space';
}

const Panel = () => {
  const data = useParameter('autoDetect', null);
  const [msg, setMsg] = React.useState(null);
  const [override, setOverride] = React.useState(null); // optimistic status after approve
  const [valueOverride, setValueOverride] = React.useState({}); // optimistic managed values
  const [managedToggle, setManagedToggle] = React.useState({}); // optimistic managed flags
  const [liveTokens, setLiveTokens] = React.useState(null); // live token map (not the baked param)
  const [vProp, setVProp] = React.useState('');
  const [vValue, setVValue] = React.useState('');
  const [vClasses, setVClasses] = React.useState('');
  const [tokenNames, setTokenNames] = React.useState({}); // per spacing row: suggested token name
  React.useEffect(() => {
    const channel = addons.getChannel();
    const cb = (r) => {
      setMsg(r);
      if (r.action === 'approve' && r.ok) setOverride({ component: r.component, status: 'approved' });
      if (r.action === 'set-prop' && r.ok) setValueOverride((o) => ({ ...o, [r.prop]: r.to }));
      if (r.action === 'set-managed' && r.ok) setManagedToggle((o) => ({ ...o, [r.prop]: r.managed }));
      if (r.action === 'set-token' && r.ok) channel.emit('auto-detect/get-tokens', {});
    };
    const onTokens = (live) => { if (live) setLiveTokens(live); };
    channel.on('auto-detect/result', cb);
    channel.on('auto-detect/tokens', onTokens);
    channel.emit('auto-detect/get-tokens', {});
    return () => {
      channel.off('auto-detect/result', cb);
      channel.off('auto-detect/tokens', onTokens);
    };
  }, []);
  const emit = (event, payload) => addons.getChannel().emit(event, payload);

  if (!data) {
    return (
      <div style={{ padding: 16, color: '#6b7280', fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
        <p>
          This story has no auto-detected metadata. Select an auto-generated story
          to see its instances and governance status.
        </p>
        <ActionButton onClick={triggerRerun}>↻ Rerun</ActionButton>
        {msg && msg.action === 'rerun' ? (
          <div style={{ marginTop: 10, color: msg.ok ? '#1e3a8a' : '#991b1b' }}>{resultText(msg)}</div>
        ) : null}
      </div>
    );
  }

  const {
    status,
    component,
    propCount = 0,
    instances = [],
    conformance = {},
    fixOutside,
    managed = [],
    allProps = [],
    variantConfig,
    colors = [],
    spacing = [],
    tokens = {},
    spacingTokens = {},
  } = data;
  const setManaged = (prop, value) => emit('auto-detect/set-managed', { component, prop, value });
  const setToken = (name, value) => emit('auto-detect/set-token', { name, value });
  const setColor = (from, to) => emit('auto-detect/set-color', { component, from, to });
  const setSpacing = (property, from, to) =>
    emit('auto-detect/set-spacing', { component, property, from, to });
  const tokenizeSpacing = (property, value, token) =>
    emit('auto-detect/tokenize-spacing', { component, property, value, token });
  const tokensView = liveTokens || tokens;
  const effStatus = override && override.component === component ? override.status : status;
  const openInEditor = (inst) => emit('auto-detect/open', { file: inst.file, line: inst.line });
  const setProp = (prop, value) => emit('auto-detect/set-prop', { component, prop, value });
  const axes = variantConfig && variantConfig.variants ? Object.keys(variantConfig.variants) : [];
  const addVariant = () => {
    if (!vProp || !vValue) return;
    emit('auto-detect/add-variant', {
      component,
      variant: vProp,
      value: vValue,
      classes: vClasses,
      newAxis: !axes.includes(vProp),
    });
    setVValue('');
    setVClasses('');
  };

  return (
    <div style={{ padding: 16, fontFamily: 'system-ui, sans-serif', fontSize: 13 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <strong style={{ fontSize: 15 }}>{component}</strong>
        <StatusBadge status={effStatus} />
        {fixOutside ? (
          <span style={{ padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#991b1b' }}>
            FIX OUTSIDE
          </span>
        ) : null}
      </div>
      <div style={{ color: '#6b7280', marginBottom: 12 }}>
        {propCount} prop{propCount === 1 ? '' : 's'} · {instances.length} instance
        {instances.length === 1 ? '' : 's'} in the codebase
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {effStatus !== 'approved' && (
          <ActionButton tone="primary" onClick={() => emit('auto-detect/approve', { component })}>
            Approve &amp; align
          </ActionButton>
        )}
        <ActionButton onClick={() => emit('auto-detect/fix-outside', { component, value: !fixOutside })}>
          {fixOutside ? 'Clear fix-outside' : 'Fix outside Storybook'}
        </ActionButton>
        <ActionButton onClick={triggerRerun}>↻ Rerun</ActionButton>
      </div>

      {msg && (msg.component === component || msg.action === 'rerun') ? (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 6,
            fontSize: 12,
            background: msg.ok ? '#eff6ff' : '#fef2f2',
            color: msg.ok ? '#1e3a8a' : '#991b1b',
            border: `1px solid ${msg.ok ? '#bfdbfe' : '#fecaca'}`,
          }}
        >
          {resultText(msg)}
        </div>
      ) : null}

      {colors.length > 0 ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Colors <span style={{ color: '#6b7280', fontWeight: 400 }}>(hardcoded in {component})</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {colors.map((hex) => (
              <label key={hex} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="color"
                  defaultValue={hex.length === 4 ? hex : hex.slice(0, 7)}
                  onBlur={(e) => setColor(hex, e.target.value)}
                  style={{ width: 26, height: 22, padding: 0, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}
                  title={`Change ${hex} everywhere in ${component}`}
                />
                <code style={{ fontSize: 11 }}>{hex}</code>
              </label>
            ))}
          </div>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Edits the hex in the component source (every occurrence). These bypass tokens — candidates to “tokenize”.
          </div>
        </div>
      ) : null}

      {spacing.length > 0 ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Spacing &amp; layout <span style={{ color: '#6b7280', fontWeight: 400 }}>(hardcoded in {component})</span>
          </div>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {spacing.map((s) => {
                const rowKey = `${s.property}:${s.value}`;
                const tokenName = tokenNames[rowKey] ?? suggestToken(s.property, s.value);
                const cell = { padding: '4px 6px', borderBottom: '1px solid #f3f4f6', textAlign: 'left' };
                return (
                  <tr key={rowKey}>
                    <td style={cell}><code style={{ fontSize: 11 }}>{s.property}</code></td>
                    <td style={cell}>
                      <input
                        defaultValue={s.display}
                        onBlur={(e) => {
                          const next = e.target.value.trim();
                          if (next && next !== s.display) setSpacing(s.property, s.value, next);
                        }}
                        style={{ width: 78, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                        title={`Change ${s.property}: ${s.display} (every occurrence in ${component})`}
                      />
                    </td>
                    <td style={cell}>
                      <input
                        value={tokenName}
                        onChange={(e) => setTokenNames((m) => ({ ...m, [rowKey]: e.target.value }))}
                        style={{ width: 96, padding: '2px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
                        title="Token name"
                      />
                    </td>
                    <td style={cell}>
                      <button
                        type="button"
                        onClick={() => tokenName && tokenizeSpacing(s.property, s.value, tokenName)}
                        style={{ padding: '3px 8px', borderRadius: 6, border: '1px solid #d1d5db', background: 'white', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                        title={`Promote ${s.property}: ${s.display} into tokens.json as --spacing-${tokenName}`}
                      >
                        Tokenize
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Property-scoped edits (Babel) — only this style property changes. <b>Tokenize</b> promotes a value into{' '}
            <code>tokens.json</code> as <code>--spacing-*</code> and repoints the source at <code>var(--spacing-…)</code>.
          </div>
        </div>
      ) : null}

      {Object.keys(spacingTokens).length > 0 ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Spacing tokens <span style={{ color: '#6b7280', fontWeight: 400 }}>(Tailwind @theme)</span>
          </div>
          {Object.entries(spacingTokens).map(([name, value]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <code>--spacing-{name}</code>
              <span style={{ color: '#6b7280' }}>{String(value)}</span>
            </div>
          ))}
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Governed spacing scale — use as <code>p-{'{'}name{'}'}</code>, <code>gap-{'{'}name{'}'}</code>, etc.
          </div>
        </div>
      ) : null}

      {Object.keys(tokensView).length > 0 ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Design tokens <span style={{ color: '#6b7280', fontWeight: 400 }}>(Tailwind @theme)</span>
          </div>
          {Object.entries(tokensView).map(([name, hex]) => (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <input
                type="color"
                defaultValue={hex}
                onBlur={(e) => setToken(name, e.target.value)}
                style={{ width: 28, height: 22, padding: 0, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer' }}
                title={`Edit --color-${name}`}
              />
              <code>--color-{name}</code>
              <span style={{ color: '#6b7280' }}>{hex}</span>
            </div>
          ))}
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Edits write <code>tokens.json</code> and regenerate the <code>@theme</code> stylesheet — components recolor live.
          </div>
        </div>
      ) : null}

      <Conformance conformance={conformance} />

      {managed.length > 0 ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Managed properties</div>
          {managed.map((m) => (
            <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <code style={{ minWidth: 70 }}>{m.name}</code>
              {m.options && m.options.length ? (
                m.options.map((opt) => {
                  const active = String(opt) === String(valueOverride[m.name] ?? m.value);
                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setProp(m.name, opt)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        border: `1px solid ${active ? '#2563eb' : '#d1d5db'}`,
                        background: active ? '#2563eb' : 'white',
                        color: active ? 'white' : '#374151',
                      }}
                    >
                      {String(opt)}
                    </button>
                  );
                })
              ) : (
                <span style={{ color: '#6b7280' }}>
                  current: <code>{String(m.value)}</code>
                </span>
              )}
            </div>
          ))}
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Changing a managed value updates the component’s default and every instance; future drift is caught on audit.
          </div>
        </div>
      ) : null}

      {allProps.length > 0 ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Properties</div>
          {allProps.map((p) => {
            const isManaged = managedToggle[p.name] ?? p.managed;
            return (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <code style={{ minWidth: 76 }}>{p.name}</code>
                <span style={{ color: '#6b7280', fontSize: 11 }}>{p.tsType}</span>
                <button
                  type="button"
                  onClick={() => setManaged(p.name, !isManaged)}
                  style={{
                    marginLeft: 'auto',
                    padding: '2px 8px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: `1px solid ${isManaged ? '#16a34a' : '#d1d5db'}`,
                    background: isManaged ? '#16a34a' : 'white',
                    color: isManaged ? 'white' : '#374151',
                  }}
                >
                  {isManaged ? '✓ managed' : 'manage'}
                </button>
              </div>
            );
          })}
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Toggle a prop to govern it, then <strong>↻ Rerun</strong> to load its editing controls above.
          </div>
        </div>
      ) : null}

      {variantConfig && variantConfig.variants ? (
        <div style={{ margin: '0 0 16px' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>
            Variants <span style={{ color: '#6b7280', fontWeight: 400 }}>({variantConfig.library})</span>
          </div>
          {axes.map((axis) => (
            <div key={axis} style={{ marginBottom: 4 }}>
              <code>{axis}</code>: {variantConfig.variants[axis].join(', ')}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            <input
              list="ad-axes"
              placeholder="property"
              value={vProp}
              onChange={(e) => setVProp(e.target.value)}
              style={inputStyle}
            />
            <datalist id="ad-axes">
              {axes.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <input placeholder="value" value={vValue} onChange={(e) => setVValue(e.target.value)} style={inputStyle} />
            <input
              placeholder="tailwind classes"
              value={vClasses}
              onChange={(e) => setVClasses(e.target.value)}
              style={{ ...inputStyle, flex: 1, minWidth: 140, width: 'auto' }}
            />
            <ActionButton tone="primary" onClick={addVariant}>
              Add
            </ActionButton>
          </div>
          <div style={{ color: '#6b7280', fontSize: 11, marginTop: 4 }}>
            Adds to the {variantConfig.library} config — the prop &amp; its type come free. New name = new property.
          </div>
        </div>
      ) : null}

      <div style={{ fontWeight: 700, marginBottom: 8 }}>Instances</div>
      {instances.length === 0 ? (
        <div style={{ color: '#9ca3af', fontStyle: 'italic' }}>
          No usages found. This component isn’t rendered anywhere yet.
        </div>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#6b7280' }}>
              <th style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Location</th>
              <th style={{ padding: '4px 8px', borderBottom: '1px solid #e5e7eb' }}>Props set</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((inst, i) => (
              <tr key={`${inst.relFile}:${inst.line}:${i}`}>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>
                  <a
                    onClick={() => openInEditor(inst)}
                    title="Open in editor"
                    style={{ color: '#2563eb', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {inst.relFile}:{inst.line}
                  </a>
                </td>
                <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#374151' }}>
                  {inst.props && inst.props.length ? inst.props.join(', ') : <em>—</em>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

addons.register(ADDON_ID, () => {
  addons.add(TOOL_ID, {
    type: types.TOOL,
    title: 'Auto-detect rerun',
    match: () => true,
    render: () => <RerunTool />,
  });
  addons.add(PANEL_ID, {
    type: types.PANEL,
    title: 'Instances',
    match: ({ viewMode }) => viewMode === 'story',
    render: ({ active }) => (
      <AddonPanel active={Boolean(active)}>
        <Panel />
      </AddonPanel>
    ),
  });
});
