-- 과거 결과 이중 반영 경합이 남겼을 수 있는 중복 행을 먼저 제거한다 (쌍별 최신 id만 유지).
-- 중복이 없으면 no-op이므로 안전하다.
DELETE FROM "submission_results" sr
USING "submission_results" newer
WHERE sr.submission_id = newer.submission_id
  AND sr.testcase_id = newer.testcase_id
  AND sr.id < newer.id;--> statement-breakpoint
CREATE UNIQUE INDEX "submission_results_submission_testcase_uq" ON "submission_results" USING btree ("submission_id","testcase_id");