# Texas Lien Rule Set — Legal Review Package

**Purpose.** This document is written for a reviewing attorney (and the product
owner preparing the review). It lays out **every statutory deadline rule the
system currently applies**, in plain English, alongside **exactly how the code
computes each date**, so counsel can confirm the encoded logic matches Texas
Property Code Chapter 53.

> ⚠️ **Not legal advice.** The plain-English interpretations and statute
> citations below were written by the engineering team from the seed data and
> code. Every row needs a lawyer's confirmation. Items flagged **[VERIFY]** are
> where we are least certain.

**Scope reviewed:** the single seeded rule set `TX-2022.01`
(`Tex. Prop. Code Ch. 53`, effective 2022-01-01).
**Source files:**
- Seeded rules (the data): `lib/db/src/seed.ts`
- The engine that applies them: `artifacts/api-server/src/lib/deadlineEngine.ts`
- The production gate: `artifacts/api-server/src/lib/legalReview.ts`

---

## 1. How the system applies the statute (architecture)

Statutory deadlines are **data, not code** (decision DD-03). Each deadline is a
row in `lien_rules` describing an *anchor* date and an *offset*; a single generic
engine (`computeDeadline`) turns `(rule + anchor context)` into two dates:

- **`computedDate`** — the raw statutory date from the arithmetic below.
- **`adjustedDate`** — `computedDate` rolled forward to the next business day
  when the rule says so (Texas § 53.003(e)). This is the operative deadline.

Every computed deadline also stores a **`sourceData` provenance snapshot**
(statute citation, anchor, the invoice/timesheet it derived from) so a
coordinator — or an auditor — can see *why* a date is what it is.

### 1.1 The anchor + offset model (pseudocode)

```
computeDeadline(rule, workMonthDate, completionDate, filingDate):
    # 1. Pick the anchor date the statute counts from.
    anchor = {
        "work_month":  workMonthDate,     # 1st day of the month work was performed
        "completion":  completionDate,    # project/scope completion (may be unknown yet)
        "filing_date": filingDate,        # date the lien affidavit was recorded
    }[rule.anchor]
    if anchor is null: return null         # not computable yet — skip, recompute later

    # 2. Apply the offset.
    if rule.offsetMonths and rule.offsetDayOfMonth:
        # "the Nth day of the Mth month after the anchor"
        raw = date(anchor.year, anchor.month + offsetMonths, offsetDayOfMonth)
    elif rule.offsetDays:
        raw = anchor + offsetDays         # business days if offsetIsBusinessDays, else calendar
    else:
        raw = anchor

    # 3. Roll forward over weekends + Texas state holidays (§ 53.003(e)) when required.
    adjusted = nextBusinessDay(raw) if rule.businessDayHandling == "next_business_day" else raw

    return { computedDate: raw, adjustedDate: adjusted, sourceData: {...} }
```

### 1.2 Business-day / holiday handling (§ 53.003(e))

`nextBusinessDay` skips Saturdays, Sundays, and **Texas state holidays**
(Tex. Gov't Code § 662.021): New Year's, MLK, Presidents', Texas Independence
(Mar 2), San Jacinto (Apr 21), Memorial, Juneteenth, Independence, LBJ (Aug 27),
Labor, Columbus, Veterans, Thanksgiving, Christmas — each with weekend-observed
shifting. **[VERIFY]** that this holiday list (and the "next business day"
treatment) is the correct construction of § 53.003(e) for *every* rule kind
below — some deadlines may be statutory "no roll" dates.

> **Default note:** rules that don't set `businessDayHandling` inherit the column
> default `next_business_day`, so they **do** roll. Today that means retainage,
> filing, and enforcement deadlines roll to the next business day. **[VERIFY]**

---

## 2. The seeded rules (the full set under review)

All 8 rules belong to rule set `TX-2022.01`. Only `commercial_sub` and
`residential_sub` workflows are encoded; `public_bond` / `none` are intentionally
out of scope (DD-11).

| # | Rule id | Workflow | Stream | Kind | Anchor + offset | Statute (as coded) | Plain-English (DRAFT — [VERIFY]) |
|---|---------|----------|--------|------|-----------------|--------------------|----------------------------------|
| 1 | `rule_cs_notice` | commercial_sub | construction | notice | work_month **+3 months**, day **15**, roll | **§ 53.056(a-1)(1)** | Pre-lien (fund-trapping) notice to owner & GC is due by the **15th day of the 3rd month** after each month unpaid work was performed. |
| 2 | `rule_cs_filing` | commercial_sub | construction | filing | work_month **+4 months**, day **15**, roll | **§ 53.052(b)** | Lien affidavit must be filed by the **15th day of the 4th calendar month** after the month the (commercial) work/indebtedness accrued. |
| 3 | `rule_rs_notice` | residential_sub | construction | notice | work_month **+2 months**, day **15**, roll | **§ 53.056(a-1)(2)** | Pre-lien notice for a **residential** project is due by the **15th day of the 2nd month** after each unpaid work month. |
| 4 | `rule_rs_filing` | residential_sub | construction | filing | work_month **+3 months**, day **15**, roll | **§ 53.052(c)** | Lien affidavit on a **residential** project must be filed by the **15th day of the 3rd calendar month** after accrual. |
| 5 | `rule_retainage` | commercial_sub | construction | retainage | completion **+30 calendar days**, roll | **§ 53.057(a-1)** | Notice claiming unpaid **retainage** is due **30 days** after completion/termination/abandonment. |
| 6 | `rule_postfile` | commercial_sub | construction | post_filing_notice | filing_date **+5 business days** | **§ 53.055(a)(b)** | Within **5 business days** of filing the affidavit, mail a copy to the owner and the original contractor. |
| 7 | `rule_enforce` | commercial_sub | construction | enforcement | filing_date **+365 calendar days**, roll | **§ 53.158(a)** | Suit to foreclose the lien must be brought within the statutory window (coded as **~1 year** from filing). |
| 8 | `rule_design_filing` | commercial_sub | **design** | filing | filing_date **+0** | **§ 53.124(e)** | Lien **inception** date for design/professional work (coded as equal to the filing date). |

---

## 3. Worked examples (what the code actually outputs)

These mirror the engine's unit tests (`test/deadline-engine.test.ts`).

- **Commercial notice (rule 1).** Work performed in **March 2026** → `+3 months`,
  day 15 → **June 15, 2026**. June 15 2026 is a Monday (a business day) → no
  roll. Operative deadline = **2026-06-15**.
- **Business-day roll (§ 53.003(e)).** A deadline computed as **Sat Feb 14, 2026**
  rolls past Sun Feb 15 and **Presidents' Day Mon Feb 16** to **Tue Feb 17, 2026**.
- **Post-filing notice (rule 6).** Affidavit filed **Tue Jun 30, 2026** → `+5
  business days`, skipping the observed Independence Day (Fri Jul 3) and the
  weekend → **Wed Jul 8, 2026**.
- **Anchor not yet known.** Retainage (anchored on `completion`) and enforcement
  (anchored on `filing_date`) return **no deadline** until that date exists; the
  monthly run recomputes them once it does.

---

## 4. Open questions for counsel ([VERIFY] — prioritized)

1. **Coverage gaps by workflow.** `retainage`, `post_filing_notice`, and
   `enforcement` rules exist **only for `commercial_sub`**, not `residential_sub`.
   Is that correct, or should residential projects carry retainage / post-filing /
   enforcement deadlines too?
2. **Design stream.** The `design` workflow has **only** a `filing` (inception)
   rule (§ 53.124(e)) and **no notice/retainage** rules. Confirm whether design/
   professional-services liens need their own notice deadlines.
3. **Business-day rolling per rule kind.** Confirm § 53.003(e)'s "next business
   day" treatment applies to **each** deadline as coded — especially the
   **filing** deadline (§ 53.052) and the **1-year enforcement** deadline
   (§ 53.158), which currently roll forward by default.
4. **The "15th of the Nth month" counts.** Confirm the month counts: commercial
   notice = 3rd month, commercial filing = 4th month, residential notice = 2nd
   month, residential filing = 3rd month.
5. **Retainage anchor & window.** Confirm "completion + 30 days" is the right
   anchor/length for § 53.057, and what event legally starts the clock
   (completion vs. termination vs. abandonment).
6. **Enforcement window.** § 53.158 is coded as a flat **365 days** from filing.
   Confirm the correct period and whether it can be extended by agreement.
7. **Holiday set.** Confirm the Texas state-holiday list used to roll dates is
   complete and correct for deadline purposes.
8. **Statute citations.** Confirm each subsection citation in the table
   (e.g., `§ 53.056(a-1)(1)` vs `(2)`, `§ 53.055(a)(b)`).

---

## 5. The production gate (DD-04) and its current status

No statutory notice may be **sent**, and no lien may be **exported or recorded**,
on a rule set that has not passed legal review — enforced in production by
`legalReview.ts` (`legalReviewed` must be `true` on the jurisdiction's rule set).

The seed now ships the Texas rule set **locked** (`legalReviewed: false`,
`lib/db/src/seed.ts`), so in production the gate blocks until a real review. To
lift the gate:
> 1. Complete this review (Section 4).
> 2. Flip the flag to `true` **only** via the admin review endpoint
>    (`PATCH /config/rule-sets/:id/review`) once counsel signs off — and record
>    who/when in Section 6.

The gate is enforced in production only, so development, test, and UAT flows are
unaffected by the locked flag.

---

## 6. Sign-off

| Rule set | Reviewer (counsel) | Date | Outcome | Notes |
|----------|--------------------|------|---------|-------|
| `TX-2022.01` | _pending_ | | ⬜ approved / ⬜ changes requested | |

When approved, set `legalReviewed = true` and link this signed document from the
rule set's admin screen.
