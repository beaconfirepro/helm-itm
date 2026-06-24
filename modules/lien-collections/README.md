# @beacon/lien-collections (module)

The lien & collections module — Beacon's two jobs over an uncleared invoice: **collections**
(dunning ladder) and **lien rights** (Texas Property Code Ch. 53, built multi-state as data).

Must satisfy the **module contract** (see `docs/ARCHITECTURE.md` §4): a `module.config.ts`
manifest (one vertical-nav entry + horizontal sections + gating key + declared data ports),
content-only screens (no own chrome), data via injected ports (QBO/HubSpot/Connecteam or Tower
records), auth/orgId from Tower, tokens-only theming, and a standalone harness.

**Lands here:** the crown-jewel engines (`deadlineEngine`, `riskScore`, `holdEngine`,
`documentTemplates`, `pdfRichText`) and routes from LienGuard's `artifacts/api-server`, plus the
feature screens from `artifacts/lien-collections`. The engines are ORM-agnostic and carry over
unchanged. Placeholder until the lift.
