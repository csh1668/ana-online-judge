CREATE TABLE "problem_authors" (
	"problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_reviewers" (
	"problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "problem_authors" ADD CONSTRAINT "problem_authors_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_authors" ADD CONSTRAINT "problem_authors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reviewers" ADD CONSTRAINT "problem_reviewers_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_reviewers" ADD CONSTRAINT "problem_reviewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "problem_authors_pk" ON "problem_authors" USING btree ("problem_id","user_id");--> statement-breakpoint
CREATE INDEX "problem_authors_user_idx" ON "problem_authors" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_reviewers_pk" ON "problem_reviewers" USING btree ("problem_id","user_id");--> statement-breakpoint
CREATE INDEX "problem_reviewers_user_idx" ON "problem_reviewers" USING btree ("user_id");--> statement-breakpoint
-- Backfill: copy existing problems.author_id into problem_authors
INSERT INTO "problem_authors" ("problem_id", "user_id")
SELECT "id", "author_id" FROM "problems"
WHERE "author_id" IS NOT NULL
ON CONFLICT DO NOTHING;