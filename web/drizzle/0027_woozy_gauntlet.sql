CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "algorithm_tags_name_trgm_idx" ON "algorithm_tags" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "algorithm_tags_slug_trgm_idx" ON "algorithm_tags" USING gin ("slug" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "algorithm_tags_description_trgm_idx" ON "algorithm_tags" USING gin ("description" gin_trgm_ops);