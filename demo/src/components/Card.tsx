import React from 'react';

export interface CardProps {
  /** Heading shown at the top of the card. */
  title: string;
  /** Body content of the card. */
  children?: React.ReactNode;
  /** Raise the card with a drop shadow. */
  elevated?: boolean;
}

/** A simple titled container — exercises `children` (node) prop handling. */
export default function Card({ title, children, elevated = false }: CardProps) {
  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        borderRadius: 8,
        padding: 16,
        maxWidth: 320,
        boxShadow: elevated ? '0 6px 18px rgba(0,0,0,0.12)' : 'none',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <h3 style={{ margin: '0 0 8px' }}>{title}</h3>
      <div style={{ color: '#4b5563' }}>{children}</div>
    </div>
  );
}
