# LienGuard Architecture — Tower Platform Model

**Status:** Canonical. Supersedes the "standalone-but-integrated app" framing in
`CLAUDE.md`, `attached_assets/lien_collections_SCOPE.md` §1.1/§1.4, and product decisions
**DD-01** and **DD-06**. Where this document conflicts with those, **this document governs.**

> This is the target architecture LienGuard is migrating to. It was decided in an
> architecture working session (2026-06-24). The migration is phased — see
> `docs/MIGRATION_PLAN.md` — and parts of this document describe the destination, not the
> current code. Current divergences are called out inline.

---

## 1. The model in one paragraph

There is **one platform — "Tower"** — that owns authentication, the single design system,
one multi-tenant Postgres database, and module gating. Tower is a **foundation, never a
product**: it is never sold or seen on its own. A **product** is `Tower + a set of activated
modules + the one design system`. **LienGuard** is therefore not a standalone app — it is
**Tower + the `lien-collections` module + the brand.** Buying a second product later just
activates more modules on the same Tower tenant, so products combine with **zero drift** and
**one front door**, because there was only ever one platform and one design system underneath.

## 2. Layers

| Layer | Owns | Notes |
|-------|------|-------|
| **Tower** (platform) | Auth, the one design system, one multi-tenant Postgres, module gating, the **vertical primary nav** | Headless / white-label. Never branded as itself; the product supplies the face. Never run alone. |
| **Modules** | A domain (e.g. lien & collections): its tables, routes, screens, and its **horizontal secondary nav** | Portable: run standalone (on Tower) or alongside other modules. Cannot import another module. |
| **Products** | A brand + a chosen set of modules | Thin shells. LienGuard, Helm, etc. |
| **External SaaS** | The records they already model (QBO invoices; HubSpot or Tower-CRM projects/parties; Connecteam hours) | Source of truth for *their* data, always. Reached via adapter-backed **ports**. The module owns only the **extension** data + workflow. |

**Navigation is two-level:** Tower renders the **vertical** primary bar (switch between
modules); each module renders its own **horizontal** bar (sections within it).

## 3. Locked technology decisions

| Concern | Decision | Supersedes |
|---------|----------|-----------|
| **ORM** | **Prisma** | the Drizzle decision (`.agents/memory/drizzle-prisma-decision.md`) |
| **Database** | **Supabase Postgres**, Row-Level Security available for tenant isolation | own-Postgres framing (DD-01/06) |
| **Auth + tenancy** | **Clerk**, with Clerk **Organizations** as the tenant layer (`Clerk org id == orgId`); integrated to Supabase via **Third-Party Auth** so RLS can read Clerk claims. Clerk verified **end-to-end** (backend verifies the Clerk token). | dual-auth (Replit OIDC + Clerk split); the Phase C "Auth model" open item |
| **API contract** | **OpenAPI-first → Orval → Zod + TanStack Query** (kept; already in place) | — |
| **Design system** | One system, extracted to its own package, hosted in **Storybook 8 + Chromatic** (visual-regression gate). Single-source tokens feed Tailwind. **No hardcoded colors.** | per-app shells / "use Helm's grid" note in SCOPE §256 |
| **Repo** | One **pnpm-workspaces monorepo** (`beacon-platform`). Task runner deferred (**Nx**-leaning, for generators + module-boundary linting) until ~8+ packages. | the separate-repo / standalone-deploy model |
| **Tenancy** | `orgId` comes **only** from the Clerk session/org claim — never from request body/query/params. **`DEFAULT_ORG_ID` is removed.** | single-tenant hardcode; the Phase C "Tenancy" open item |

## 4. The module contract (what makes a module portable)

Every module — and the `create-beacon-module` generator that scaffolds one — must satisfy:

1. **Structure** — the standard package shape.
2. **Nav manifest** — declares its one entry in Tower's vertical bar and its own horizontal
   sections, as **data** (`module.config.ts`), not JSX.
3. **Data ports** — every external dependency is an interface; a host supplies the adapter
   (QBO/HubSpot/Connecteam standalone, or Tower's own records when present).
4. **Auth** — gets the current user/permissions/`orgId` from Tower; never its own IdP.
5. **Theming** — every visual value from design-system tokens; nothing hardcoded.
6. **Gating** — a gating key so it can be switched on/off per tenant.
7. **Standalone harness** — runs against a minimal Tower when sold alone.

A module that satisfies these is portable and agent-buildable by construction.

## 5. What this means for the existing codebase

- **The domain engines are the crown jewels and are preserved**: `deadlineEngine`,
  `riskScore`, `holdEngine`, `documentTemplates`, `pdfRichText` are ORM-agnostic pure
  functions (ED-05). Persistence is ported *around* them; their logic and tests are not
  rewritten.
- **External integrations stay** but are reframed as declared **ports** — QBO/HubSpot/
  Connecteam are genuinely external systems of record, not a private boundary to defend.
- **The OpenAPI contract stays** and remains the source of truth for generated clients.
- **DD-01/DD-06 are retired** (see DECISIONS.md ED-08). LienGuard no longer "owns its own
  Postgres as a standalone app"; it owns a **module-namespaced slice** of Tower's database.

## 6. Current migration scope (Horizon H1)

Authorized now: **move LienGuard onto the new foundation**, lifted into the new
`beacon-platform` monorepo, **against a Tower *stub*** (`packages/tower-stub`). Real Tower is
extracted from Helm in a later horizon. The phased steps, checkpoints, and credential gates
are in `docs/MIGRATION_PLAN.md`. Nothing in this document is "done" until that plan marks it
so.
