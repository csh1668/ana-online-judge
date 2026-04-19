CREATE TABLE "problem_votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"level" integer,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "tier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "tier_updated_at" timestamp;--> statement-breakpoint
ALTER TABLE "problem_votes" ADD CONSTRAINT "problem_votes_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_votes" ADD CONSTRAINT "problem_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "problem_votes_problem_user_idx" ON "problem_votes" USING btree ("problem_id","user_id");--> statement-breakpoint
CREATE INDEX "problem_votes_problem_idx" ON "problem_votes" USING btree ("problem_id");