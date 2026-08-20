CREATE TYPE "public"."workshop_invocation_kind" AS ENUM('invoke', 'generate');--> statement-breakpoint
ALTER TABLE "workshop_drafts" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_invocations" ADD COLUMN "draft_id" integer;--> statement-breakpoint
ALTER TABLE "workshop_invocations" ADD COLUMN "kind" "workshop_invocation_kind" DEFAULT 'invoke' NOT NULL;--> statement-breakpoint
ALTER TABLE "workshop_problems" ADD COLUMN "published_snapshot_id" integer;--> statement-breakpoint
ALTER TABLE "workshop_invocations" ADD CONSTRAINT "workshop_invocations_draft_id_workshop_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."workshop_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workshop_problems" ADD CONSTRAINT "workshop_problems_published_snapshot_id_workshop_snapshots_id_fk" FOREIGN KEY ("published_snapshot_id") REFERENCES "public"."workshop_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workshop_invocations_draft_idx" ON "workshop_invocations" USING btree ("draft_id");--> statement-breakpoint
-- Renumber per-draft testcase indices to 1..N (order preserved) so the unique
-- index below cannot fail on legacy duplicate (draft_id, index) pairs.
WITH renumbered AS (
	SELECT id, ROW_NUMBER() OVER (PARTITION BY draft_id ORDER BY index, id) AS rn
	FROM workshop_testcases
)
UPDATE workshop_testcases t SET index = r.rn
FROM renumbered r
WHERE t.id = r.id AND t.index <> r.rn;--> statement-breakpoint
CREATE UNIQUE INDEX "workshop_testcases_draft_index_uniq" ON "workshop_testcases" USING btree ("draft_id","index");