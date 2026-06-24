# @beacon/design

The **single design system** — the one front-door look, shared by every product. Hosted in
**Storybook 8** (visual-regression via Chromatic added at P3). Tokens are single-source and feed
Tailwind; **no hardcoded colors** anywhere downstream.

Owns the two-level navigation shells: **Tower's vertical primary nav** and the **module
horizontal secondary nav** primitives.

**Lands here (P3):** extracted from LienGuard's `artifacts/lien-collections` components +
Tailwind/token config, reconciled to one token set. Placeholder until then.
