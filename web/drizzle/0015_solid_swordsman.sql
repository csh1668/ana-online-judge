CREATE TYPE "public"."workshop_expected_verdict" AS ENUM('accepted', 'wrong_answer', 'time_limit', 'memory_limit', 'runtime_error', 'presentation_error', 'tl_or_ml');--> statement-breakpoint
CREATE TYPE "public"."workshop_invocation_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workshop_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."workshop_problem_type" AS ENUM('icpc', 'special_judge');--> statement-breakpoint
CREATE TYPE "public"."workshop_testcase_source" AS ENUM('manual', 'generated');--> statement-breakpoint
CREATE TYPE "public"."workshop_validation_status" AS ENUM('pending', 'valid', 'invalid');--> statement-breakpoint
CREATE TABLE "workshop_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"workshop_problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"base_snapshot_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_generators" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"name" text NOT NULL,
	"language" "language" NOT NULL,
	"source_path" text NOT NULL,
	"compiled_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_invocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"workshop_problem_id" integer NOT NULL,
	"status" "workshop_invocation_status" DEFAULT 'running' NOT NULL,
	"selected_solutions_json" jsonb NOT NULL,
	"selected_testcases_json" jsonb NOT NULL,
	"results_json" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workshop_problem_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"workshop_problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "workshop_member_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_problems" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"problem_type" "workshop_problem_type" DEFAULT 'icpc' NOT NULL,
	"time_limit" integer DEFAULT 1000 NOT NULL,
	"memory_limit" integer DEFAULT 512 NOT NULL,
	"seed" text NOT NULL,
	"checker_language" text,
	"checker_path" text,
	"validator_language" text,
	"validator_path" text,
	"generator_script" text,
	"published_problem_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_resources" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"workshop_problem_id" integer NOT NULL,
	"label" text NOT NULL,
	"message" text,
	"state_json" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_solutions" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"name" text NOT NULL,
	"language" "language" NOT NULL,
	"source_path" text NOT NULL,
	"expected_verdict" "workshop_expected_verdict" DEFAULT 'accepted' NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_testcases" (
	"id" serial PRIMARY KEY NOT NULL,
	"draft_id" integer NOT NULL,
	"index" integer NOT NULL,
	"source" "workshop_testcase_source" NOT NULL,
	"generator_id" integer,
	"generator_args" text,
	"input_path" text NOT NULL,
	"output_path" text,
	"subtask_group" integer DEFAULT 0 NOT NULL,
	"score" integer DEFAULT 0 NOT NULL,
	"validation_status" "workshop_validation_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "workshop_access" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "workshop_drafts" ADD CONSTRAINT "workshop_drafts_workshop_problem_id_workshop_problems_id_fk" FOREIGN KEY ("workshop_problem_id") REFERENCES "public"."workshop_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_drafts" ADD CONSTRAINT "workshop_drafts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_generators" ADD CONSTRAINT "workshop_generators_draft_id_workshop_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."workshop_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_invocations" ADD CONSTRAINT "workshop_invocations_workshop_problem_id_workshop_problems_id_fk" FOREIGN KEY ("workshop_problem_id") REFERENCES "public"."workshop_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_invocations" ADD CONSTRAINT "workshop_invocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_problem_members" ADD CONSTRAINT "workshop_problem_members_workshop_problem_id_workshop_problems_id_fk" FOREIGN KEY ("workshop_problem_id") REFERENCES "public"."workshop_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_problem_members" ADD CONSTRAINT "workshop_problem_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_problems" ADD CONSTRAINT "workshop_problems_published_problem_id_problems_id_fk" FOREIGN KEY ("published_problem_id") REFERENCES "public"."problems"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_problems" ADD CONSTRAINT "workshop_problems_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_resources" ADD CONSTRAINT "workshop_resources_draft_id_workshop_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."workshop_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_snapshots" ADD CONSTRAINT "workshop_snapshots_workshop_problem_id_workshop_problems_id_fk" FOREIGN KEY ("workshop_problem_id") REFERENCES "public"."workshop_problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_snapshots" ADD CONSTRAINT "workshop_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_solutions" ADD CONSTRAINT "workshop_solutions_draft_id_workshop_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."workshop_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_testcases" ADD CONSTRAINT "workshop_testcases_draft_id_workshop_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."workshop_drafts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_drafts_pair_idx" ON "workshop_drafts" USING btree ("workshop_problem_id","user_id");--> statement-breakpoint
CREATE INDEX "workshop_generators_draft_idx" ON "workshop_generators" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_generators_name_idx" ON "workshop_generators" USING btree ("draft_id","name");--> statement-breakpoint
CREATE INDEX "workshop_invocations_problem_idx" ON "workshop_invocations" USING btree ("workshop_problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_problem_members_pair_idx" ON "workshop_problem_members" USING btree ("workshop_problem_id","user_id");--> statement-breakpoint
CREATE INDEX "workshop_problem_members_user_idx" ON "workshop_problem_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workshop_problems_created_by_idx" ON "workshop_problems" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "workshop_resources_draft_idx" ON "workshop_resources" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_resources_name_idx" ON "workshop_resources" USING btree ("draft_id","name");--> statement-breakpoint
CREATE INDEX "workshop_snapshots_problem_idx" ON "workshop_snapshots" USING btree ("workshop_problem_id");--> statement-breakpoint
CREATE INDEX "workshop_solutions_draft_idx" ON "workshop_solutions" USING btree ("draft_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_solutions_name_idx" ON "workshop_solutions" USING btree ("draft_id","name");--> statement-breakpoint
CREATE INDEX "workshop_testcases_draft_idx" ON "workshop_testcases" USING btree ("draft_id","index");