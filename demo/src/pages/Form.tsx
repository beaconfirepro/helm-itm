import React from 'react';
import RadioToggle from '../components/RadioToggle';

/** Uses RadioToggle where a Checkbox is wanted — routed to agents, not applied. */
export function Form() {
  return (
    <form style={{ padding: 24, display: 'grid', gap: 8 }}>
      <RadioToggle label="Email me updates" checked />
      <RadioToggle label="Enable beta features" />
    </form>
  );
}
