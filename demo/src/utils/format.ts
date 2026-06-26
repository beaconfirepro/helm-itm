/**
 * A plain utility module — NOT a component. The scanner should discover no
 * components here and generate nothing for it.
 */

export function formatCurrency(value: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
}

export const TAX_RATE = 0.0825;
