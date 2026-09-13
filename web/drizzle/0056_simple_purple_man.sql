ALTER TYPE "public"."workshop_problem_type" ADD VALUE 'two_step';--> statement-breakpoint
ALTER TABLE "workshop_drafts" ADD COLUMN "transformer_language" text;--> statement-breakpoint
ALTER TABLE "workshop_drafts" ADD COLUMN "transformer_path" text;