import React from 'react';
import Button from './components/Button';
import LegacyButton from './components/LegacyButton';
import { Badge } from './components/Badge';
import Card from './components/Card';

/** Example screen — mixes the approved Button with a rogue LegacyButton. */
export default function App() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 16 }}>
      <Card title="Welcome" elevated>
        <Badge label="New" tone="success" />
        <p>Get started with your dashboard.</p>
        <Button label="Get started" variant="primary" size="lg" />
        <LegacyButton label="Cancel" variant="secondary" />
      </Card>
    </main>
  );
}
