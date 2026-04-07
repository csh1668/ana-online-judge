ALTER TABLE "problems" DROP CONSTRAINT "problems_author_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "problems_author_idx";--> statement-breakpoint
ALTER TABLE "problems" DROP COLUMN "author_id";