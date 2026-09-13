ALTER TYPE "public"."problem_type" ADD VALUE 'two_step';--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "transformer_path" text;