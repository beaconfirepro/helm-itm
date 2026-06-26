import React from 'react';

export interface ButtonProps {
  /** Text shown inside the button. */
  label: string;
  /** Visual emphasis of the button. */
  variant?: 'primary' | 'secondary' | 'danger';
  /** Control the button size. */
  size?: 'sm' | 'md' | 'lg';
  /** Disable interaction. */
  disabled?: boolean;
  /** Called when the button is clicked. */
  onClick?: () => void;
}

const PADDING: Record<string, string> = {
  sm: '4px 10px',
  md: '8px 16px',
  lg: '12px 22px',
};

const BACKGROUND: Record<string, string> = {
  primary: '#2563eb',
  secondary: '#6b7280',
  danger: '#dc2626',
};

/** A primary call-to-action button with size and variant options. */
export default function Button({
  label,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: PADDING[size],
        background: disabled ? '#cbd5e1' : BACKGROUND[variant],
        color: 'white',
        border: 'none',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontWeight: 600,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {label}
    </button>
  );
}
