import React from 'react';
import LegacyButton from '../components/LegacyButton';

/** Uses ONLY the rogue LegacyButton — applying should swap the import to Button. */
export function Settings() {
  return (
    <section style={{ padding: 24, display: 'grid', gap: 12 }}>
      <h2>Settings</h2>
      <LegacyButton label="Save changes" variant="primary" size="lg" />
      <LegacyButton label="Reset" variant="secondary" />
    </section>
  );
}
