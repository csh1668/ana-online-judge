ALTER TABLE "users" ADD COLUMN "playground_quota" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "workshop_quota" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "playground_access";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "workshop_access";