CREATE TABLE "problem_sources" (
	"problem_id" integer NOT NULL,
	"source_id" integer NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "problem_sources_problem_id_source_id_pk" PRIMARY KEY("problem_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "source_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" integer,
	"action" text NOT NULL,
	"actor_id" integer,
	"payload_json" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"year" integer,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contests" ADD COLUMN "source_id" integer;--> statement-breakpoint
ALTER TABLE "problem_sources" ADD CONSTRAINT "problem_sources_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_sources" ADD CONSTRAINT "problem_sources_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_sources" ADD CONSTRAINT "problem_sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "source_audit_log" ADD CONSTRAINT "source_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_parent_id_sources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "problem_sources_source_idx" ON "problem_sources" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "source_audit_log_source_idx" ON "source_audit_log" USING btree ("source_id","created_at");--> statement-breakpoint
CREATE INDEX "source_audit_log_actor_idx" ON "source_audit_log" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "sources_parent_idx" ON "sources" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sources_parent_slug_idx" ON "sources" USING btree ("parent_id","slug") WHERE parent_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sources_root_slug_idx" ON "sources" USING btree ("slug") WHERE parent_id IS NULL;--> statement-breakpoint
CREATE INDEX "sources_name_normalized_idx" ON "sources" USING btree ("name_normalized");--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contests_source_unique_idx" ON "contests" USING btree ("source_id") WHERE source_id IS NOT NULL;