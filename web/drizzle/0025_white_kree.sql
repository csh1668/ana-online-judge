ALTER TABLE "problems" ADD COLUMN "has_subtasks" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
UPDATE "problems" p
SET "has_subtasks" = COALESCE(
  (SELECT COUNT(DISTINCT t."subtask_group") > 1
   FROM "testcases" t
   WHERE t."problem_id" = p."id"),
  false
);

--> statement-breakpoint
UPDATE "problems" p
SET "max_score" = COALESCE(
  (SELECT SUM(COALESCE(t."score", 0))::int
   FROM "testcases" t
   WHERE t."problem_id" = p."id"),
  p."max_score"
)
WHERE p."has_subtasks" = true;
