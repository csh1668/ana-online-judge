CREATE TABLE "practice_problems" (
	"id" serial PRIMARY KEY NOT NULL,
	"practice_id" integer NOT NULL,
	"problem_id" integer NOT NULL,
	"label" text NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "practices" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"created_by" integer NOT NULL,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp NOT NULL,
	"penalty_minutes" integer DEFAULT 20 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_practice_id_practices_id_fk" FOREIGN KEY ("practice_id") REFERENCES "public"."practices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_problems" ADD CONSTRAINT "practice_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practices" ADD CONSTRAINT "practices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "practice_problems_practice_order_idx" ON "practice_problems" USING btree ("practice_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "practice_problems_uniq" ON "practice_problems" USING btree ("practice_id","problem_id");--> statement-breakpoint
CREATE INDEX "practices_created_by_idx" ON "practices" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "practices_created_by_day_idx" ON "practices" USING btree ("created_by","created_at");