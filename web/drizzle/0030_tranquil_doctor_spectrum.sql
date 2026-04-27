CREATE TYPE "public"."submission_visibility" AS ENUM('public', 'private', 'public_on_ac');--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "visibility" "submission_visibility" DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_submission_visibility" "submission_visibility" DEFAULT 'public' NOT NULL;