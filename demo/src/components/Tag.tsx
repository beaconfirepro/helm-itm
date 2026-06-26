import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

// shadcn/ui-style: appearance lives in a cva config (the "Anti-Component" model).
// Untitled UI is the same shape via tailwind-variants `tv()`.
const tagVariants = cva('inline-flex items-center rounded px-2 py-0.5 font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-gray-100 text-gray-800',
      success: 'bg-green-100 text-green-800',
      warning: 'bg-amber-100 text-amber-800',
      brand: 'bg-brand-600 text-white',
    },
    size: {
      sm: 'text-xs',
      md: 'text-sm',
    },
  },
  defaultVariants: { tone: 'brand', size: 'sm' },
});

export interface TagProps extends VariantProps<typeof tagVariants> {
  /** Text content of the tag. */
  label: string;
}

/**
 * A cva-driven tag. The addon can read its variant config and ADD new
 * values/axes from the UI — the prop and its type come free from `VariantProps`.
 */
export default function Tag({ label, tone, size }: TagProps) {
  return <span className={tagVariants({ tone, size })}>{label}</span>;
}
