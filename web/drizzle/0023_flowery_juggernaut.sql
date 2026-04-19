CREATE TABLE "algorithm_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_id" integer,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problem_confirmed_tags" (
	"problem_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"confirmed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "problem_confirmed_tags_problem_id_tag_id_pk" PRIMARY KEY("problem_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "problem_vote_tags" (
	"id" serial PRIMARY KEY NOT NULL,
	"problem_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"tag_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "algorithm_tags" ADD CONSTRAINT "algorithm_tags_parent_id_algorithm_tags_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."algorithm_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_tags" ADD CONSTRAINT "algorithm_tags_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "algorithm_tags" ADD CONSTRAINT "algorithm_tags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_confirmed_tags" ADD CONSTRAINT "problem_confirmed_tags_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_confirmed_tags" ADD CONSTRAINT "problem_confirmed_tags_tag_id_algorithm_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."algorithm_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_vote_tags" ADD CONSTRAINT "problem_vote_tags_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_vote_tags" ADD CONSTRAINT "problem_vote_tags_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_vote_tags" ADD CONSTRAINT "problem_vote_tags_tag_id_algorithm_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."algorithm_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "algorithm_tags_parent_idx" ON "algorithm_tags" USING btree ("parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "algorithm_tags_slug_idx" ON "algorithm_tags" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "problem_confirmed_tags_tag_idx" ON "problem_confirmed_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "problem_vote_tags_uniq" ON "problem_vote_tags" USING btree ("problem_id","user_id","tag_id");--> statement-breakpoint
CREATE INDEX "problem_vote_tags_problem_tag_idx" ON "problem_vote_tags" USING btree ("problem_id","tag_id");--> statement-breakpoint
CREATE INDEX "problem_vote_tags_tag_idx" ON "problem_vote_tags" USING btree ("tag_id");