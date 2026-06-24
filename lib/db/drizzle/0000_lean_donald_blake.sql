CREATE TYPE "public"."user_role" AS ENUM('admin', 'pm', 'finance', 'coordinator');--> statement-breakpoint
CREATE TYPE "public"."user_theme" AS ENUM('light', 'dark', 'system');--> statement-breakpoint
CREATE TYPE "public"."business_day_handling" AS ENUM('next_business_day', 'exact');--> statement-breakpoint
CREATE TYPE "public"."collection_activity_method" AS ENUM('email', 'phone', 'letter', 'sms', 'portal', 'in_person');--> statement-breakpoint
CREATE TYPE "public"."collection_status" AS ENUM('current', 'overdue', 'in_collections', 'promised', 'payment_plan', 'escalated', 'written_off', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."contractor_tier" AS ENUM('first_tier', 'second_tier');--> statement-breakpoint
CREATE TYPE "public"."dunning_step_type" AS ENUM('reminder', 'statement', 'call', 'final_demand');--> statement-breakpoint
CREATE TYPE "public"."escalation_stage" AS ENUM('none', 'soft_collections', 'pre_lien_notice', 'lien_filing', 'agency_attorney', 'write_off');--> statement-breakpoint
CREATE TYPE "public"."filing_status" AS ENUM('not_filed', 'compliance_check', 'affidavit_draft', 'exported', 'filed', 'post_filing_notice_sent');--> statement-breakpoint
CREATE TYPE "public"."hold_type" AS ENUM('schedule_hold', 'material_hold');--> statement-breakpoint
CREATE TYPE "public"."integration_source" AS ENUM('hubspot', 'connecteam', 'qbo');--> statement-breakpoint
CREATE TYPE "public"."lien_clock_trigger" AS ENUM('none', 'design_start', 'field_work_start');--> statement-breakpoint
CREATE TYPE "public"."lien_stream_status" AS ENUM('open', 'at_risk', 'notice_active', 'filing', 'filed', 'released', 'closed', 'lapsed');--> statement-breakpoint
CREATE TYPE "public"."lien_workflow_type" AS ENUM('residential_sub', 'commercial_sub', 'public_bond', 'none');--> statement-breakpoint
CREATE TYPE "public"."notice_recipient_type" AS ENUM('owner', 'original_contractor');--> statement-breakpoint
CREATE TYPE "public"."notice_status" AS ENUM('draft', 'approved', 'sent', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."notice_type" AS ENUM('early_warning', 'statutory_claim', 'retainage_claim');--> statement-breakpoint
CREATE TYPE "public"."party_relation_type" AS ENUM('owner', 'original_contractor', 'hiring_party');--> statement-breakpoint
CREATE TYPE "public"."payment_plan_status" AS ENUM('active', 'completed', 'defaulted', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."promise_status" AS ENUM('open', 'kept', 'broken', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."release_status" AS ENUM('not_required', 'requested', 'generated', 'signed', 'filed');--> statement-breakpoint
CREATE TYPE "public"."rule_kind" AS ENUM('notice', 'filing', 'retainage', 'post_filing_notice', 'enforcement', 'release');--> statement-breakpoint
CREATE TYPE "public"."supplier_notice_risk_status" AS ENUM('none', 'flagged', 'cleared');--> statement-breakpoint
CREATE TYPE "public"."sync_status" AS ENUM('pending', 'synced', 'error');--> statement-breakpoint
CREATE TYPE "public"."waiver_approval_status" AS ENUM('not_required', 'pending_pm', 'pending_pm_finance', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."waiver_type" AS ENUM('conditional_progress', 'unconditional_progress', 'conditional_final', 'unconditional_final');--> statement-breakpoint
CREATE TYPE "public"."work_stream" AS ENUM('construction', 'design');--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"role" "user_role",
	"display_name" varchar,
	"avatar_url" varchar,
	"theme" "user_theme" DEFAULT 'system' NOT NULL,
	"language" varchar DEFAULT 'en' NOT NULL,
	"currency" varchar DEFAULT 'USD' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "collection_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"linked_client_id" text NOT NULL,
	"status" "collection_status" DEFAULT 'current' NOT NULL,
	"escalation_stage" "escalation_stage" DEFAULT 'none' NOT NULL,
	"total_overdue" numeric(12, 2) DEFAULT '0' NOT NULL,
	"oldest_overdue_days" integer DEFAULT 0 NOT NULL,
	"risk_score" integer,
	"dunning_sequence_id" text,
	"current_dunning_step_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_accounts_linked_client_id_unique" UNIQUE("linked_client_id")
);
--> statement-breakpoint
CREATE TABLE "collection_activities" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"method" "collection_activity_method" NOT NULL,
	"activity_date" timestamp with time zone NOT NULL,
	"notes" text,
	"hubspot_activity_id" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"document_type" text NOT NULL,
	"branding" text,
	"intro" text,
	"closing" text,
	"signature" text,
	"footer" text,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunning_sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dunning_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"sequence_id" text NOT NULL,
	"step_type" "dunning_step_type" NOT NULL,
	"days_overdue" integer NOT NULL,
	"order" integer NOT NULL,
	"template_ref" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holds" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"hold_type" "hold_type" NOT NULL,
	"lien_project_id" text,
	"linked_client_id" text,
	"supplier_invoice_id" text,
	"reason" text NOT NULL,
	"set_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_project_id" text,
	"linked_client_id" text,
	"qbo_invoice_id" text,
	"qbo_supplier_invoice_id" text,
	"is_supplier_invoice" boolean DEFAULT false NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"invoice_date" timestamp with time zone NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"qbo_status" text NOT NULL,
	"cleared_flag" boolean DEFAULT false NOT NULL,
	"cleared_at" timestamp with time zone,
	"cleared_by_user_id" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jurisdictions" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_deadlines" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"work_month_id" text NOT NULL,
	"rule_id" text NOT NULL,
	"rule_kind" "rule_kind" NOT NULL,
	"computed_date" timestamp with time zone NOT NULL,
	"adjusted_date" timestamp with time zone NOT NULL,
	"source_data" jsonb NOT NULL,
	"satisfied_at" timestamp with time zone,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"override_date" timestamp with time zone,
	"override_by_user_id" text,
	"override_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_filings" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_stream_id" text NOT NULL,
	"status" "filing_status" DEFAULT 'not_filed' NOT NULL,
	"affidavit_doc_url" text,
	"county" text,
	"filing_date" timestamp with time zone,
	"recording_ref" text,
	"filing_fee" numeric(10, 2),
	"post_filing_notice_deadline" timestamp with time zone,
	"enforcement_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lien_filings_lien_stream_id_unique" UNIQUE("lien_stream_id")
);
--> statement-breakpoint
CREATE TABLE "lien_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"hubspot_project_id" text NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"sub_system_type_id" text NOT NULL,
	"lien_workflow_type" "lien_workflow_type" NOT NULL,
	"contractor_tier" "contractor_tier" DEFAULT 'first_tier' NOT NULL,
	"legal_property_address" text,
	"county" text,
	"contract_start_date" timestamp with time zone,
	"completion_date" timestamp with time zone,
	"cached_project_name" text,
	"cached_hubspot_status" text,
	"completion_checklist_complete" boolean DEFAULT false NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"filing_id" text NOT NULL,
	"status" "release_status" DEFAULT 'not_required' NOT NULL,
	"requested_at" timestamp with time zone,
	"generated_doc_url" text,
	"signed_date" timestamp with time zone,
	"filing_confirmation" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lien_releases_filing_id_unique" UNIQUE("filing_id")
);
--> statement-breakpoint
CREATE TABLE "lien_rule_sets" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"jurisdiction_id" text NOT NULL,
	"version" text NOT NULL,
	"effective_date" timestamp with time zone NOT NULL,
	"statute_ref" text NOT NULL,
	"legal_reviewed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"rule_set_id" text NOT NULL,
	"lien_workflow_type" "lien_workflow_type" NOT NULL,
	"work_stream" "work_stream" NOT NULL,
	"rule_kind" "rule_kind" NOT NULL,
	"anchor" text NOT NULL,
	"offset_months" integer,
	"offset_day_of_month" integer,
	"offset_days" integer,
	"offset_is_business_days" boolean DEFAULT false NOT NULL,
	"business_day_handling" "business_day_handling" DEFAULT 'next_business_day' NOT NULL,
	"statute_citation" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lien_streams" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_project_id" text NOT NULL,
	"work_stream" "work_stream" NOT NULL,
	"status" "lien_stream_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"hubspot_company_id" text NOT NULL,
	"hubspot_contact_id" text,
	"qbo_customer_id" text,
	"cached_name" text NOT NULL,
	"cached_email" text,
	"cached_phone" text,
	"payment_terms_days" integer DEFAULT 30 NOT NULL,
	"requires_notarized_waivers" boolean DEFAULT false NOT NULL,
	"match_state" text DEFAULT 'matched' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mailing_records" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"notice_id" text,
	"filing_id" text,
	"provider" text DEFAULT 'shippo' NOT NULL,
	"tracking_number" text,
	"label_url" text,
	"sent_date" timestamp with time zone,
	"proof_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mailing_records_notice_id_unique" UNIQUE("notice_id"),
	CONSTRAINT "mailing_records_filing_id_unique" UNIQUE("filing_id")
);
--> statement-breakpoint
CREATE TABLE "notice_recipients" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"notice_id" text NOT NULL,
	"recipient_type" "notice_recipient_type" NOT NULL,
	"legal_name" text NOT NULL,
	"mailing_address" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_stream_id" text NOT NULL,
	"work_month_id" text,
	"notice_type" "notice_type" NOT NULL,
	"status" "notice_status" DEFAULT 'draft' NOT NULL,
	"claim_amount" numeric(12, 2) NOT NULL,
	"work_description" text,
	"month_listed" timestamp with time zone NOT NULL,
	"generated_doc_url" text,
	"approved_by_user_id" text,
	"approved_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plan_installments" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"due_date" timestamp with time zone NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid" boolean DEFAULT false NOT NULL,
	"paid_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_plans" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"status" "payment_plan_status" DEFAULT 'active' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_party_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_project_id" text NOT NULL,
	"party_relation_type" "party_relation_type" NOT NULL,
	"hubspot_company_id" text NOT NULL,
	"cached_legal_name" text NOT NULL,
	"cached_mailing_address" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promises_to_pay" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"account_id" text NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"promised_date" timestamp with time zone NOT NULL,
	"status" "promise_status" DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_trigger_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"hubspot_stage_key" text NOT NULL,
	"label" text NOT NULL,
	"lien_clock_trigger" "lien_clock_trigger" DEFAULT 'none' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_system_types" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"system_type_id" text NOT NULL,
	"lien_workflow_type" "lien_workflow_type" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_notice_risks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_project_id" text NOT NULL,
	"invoice_link_id" text NOT NULL,
	"status" "supplier_notice_risk_status" DEFAULT 'none' NOT NULL,
	"supplier_deadline" timestamp with time zone NOT NULL,
	"beacon_deadline" timestamp with time zone NOT NULL,
	"month_affected" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"source" "integration_source" NOT NULL,
	"entity" text NOT NULL,
	"status" "sync_status" DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error" text,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_types" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"department_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "timesheet_links" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_project_id" text NOT NULL,
	"connecteam_user_id" text NOT NULL,
	"connecteam_time_record_id" text NOT NULL,
	"display_name" text,
	"stage_tag" text NOT NULL,
	"work_stream" "work_stream" NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"work_date" timestamp with time zone NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waivers" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_project_id" text NOT NULL,
	"work_stream" "work_stream" NOT NULL,
	"waiver_type" "waiver_type" NOT NULL,
	"payment_amount" numeric(12, 2) NOT NULL,
	"approval_status" "waiver_approval_status" DEFAULT 'not_required' NOT NULL,
	"pm_approved_by_user_id" text,
	"pm_approved_at" timestamp with time zone,
	"finance_approved_by_user_id" text,
	"finance_approved_at" timestamp with time zone,
	"notarized" boolean DEFAULT false NOT NULL,
	"notary_live_ref" text,
	"signed_date" timestamp with time zone,
	"invoice_link_id" text,
	"generated_doc_url" text,
	"provided_to_gc" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_months" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"lien_stream_id" text NOT NULL,
	"month" timestamp with time zone NOT NULL,
	"derived_overdue" boolean DEFAULT false NOT NULL,
	"cleared_flag" boolean DEFAULT false NOT NULL,
	"invoice_link_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "collection_accounts_org_id_idx" ON "collection_accounts" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "collection_activities_org_id_idx" ON "collection_activities" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "collection_activities_account_id_idx" ON "collection_activities" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "departments_org_id_idx" ON "departments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "document_templates_org_id_idx" ON "document_templates" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "document_templates_org_type_uq" ON "document_templates" USING btree ("org_id","document_type");--> statement-breakpoint
CREATE INDEX "dunning_sequences_org_id_idx" ON "dunning_sequences" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dunning_steps_org_id_idx" ON "dunning_steps" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "dunning_steps_sequence_id_idx" ON "dunning_steps" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "holds_org_id_idx" ON "holds" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "holds_supplier_invoice_id_idx" ON "holds" USING btree ("supplier_invoice_id");--> statement-breakpoint
CREATE INDEX "invoice_links_org_id_idx" ON "invoice_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "invoice_links_lien_project_id_idx" ON "invoice_links" USING btree ("lien_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jurisdictions_org_code_idx" ON "jurisdictions" USING btree ("org_id","code");--> statement-breakpoint
CREATE INDEX "jurisdictions_org_id_idx" ON "jurisdictions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_deadlines_org_id_idx" ON "lien_deadlines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_deadlines_work_month_id_idx" ON "lien_deadlines" USING btree ("work_month_id");--> statement-breakpoint
CREATE INDEX "lien_filings_org_id_idx" ON "lien_filings" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lien_projects_org_hubspot_idx" ON "lien_projects" USING btree ("org_id","hubspot_project_id");--> statement-breakpoint
CREATE INDEX "lien_projects_org_id_idx" ON "lien_projects" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_releases_org_id_idx" ON "lien_releases" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_rule_sets_org_id_idx" ON "lien_rule_sets" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_rule_sets_jurisdiction_id_idx" ON "lien_rule_sets" USING btree ("jurisdiction_id");--> statement-breakpoint
CREATE INDEX "lien_rules_org_id_idx" ON "lien_rules" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_rules_rule_set_id_idx" ON "lien_rules" USING btree ("rule_set_id");--> statement-breakpoint
CREATE INDEX "lien_streams_org_id_idx" ON "lien_streams" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "lien_streams_lien_project_id_idx" ON "lien_streams" USING btree ("lien_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "linked_clients_org_hubspot_idx" ON "linked_clients" USING btree ("org_id","hubspot_company_id");--> statement-breakpoint
CREATE INDEX "linked_clients_org_id_idx" ON "linked_clients" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "mailing_records_org_id_idx" ON "mailing_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notice_recipients_org_id_idx" ON "notice_recipients" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notice_recipients_notice_id_idx" ON "notice_recipients" USING btree ("notice_id");--> statement-breakpoint
CREATE INDEX "notices_org_id_idx" ON "notices" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "notices_lien_stream_id_idx" ON "notices" USING btree ("lien_stream_id");--> statement-breakpoint
CREATE INDEX "payment_plan_installments_org_id_idx" ON "payment_plan_installments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payment_plan_installments_plan_id_idx" ON "payment_plan_installments" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "payment_plans_org_id_idx" ON "payment_plans" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "payment_plans_account_id_idx" ON "payment_plans" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "project_party_links_org_id_idx" ON "project_party_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "project_party_links_lien_project_id_idx" ON "project_party_links" USING btree ("lien_project_id");--> statement-breakpoint
CREATE INDEX "promises_to_pay_org_id_idx" ON "promises_to_pay" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "promises_to_pay_account_id_idx" ON "promises_to_pay" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stage_triggers_org_stage_key_idx" ON "stage_trigger_configs" USING btree ("org_id","hubspot_stage_key");--> statement-breakpoint
CREATE INDEX "stage_triggers_org_id_idx" ON "stage_trigger_configs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sub_system_types_org_id_idx" ON "sub_system_types" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "sub_system_types_system_type_id_idx" ON "sub_system_types" USING btree ("system_type_id");--> statement-breakpoint
CREATE INDEX "supplier_notice_risks_org_id_idx" ON "supplier_notice_risks" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "supplier_notice_risks_lien_project_id_idx" ON "supplier_notice_risks" USING btree ("lien_project_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_org_id_idx" ON "sync_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "system_types_org_id_idx" ON "system_types" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "system_types_department_id_idx" ON "system_types" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timesheet_links_org_record_idx" ON "timesheet_links" USING btree ("org_id","connecteam_time_record_id");--> statement-breakpoint
CREATE INDEX "timesheet_links_org_id_idx" ON "timesheet_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "timesheet_links_lien_project_id_idx" ON "timesheet_links" USING btree ("lien_project_id");--> statement-breakpoint
CREATE INDEX "waivers_org_id_idx" ON "waivers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "waivers_lien_project_id_idx" ON "waivers" USING btree ("lien_project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_months_org_stream_month_idx" ON "work_months" USING btree ("org_id","lien_stream_id","month");--> statement-breakpoint
CREATE INDEX "work_months_org_id_idx" ON "work_months" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "work_months_lien_stream_id_idx" ON "work_months" USING btree ("lien_stream_id");