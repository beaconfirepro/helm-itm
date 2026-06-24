# Decision Log

**Single source of truth for engineering & process decisions on LienGuard.**

This file complements — does not replace — the **product** decisions (`DD-01…DD-13`)
recorded in `attached_assets/lien_collections_SCOPE.md`. Product/scope decisions live
there; *how we build, test, gate, and operate* lives here.

> **Why in the repo (and not only a Claude "cowork" project)?** Anything that should
> bind future Claude Code sessions and human contributors must live **in the repo**,
> because that is the only context every coding session and reviewer actually sees. A
> Claude.ai Project's uploaded knowledge is **not** visible to Claude Code sessions
> running against this repository. Use the cowork project for human brainstorming, but
> **land durable decisions here** (and behavioral rules in `CLAUDE.md`). When a decision
> is made in chat or in cowork, add a row here so everyone works off the same gumbo.

**Knowledge map (where things go):**
| Kind of knowledge | Home |
|-------------------|------|
| Rules that change how Claude behaves in this repo / how to run things | `CLAUDE.md` (auto-loaded every session) |
| Product/scope decisions (`DD-xx`) | `attached_assets/lien_collections_SCOPE.md` |
| Engineering & process decisions (`ED-xx`) | **this file** |
| The phased plan + live status | `docs/PRODUCTION_PLAN.md` |
| Hard-won technical gotchas | `.agents/memory/` |
| Legal-review package for the rule set | `docs/TEXAS_RULE_SET_LEGAL_REVIEW.md` |

Status: ✅ decided · 🔄 provisional (revisit) · ❓ open

---

## ED-01 — CI is the hard merge gate ✅
`build-and-test` (install → typecheck → build → API tests on a Postgres service) is a
**required** status check on PRs to `main`. Nothing merges red. Rationale: the broken
build that prompted this work shipped precisely because Vite/esbuild skip type-checking
and there was no gate. _(2026-06-22)_

## ED-02 — Copilot review stays advisory, not required ✅
Automatic Copilot PR review is enabled for a second set of eyes, but it is **not** a
required status check — AI review must not be able to block a merge, and statutory/legal
correctness is owned by humans + counsel, not an AI reviewer. _(2026-06-22)_

## ED-03 — One ruleset, targeting the default branch ✅
Branch protection is a **single** ruleset targeting `main` only (require PR + require
`build-and-test`). Targeting all branches blocks feature-branch pushes (checks can't run
before the branch exists). _(2026-06-22)_

## ED-04 — DD-04 legal-review gate: enforced in prod, ships locked ✅
No notice is sent and no lien is exported/recorded on a rule set with
`legalReviewed = false`, enforced in **production only** (relaxed in dev/test/UAT, or via
`LEGAL_REVIEW_BYPASS=1`). The seed now ships **`legalReviewed: false`**; it is flipped to
`true` only after counsel signs off, via the admin review endpoint (see
`docs/TEXAS_RULE_SET_LEGAL_REVIEW.md`). _(2026-06-22)_

## ED-05 — "Pure core, thin I/O" for testable logic ✅
Decision logic is extracted into pure functions unit-tested without a DB, with DB I/O kept
thin around them: `deadlineEngine.computeDeadline`, `riskScore.scoreRisk`,
`holdEngine.planHoldChanges`, `legalReview.ruleSetsPermitSend`. New domain logic should
follow this shape so it can be locked by fast tests. _(2026-06-22)_

## ED-06 — The repo is the single source of truth for decisions ✅
See the banner above. Durable decisions land in-repo; the cowork project is not visible to
coding sessions. _(2026-06-22)_

## ED-07 — Repo-wide formatting/lint deferred to Phase E 🔄
~210 files have Prettier drift, so a `--check` gate would be red everywhere. A deliberate
format-everything pass + ESLint config is scoped to Phase E (E3) rather than blocking
current work. _(2026-06-22)_

---

## Architecture re-founding (2026-06-24)

The following decisions re-found LienGuard from a "standalone-but-integrated app" into the
first **module** on the **Tower** platform. Full rationale and target architecture:
`docs/ARCHITECTURE.md`. Migration sequence + checkpoints: `docs/MIGRATION_PLAN.md`.

## ED-08 — Tower platform model; DD-01/DD-06 retired ✅
LienGuard is **not a standalone app**. A product = `Tower (platform) + activated modules +
one design system`; LienGuard = `Tower + lien-collections module + brand`. Tower owns auth,
the design system, one multi-tenant Postgres, and module gating, and is never sold/seen
alone. This **supersedes DD-01** (standalone app) and **DD-06** (own-Postgres / integrate-
across-a-boundary as founding law). External SaaS (QBO/HubSpot/Connecteam) remain source of
truth via adapter-backed **ports**; the module owns only extension data + workflow.
_(2026-06-24)_

## ED-09 — ORM is Prisma ✅
Migrate off Drizzle to **Prisma** (the platform-wide ORM; Helm already uses it). Supersedes
`.agents/memory/drizzle-prisma-decision.md`. The schema is authored as a **module-namespaced
slice** so it can live in Tower's shared database. Domain engines stay ORM-agnostic (ED-05).
_(2026-06-24)_

## ED-10 — Data is Supabase Postgres; auth+tenancy is Clerk ✅
Resolves the Phase C **Auth** and **Tenancy** open items. **Supabase Postgres** (RLS
available for tenant isolation). **Clerk** for identity, with Clerk **Organizations** as the
tenant layer — **`Clerk org id == orgId`**. Clerk↔Supabase via **Third-Party Auth** so RLS
can read Clerk claims. **Clerk end-to-end**: the backend verifies the Clerk token; **Replit
OIDC is removed** (the prior dual-auth pain was a frontend/backend IdP *split*, not Clerk
itself). **`DEFAULT_ORG_ID` is removed**; `orgId` comes only from the Clerk session/org
claim, never from a request. _(2026-06-24)_

## ED-11 — One design system in Storybook 8 + Chromatic ✅
A single design system, extracted to its own package, hosted in **Storybook 8** with
**Chromatic** visual-regression as a CI gate (drift is caught automatically). Single-source
tokens feed Tailwind; **no hardcoded colors**. Two-level nav: Tower owns the vertical primary
bar, each module owns its horizontal secondary bar. Supersedes the SCOPE §256 "use Helm's
app-shell grid" note. _(2026-06-24)_

## ED-12 — One pnpm monorepo; task runner deferred ✅
All of Tower, the design system, modules, and product shells live in one **pnpm-workspaces
monorepo** (`beacon-platform`). Run tasks via `pnpm -r` for now; a task runner (**Nx**-
leaning, for its generators + module-boundary linting) is **deferred** until the package
count justifies it (~8+ packages). OpenAPI-first + Orval + Zod is **kept** as the API
contract. _(2026-06-24)_

## ED-13 — Migration is phased; current scope is H1 ✅
Authorized scope is **Horizon H1**: move LienGuard onto the new foundation, lifted into the
new monorepo, against a **Tower stub** (real Tower extraction from Helm is a later horizon).
Phased, one PR per phase, green typecheck at every checkpoint, with credential and
irreversible-cutover gates called out in `docs/MIGRATION_PLAN.md`. _(2026-06-24)_

---

## Open / upcoming decisions ❓
These are flagged for an explicit decision in their phase (see `docs/PRODUCTION_PLAN.md`):

- ~~**Auth model (Phase C).**~~ **Resolved — ED-10** (Clerk end-to-end).
- ~~**Tenancy (Phase C).**~~ **Resolved — ED-10** (`orgId` from Clerk org; `DEFAULT_ORG_ID`
  removed).
- **HELM integration contract (later horizon).** Under the Tower model this becomes a
  cross-module/Tower concern (reference layer + hold flags) rather than an `/external/*`
  read API; confirm shapes when Tower is extracted from Helm. _(supersedes the old Phase E/E6
  framing)_
- **Credentials (gate before foundation swap).** Clerk app (Organizations), Supabase
  project, Chromatic token — provisioned before the Prisma/Clerk phase. _(owner: Deb)_
