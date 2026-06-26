import React from 'react';

export interface LegacyButtonProps {
  /** Button text. */
  label: string;
  /** Visual emphasis. */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Button size. */
  size?: 'sm' | 'md' | 'lg';
  /** Click handler. */
  onClick?: () => void;
}

/**
 * A rogue, hand-rolled button an agent dropped into the repo — a near-duplicate
 * of the approved <Button>. Same API, different (inconsistent) styling. The
 * conformance audit should flag every usage of this and the applier should
 * repoint them onto the approved Button.
 */
export default function LegacyButton({ label, variant = 'primary', size = 'md', onClick }: LegacyButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: size === 'lg' ? '14px 28px' : '6px 12px',
        background: variant === 'danger' ? 'crimson' : '#98a3c3',
        color: '#fff',
        border: '2px solid black', // off-spec
        borderRadius: 2, // off-spec
        fontFamily: 'Times New Roman, serif', // off-spec
      }}
    >
      {label}
    </button>
  );
}
