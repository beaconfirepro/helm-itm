import React from 'react';
import PropTypes from 'prop-types';

const TONES = {
  neutral: { bg: '#e5e7eb', fg: '#374151' },
  success: { bg: '#bbf7d0', fg: '#166534' },
  warning: { bg: '#a75716', fg: '#92400e' },
};

/**
 * A small status pill. Intentionally written with PropTypes (no TypeScript
 * types) to exercise the addon's PropTypes extraction path. Exported as a named
 * export to exercise named-import generation.
 */
export function Badge({ label, tone }) {
  const theme = TONES[tone] || TONES.neutral;
  return (
    <span
      style={{
        display: 'inline-block',
        background: theme.bg,
        color: theme.fg,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {label}
    </span>
  );
}

Badge.propTypes = {
  /** Text content of the badge. */
  label: PropTypes.string.isRequired,
  /** Color tone of the badge. */
  tone: PropTypes.oneOf(['neutral', 'success', 'warning']),
};

Badge.defaultProps = {
  tone: 'neutral',
};
