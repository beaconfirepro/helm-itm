import React from 'react';
import Button from '../components/Button';
import LegacyButton from '../components/LegacyButton';
import { Badge } from '../components/Badge';

/** Second usage site — uses both the approved Button and the rogue LegacyButton. */
export function Dashboard() {
  return (
    <section style={{ padding: 24, display: 'grid', gap: 12 }}>
      <Badge label="Beta" tone="warning" />
      <Button label="Refresh" onClick={() => {}} />
      <LegacyButton label="Delete" variant="danger" />
      <LegacyButton label="Archive" />
    </section>
  );
}
