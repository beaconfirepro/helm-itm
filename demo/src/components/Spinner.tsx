import React from 'react';

export interface SpinnerProps {
  /** Diameter of the spinner in pixels. */
  size?: number;
}

/**
 * A loading spinner. This component ships with a hand-written
 * `Spinner.stories.tsx`, so the addon should NOT auto-generate stories for it —
 * demonstrating that auto and manual stories coexist.
 */
export default function Spinner({ size = 24 }: SpinnerProps) {
  return (
    <div
      style={{
        width: size,
        height: size,
        border: '3px solid #e5e7eb',
        borderTopColor: '#2563eb',
        borderRadius: '50%',
      }}
    />
  );
}
