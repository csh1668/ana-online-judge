CREATE INDEX "contest_participants_contest_user_idx" ON "contest_participants" USING btree ("contest_id","user_id");--> statement-breakpoint
CREATE INDEX "contest_participants_user_contest_idx" ON "contest_participants" USING btree ("user_id","contest_id");--> statement-breakpoint
CREATE INDEX "contest_problems_contest_order_idx" ON "contest_problems" USING btree ("contest_id","order");--> statement-breakpoint
CREATE INDEX "playground_sessions_user_updated_idx" ON "playground_sessions" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "problems_public_available_idx" ON "problems" USING btree ("is_public","judge_available");--> statement-breakpoint
CREATE INDEX "problems_author_idx" ON "problems" USING btree ("author_id");--> statement-breakpoint
CREATE INDEX "submissions_user_created_idx" ON "submissions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "submissions_problem_verdict_idx" ON "submissions" USING btree ("problem_id","verdict");--> statement-breakpoint
CREATE INDEX "submissions_contest_user_idx" ON "submissions" USING btree ("contest_id","user_id");--> statement-breakpoint
CREATE INDEX "submissions_created_at_idx" ON "submissions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "testcases_problem_subtask_idx" ON "testcases" USING btree ("problem_id","subtask_group");