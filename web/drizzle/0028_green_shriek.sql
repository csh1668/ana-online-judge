ALTER TABLE "submission_results" DROP CONSTRAINT "submission_results_testcase_id_testcases_id_fk";
--> statement-breakpoint
ALTER TABLE "submissions" DROP CONSTRAINT "submissions_problem_id_problems_id_fk";
--> statement-breakpoint
ALTER TABLE "submission_results" ADD CONSTRAINT "submission_results_testcase_id_testcases_id_fk" FOREIGN KEY ("testcase_id") REFERENCES "public"."testcases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;