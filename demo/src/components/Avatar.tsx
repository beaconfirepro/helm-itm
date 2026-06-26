import React from 'react';

/**
 * A propless component — exercises the "no props" edge case. The addon should
 * still emit a single Default story with empty args.
 */
export default function Avatar() {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #818cf8, #c084fc)',
      }}
    />
  );
}
