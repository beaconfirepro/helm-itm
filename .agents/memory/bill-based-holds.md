---
name: Bill-based vendor holds
description: Why/how payment holds connect to a specific vendor bill, not just project/client
---

Payment holds are **bill-based**: a hold connects to one specific vendor bill (supplier invoice) via `holds.supplierInvoiceId` (-> invoiceLinks.id; external ref = qboSupplierInvoiceId). Null `supplierInvoiceId` = legacy/manual project- or client-wide hold.

**Why:** User requirement — "it is bill based. if we have been paid for design, we do not put holds on the design materials or services." Blanket project/client holds would wrongly block bills for already-paid scopes.

**How to apply:**
- The hold engine still uses project/client *triggers* (overdue-AR project -> schedule_hold; over-threshold client -> material_hold) but only to decide WHICH uncleared vendor bills to hold. Cleared (`clearedFlag=true`) supplier invoices are NEVER held.
- The engine manages **only** bill-based holds (keyed `holdType|supplierInvoiceId`); it deliberately leaves null-bill legacy holds untouched. So the system is not purely bill-based until legacy holds are migrated or downstream consumers ignore null `supplierInvoiceId`.
- There is currently NO scope/phase mapping from a vendor bill to a customer invoice, so "skip the paid scope's bills" is approximated by `clearedFlag` only. True scope-matching needs a vendor-bill -> scope/phase link that does not yet exist in the schema.
- `/api/holds` and `/api/external/holds` expose `supplierInvoiceId`, `supplierBillRef` (qboSupplierInvoiceId), `supplierBillAmount`, `supplierBillDueDate` via left-join to invoiceLinks.
- No DB uniqueness guard on active `(orgId, holdType, supplierInvoiceId)`; single-run recompute is idempotent but concurrent recomputes could duplicate.
