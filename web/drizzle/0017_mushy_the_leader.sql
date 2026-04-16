DROP TABLE IF EXISTS "workshop_invocations" CASCADE;
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
ALTER TABLE "workshop_invocations" ADD CONSTRAINT "workshop_invocations_workshop_problem_id_workshop_problems_id_fk" FOREIGN KEY ("workshop_problem_id") REFERENCES "public"."workshop_problems"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "workshop_invocations" ADD CONSTRAINT "workshop_invocations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "workshop_invocations_problem_idx" ON "workshop_invocations" USING btree ("workshop_problem_id");
