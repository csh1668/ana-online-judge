DROP INDEX "contests_source_unique_idx";--> statement-breakpoint
CREATE INDEX "contests_source_idx" ON "contests" USING btree ("source_id");