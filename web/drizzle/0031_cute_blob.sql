CREATE TYPE "public"."workshop_group_member_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "workshop_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" "workshop_group_member_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workshop_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workshop_problems" ADD COLUMN "group_id" integer;--> statement-breakpoint
ALTER TABLE "workshop_group_members" ADD CONSTRAINT "workshop_group_members_group_id_workshop_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."workshop_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_group_members" ADD CONSTRAINT "workshop_group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_groups" ADD CONSTRAINT "workshop_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_group_members_pair_idx" ON "workshop_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "workshop_group_members_user_idx" ON "workshop_group_members" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "workshop_problems" ADD CONSTRAINT "workshop_problems_group_id_workshop_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."workshop_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workshop_problems_group_idx" ON "workshop_problems" USING btree ("group_id");