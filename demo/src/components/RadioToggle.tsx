import React from 'react';

export interface RadioToggleProps {
  /** Field label. */
  label: string;
  /** Whether it's selected. */
  checked?: boolean;
}

/**
 * A rogue radio an agent used where the design calls for a Checkbox. This is NOT
 * a mechanical alignment — radio→checkbox is a real behavior change — so the
 * audit routes its usages to the agent brief, not the applier.
 */
export default function RadioToggle({ label, checked = false }: RadioToggleProps) {
  return (
    <label>
      <input type="radio" checked={checked} readOnly /> {label}
    </label>
  );
}
