import { pgEnum } from "drizzle-orm/pg-core";

export const lienWorkflowTypeEnum = pgEnum("lien_workflow_type", [
  "residential_sub",
  "commercial_sub",
  "public_bond",
  "none",
]);

export const contractorTierEnum = pgEnum("contractor_tier", [
  "first_tier",
  "second_tier",
]);

export const lienClockTriggerEnum = pgEnum("lien_clock_trigger", [
  "none",
  "design_start",
  "field_work_start",
]);

export const workStreamEnum = pgEnum("work_stream", [
  "construction",
  "design",
]);

export const lienScheduleOfValuesStatusEnum = pgEnum("lien_schedule_of_values_status", [
  "open",
  "at_risk",
  "notice_active",
  "filing",
  "filed",
  "released",
  "closed",
  "lapsed",
]);

export const ruleKindEnum = pgEnum("rule_kind", [
  "notice",
  "filing",
  "retainage",
  "post_filing_notice",
  "enforcement",
  "release",
]);

export const businessDayHandlingEnum = pgEnum("business_day_handling", [
  "next_business_day",
  "exact",
]);

export const noticeTypeEnum = pgEnum("notice_type", [
  "early_warning",
  "statutory_claim",
  "retainage_claim",
]);

export const noticeStatusEnum = pgEnum("notice_status", [
  "draft",
  "approved",
  "sent",
  "delivered",
]);

export const noticeRecipientTypeEnum = pgEnum("notice_recipient_type", [
  "owner",
  "original_contractor",
]);

export const waiverTypeEnum = pgEnum("waiver_type", [
  "conditional_progress",
  "unconditional_progress",
  "conditional_final",
  "unconditional_final",
]);

export const waiverApprovalStatusEnum = pgEnum("waiver_approval_status", [
  "not_required",
  "pending_pm",
  "pending_pm_finance",
  "approved",
  "rejected",
]);

export const filingStatusEnum = pgEnum("filing_status", [
  "not_filed",
  "compliance_check",
  "affidavit_draft",
  "exported",
  "filed",
  "post_filing_notice_sent",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "not_required",
  "requested",
  "generated",
  "signed",
  "filed",
]);

export const partyRelationTypeEnum = pgEnum("party_relation_type", [
  "owner",
  "original_contractor",
  "hiring_party",
]);

export const holdTypeEnum = pgEnum("hold_type", [
  "schedule_hold",
  "material_hold",
]);

export const supplierNoticeRiskStatusEnum = pgEnum("supplier_notice_risk_status", [
  "none",
  "flagged",
  "cleared",
]);

export const collectionStatusEnum = pgEnum("collection_status", [
  "current",
  "overdue",
  "in_collections",
  "promised",
  "payment_plan",
  "escalated",
  "written_off",
  "resolved",
]);

export const escalationStageEnum = pgEnum("escalation_stage", [
  "none",
  "soft_collections",
  "pre_lien_notice",
  "lien_filing",
  "agency_attorney",
  "write_off",
]);

export const dunningStepTypeEnum = pgEnum("dunning_step_type", [
  "reminder",
  "statement",
  "call",
  "final_demand",
]);

export const promiseStatusEnum = pgEnum("promise_status", [
  "open",
  "kept",
  "broken",
  "cancelled",
]);

export const paymentPlanStatusEnum = pgEnum("payment_plan_status", [
  "active",
  "completed",
  "defaulted",
  "cancelled",
]);

export const collectionActivityMethodEnum = pgEnum("collection_activity_method", [
  "email",
  "phone",
  "letter",
  "sms",
  "portal",
  "in_person",
]);

export const integrationSourceEnum = pgEnum("integration_source", [
  "hubspot",
  "connecteam",
  "qbo",
]);

export const syncStatusEnum = pgEnum("sync_status", [
  "pending",
  "synced",
  "error",
]);
