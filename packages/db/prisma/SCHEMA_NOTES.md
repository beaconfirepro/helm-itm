# Prisma schema — translation notes & reviewer checklist

Source: LienGuard Drizzle schema (`lib/db/src/schema/{enums,tables}.ts`), translated 2026-06-24.
Output: `schema.prisma` (this dir). Passes `prisma validate`. **First pass — needs review before `prisma migrate`.**

## Scope
- 25 enums + 35 models (Organization + 34 domain tables).
- SKIPPED (auth → Clerk+Tower per ED-10): `sessions`, `users`, enums `user_role`, `user_theme`.
- `@@map`/`@map` preserve physical table/column names → binds to the existing DB.
- All `orgId` fields + `@@index([orgId])` preserved (orgId will map to Clerk org id).

## ⚠ TOP RISK — relations are INFERRED; the source DB has NO foreign keys
The Drizzle schema declares **zero** `.references()` — every "FK" is a bare indexed `text` column.
The Prisma schema reconstructs `@relation`s by inference from column/index names. Therefore:
- Prisma will create **real FK constraints the live DB does not currently have.**
- **P2 must run a referential-integrity audit + cleanup** (find/fix orphan rows) BEFORE
  `prisma migrate`, or the migration will fail on constraint violations.
- Consider an interim step: introduce relations but verify integrity first; only then enforce.

## Reviewer checklist (judgment calls to confirm)
1. Inferred relations correctness — esp. `lienScheduleOfValuesId`, `lienProjectId`, `ruleSetId`,
   `departmentId` chains.
2. `work_months.invoiceLinkId`, `waivers.invoiceLinkId`, `supplier_notice_risks.invoiceLinkId`
   left as plain String (no relation) — decide if they should be real relations.
3. `InvoiceLink.linkedClientId` — left as plain String (no index/back-relation).
4. `Hold` — `supplierInvoiceId` kept as indexed String (references a QBO external id, not a table).
5. Decimal defaults: `total_overdue` default `"0"` → `@default(0)` — verify serialization.
6. Timestamps mapped `@db.Timestamptz`. No date/bigint/uuid/varchar columns existed.
   IDs are `String @id @default(uuid())` (client-generated, matches Drizzle `$defaultFn`).
   `Organization.id` has no default (kept `@id` only).
7. jsonb (`sync_jobs.payload`, `lien_deadlines.source_data`, `risk_score_configs.config`,
   `audit_logs.{before,after,details}`) typed as opaque `Json` — app-validated, confirm OK.
8. User-FK columns kept as plain `String?` (no relation; Clerk user ids):
   `invoice_links.cleared_by_user_id`, `lien_deadlines.override_by_user_id`,
   `notices.approved_by_user_id`, `waivers.{pm,finance}_approved_by_user_id`,
   `collection_activities.created_by_user_id`, `document_templates.updated_by_user_id`,
   `audit_logs.actor_user_id`.
9. `audit_logs` is append-only (createdAt only, no `@updatedAt`) — preserved.

## Destination
Lands in the monorepo as the `lien-collections` module's Prisma schema slice
(namespaced so it can live in Tower's shared DB). Move here once `beacon-platform` exists.
