import {
	boolean,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// Enums
export const userRoleEnum = pgEnum("user_role", ["user", "admin"]);
export const verdictEnum = pgEnum("verdict", [
	"pending",
	"judging",
	"accepted",
	"wrong_answer",
	"time_limit_exceeded",
	"memory_limit_exceeded",
	"runtime_error",
	"compile_error",
	"system_error",
	"skipped",
	"presentation_error",
	"fail",
	"partial", // Anigma partial score
]);
export const languageEnum = pgEnum("language", [
	"c",
	"cpp",
	"python",
	"java",
	"rust",
	"go",
	"javascript",
	"text",
]);
export const problemTypeEnum = pgEnum("problem_type", [
	"icpc",
	"special_judge",
	"anigma",
	"interactive",
]);
export const inputMethodEnum = pgEnum("input_method", ["stdin", "args"]);
export const contestVisibilityEnum = pgEnum("contest_visibility", ["public", "private"]);
export const scoreboardTypeEnum = pgEnum("scoreboard_type", ["basic", "spotboard"]);

// Workshop enums
export const workshopProblemTypeEnum = pgEnum("workshop_problem_type", ["icpc", "special_judge"]);
export const workshopTestcaseSourceEnum = pgEnum("workshop_testcase_source", [
	"manual",
	"generated",
]);
export const workshopValidationStatusEnum = pgEnum("workshop_validation_status", [
	"pending",
	"valid",
	"invalid",
]);
export const workshopMemberRoleEnum = pgEnum("workshop_member_role", ["owner", "member"]);
export const workshopExpectedVerdictEnum = pgEnum("workshop_expected_verdict", [
	"accepted",
	"wrong_answer",
	"time_limit",
	"memory_limit",
	"runtime_error",
	"presentation_error",
	"tl_or_ml",
]);
export const workshopInvocationStatusEnum = pgEnum("workshop_invocation_status", [
	"running",
	"completed",
	"failed",
]);

// Users table
export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	username: text("username").notNull().unique(), // 로그인용 아이디
	email: text("email").unique(), // 이메일 (선택, unique - null은 여러 개 가능)
	password: text("password"), // bcrypt hashed (nullable for OAuth users)
	name: text("name").notNull(),
	role: userRoleEnum("role").default("user").notNull(),
	rating: integer("rating").default(0),
	playgroundAccess: boolean("playground_access").default(false), // Playground access
	workshopAccess: boolean("workshop_access").default(false), // Workshop (창작마당) access
	contestAccountOnly: boolean("contest_account_only").default(false), // Contest-only account
	contestId: integer("contest_id"), // Will reference contests.id
	isActive: boolean("is_active").default(true), // Account active status
	bio: text("bio"),
	avatarUrl: text("avatar_url"),
	authId: text("auth_id").unique(), // OAuth provider unique ID (e.g., Google ID)
	authProvider: text("auth_provider"), // OAuth provider name (e.g., 'google', 'github')
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Site settings table (singleton)
export const siteSettings = pgTable("site_settings", {
	id: serial("id").primaryKey(),
	key: text("key").notNull().unique(),
	value: text("value").notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Problems table
export const problems = pgTable(
	"problems",
	{
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		content: text("content").notNull(), // Markdown content
		timeLimit: integer("time_limit").notNull().default(1000), // ms
		memoryLimit: integer("memory_limit").notNull().default(512), // MB
		maxScore: integer("max_score").notNull().default(100), // Maximum score for the problem
		isPublic: boolean("is_public").default(false).notNull(),
		judgeAvailable: boolean("judge_available").default(true).notNull(),
		problemType: problemTypeEnum("problem_type").default("icpc").notNull(),
		checkerPath: text("checker_path"), // Special judge checker path in MinIO
		validatorPath: text("validator_path"), // Validator path in MinIO (optional)
		inputMethod: inputMethodEnum("input_method").default("stdin"), // Anigma input method
		referenceCodePath: text("reference_code_path"), // Anigma: 문제 제공 코드 A (ZIP)
		solutionCodePath: text("solution_code_path"), // Anigma: 정답 코드 B (ZIP)
		allowedLanguages: text("allowed_languages").array(), // NULL이면 모든 언어 허용
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		publicAvailableIdx: index("problems_public_available_idx").on(t.isPublic, t.judgeAvailable),
	})
);

// Problem Authors (junction table) - 문제 출제자 (여러 명)
export const problemAuthors = pgTable(
	"problem_authors",
	{
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		pk: uniqueIndex("problem_authors_pk").on(t.problemId, t.userId),
		userIdx: index("problem_authors_user_idx").on(t.userId),
	})
);

// Problem Reviewers (junction table) - 문제 검수자 (여러 명)
export const problemReviewers = pgTable(
	"problem_reviewers",
	{
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		pk: uniqueIndex("problem_reviewers_pk").on(t.problemId, t.userId),
		userIdx: index("problem_reviewers_user_idx").on(t.userId),
	})
);

// Testcases table
export const testcases = pgTable(
	"testcases",
	{
		id: serial("id").primaryKey(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		inputPath: text("input_path").notNull(), // S3/MinIO path
		outputPath: text("output_path").notNull(), // S3/MinIO path
		subtaskGroup: integer("subtask_group").default(0),
		isHidden: boolean("is_hidden").default(true).notNull(),
		score: integer("score").default(0),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		problemSubtaskIdx: index("testcases_problem_subtask_idx").on(t.problemId, t.subtaskGroup),
	})
);

// Submissions table
export const submissions = pgTable(
	"submissions",
	{
		id: serial("id").primaryKey(),
		userId: integer("user_id")
			.references(() => users.id)
			.notNull(),
		problemId: integer("problem_id")
			.references(() => problems.id)
			.notNull(),
		code: text("code").notNull(),
		language: languageEnum("language").notNull(),
		verdict: verdictEnum("verdict").default("pending").notNull(),
		executionTime: integer("execution_time"), // ms
		memoryUsed: integer("memory_used"), // KB
		errorMessage: text("error_message"), // Compile error / Runtime error message
		score: integer("score").default(0),

		// Anigma extensions
		zipPath: text("zip_path"), // MinIO path for zip file (Task 2)
		isMultifile: boolean("is_multifile").default(false),
		passedTestcases: integer("passed_testcases").default(0),
		totalTestcases: integer("total_testcases").default(0),
		editDistance: integer("edit_distance"), // Levenshtein distance from reference code (Anigma Task 2 only)
		anigmaTaskType: integer("anigma_task_type"), // 1 (input 제출) or 2 (ZIP 제출), null for non-anigma
		anigmaInputPath: text("anigma_input_path"), // MinIO path for user input file (Task 1)

		// Contest extensions
		contestId: integer("contest_id"), // Will reference contests.id
		codeLength: integer("code_length"), // bytes

		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		userCreatedIdx: index("submissions_user_created_idx").on(t.userId, t.createdAt),
		problemVerdictIdx: index("submissions_problem_verdict_idx").on(t.problemId, t.verdict),
		contestUserIdx: index("submissions_contest_user_idx").on(t.contestId, t.userId),
		createdAtIdx: index("submissions_created_at_idx").on(t.createdAt),
	})
);

// Submission testcase results (detailed per-testcase results)
export const submissionResults = pgTable("submission_results", {
	id: serial("id").primaryKey(),
	submissionId: integer("submission_id")
		.references(() => submissions.id, { onDelete: "cascade" })
		.notNull(),
	testcaseId: integer("testcase_id")
		.references(() => testcases.id)
		.notNull(),
	verdict: verdictEnum("verdict").notNull(),
	executionTime: integer("execution_time"), // ms
	memoryUsed: integer("memory_used"), // KB
	checkerMessage: text("checker_message"), // stderr from checker (admin only)
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Contests table
export const contests = pgTable("contests", {
	id: serial("id").primaryKey(),
	title: text("title").notNull(),
	description: text("description"),
	startTime: timestamp("start_time").notNull(),
	endTime: timestamp("end_time").notNull(),
	freezeMinutes: integer("freeze_minutes").default(60), // Minutes before end to freeze (null = no freeze)
	isFrozen: boolean("is_frozen").default(false), // Current freeze state
	visibility: contestVisibilityEnum("visibility").default("public").notNull(),
	scoreboardType: scoreboardTypeEnum("scoreboard_type").default("basic").notNull(),
	penaltyMinutes: integer("penalty_minutes").default(20).notNull(), // ICPC penalty minutes
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Contest Problems (junction table)
export const contestProblems = pgTable(
	"contest_problems",
	{
		id: serial("id").primaryKey(),
		contestId: integer("contest_id")
			.references(() => contests.id, { onDelete: "cascade" })
			.notNull(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		label: text("label").notNull(), // "A", "B", "C", ...
		order: integer("order").notNull(),
	},
	(t) => ({
		contestOrderIdx: index("contest_problems_contest_order_idx").on(t.contestId, t.order),
	})
);

// Contest Participants
export const contestParticipants = pgTable(
	"contest_participants",
	{
		id: serial("id").primaryKey(),
		contestId: integer("contest_id")
			.references(() => contests.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		registeredAt: timestamp("registered_at").defaultNow().notNull(),
	},
	(t) => ({
		contestUserIdx: index("contest_participants_contest_user_idx").on(t.contestId, t.userId),
		userContestIdx: index("contest_participants_user_contest_idx").on(t.userId, t.contestId),
	})
);

// Playground Sessions
export const playgroundSessions = pgTable(
	"playground_sessions",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		userId: integer("user_id")
			.references(() => users.id)
			.notNull(),
		name: text("name").notNull().default("Untitled"),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => ({
		userUpdatedIdx: index("playground_sessions_user_updated_idx").on(t.userId, t.updatedAt),
	})
);

// Playground Files
export const playgroundFiles = pgTable(
	"playground_files",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		sessionId: uuid("session_id")
			.references(() => playgroundSessions.id, { onDelete: "cascade" })
			.notNull(),
		path: text("path").notNull(),
		minioPath: text("minio_path").notNull(), // MinIO storage path
		isDirectory: boolean("is_directory").default(false),
		createdAt: timestamp("created_at").defaultNow(),
		updatedAt: timestamp("updated_at").defaultNow(),
	},
	(t) => ({
		uniqueSessionPath: uniqueIndex("unique_session_path").on(t.sessionId, t.path),
	})
);

// =========================
// Workshop (창작마당) tables
// =========================

export const workshopProblems = pgTable(
	"workshop_problems",
	{
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		description: text("description").notNull().default(""),
		problemType: workshopProblemTypeEnum("problem_type").notNull().default("icpc"),
		timeLimit: integer("time_limit").notNull().default(1000),
		memoryLimit: integer("memory_limit").notNull().default(512),
		seed: text("seed").notNull(),
		checkerLanguage: text("checker_language"),
		checkerPath: text("checker_path"),
		validatorLanguage: text("validator_language"),
		validatorPath: text("validator_path"),
		generatorScript: text("generator_script"),
		publishedProblemId: integer("published_problem_id").references(() => problems.id, {
			onDelete: "set null",
		}),
		createdBy: integer("created_by")
			.references(() => users.id, { onDelete: "restrict" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		createdByIdx: index("workshop_problems_created_by_idx").on(t.createdBy),
	})
);

export const workshopProblemMembers = pgTable(
	"workshop_problem_members",
	{
		id: serial("id").primaryKey(),
		workshopProblemId: integer("workshop_problem_id")
			.references(() => workshopProblems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		role: workshopMemberRoleEnum("role").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		uniqPair: uniqueIndex("workshop_problem_members_pair_idx").on(t.workshopProblemId, t.userId),
		userIdx: index("workshop_problem_members_user_idx").on(t.userId),
	})
);

export const workshopDrafts = pgTable(
	"workshop_drafts",
	{
		id: serial("id").primaryKey(),
		workshopProblemId: integer("workshop_problem_id")
			.references(() => workshopProblems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		baseSnapshotId: integer("base_snapshot_id"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		uniqPair: uniqueIndex("workshop_drafts_pair_idx").on(t.workshopProblemId, t.userId),
	})
);

export const workshopResources = pgTable(
	"workshop_resources",
	{
		id: serial("id").primaryKey(),
		draftId: integer("draft_id")
			.references(() => workshopDrafts.id, { onDelete: "cascade" })
			.notNull(),
		name: text("name").notNull(),
		path: text("path").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		draftIdx: index("workshop_resources_draft_idx").on(t.draftId),
		uniqName: uniqueIndex("workshop_resources_name_idx").on(t.draftId, t.name),
	})
);

export const workshopTestcases = pgTable(
	"workshop_testcases",
	{
		id: serial("id").primaryKey(),
		draftId: integer("draft_id")
			.references(() => workshopDrafts.id, { onDelete: "cascade" })
			.notNull(),
		index: integer("index").notNull(),
		source: workshopTestcaseSourceEnum("source").notNull(),
		generatorId: integer("generator_id"),
		generatorArgs: text("generator_args"),
		inputPath: text("input_path").notNull(),
		outputPath: text("output_path"),
		subtaskGroup: integer("subtask_group").notNull().default(0),
		score: integer("score").notNull().default(0),
		validationStatus: workshopValidationStatusEnum("validation_status")
			.notNull()
			.default("pending"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		draftIdx: index("workshop_testcases_draft_idx").on(t.draftId, t.index),
	})
);

export const workshopGenerators = pgTable(
	"workshop_generators",
	{
		id: serial("id").primaryKey(),
		draftId: integer("draft_id")
			.references(() => workshopDrafts.id, { onDelete: "cascade" })
			.notNull(),
		name: text("name").notNull(),
		language: languageEnum("language").notNull(),
		sourcePath: text("source_path").notNull(),
		compiledPath: text("compiled_path"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		draftIdx: index("workshop_generators_draft_idx").on(t.draftId),
		uniqName: uniqueIndex("workshop_generators_name_idx").on(t.draftId, t.name),
	})
);

export const workshopSolutions = pgTable(
	"workshop_solutions",
	{
		id: serial("id").primaryKey(),
		draftId: integer("draft_id")
			.references(() => workshopDrafts.id, { onDelete: "cascade" })
			.notNull(),
		name: text("name").notNull(),
		language: languageEnum("language").notNull(),
		sourcePath: text("source_path").notNull(),
		expectedVerdict: workshopExpectedVerdictEnum("expected_verdict").notNull().default("accepted"),
		isMain: boolean("is_main").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		draftIdx: index("workshop_solutions_draft_idx").on(t.draftId),
		uniqName: uniqueIndex("workshop_solutions_name_idx").on(t.draftId, t.name),
	})
);

export const workshopSnapshots = pgTable(
	"workshop_snapshots",
	{
		id: serial("id").primaryKey(),
		workshopProblemId: integer("workshop_problem_id")
			.references(() => workshopProblems.id, { onDelete: "cascade" })
			.notNull(),
		label: text("label").notNull(),
		message: text("message"),
		stateJson: jsonb("state_json").notNull(),
		createdBy: integer("created_by")
			.references(() => users.id, { onDelete: "restrict" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		problemIdx: index("workshop_snapshots_problem_idx").on(t.workshopProblemId),
	})
);

export const workshopInvocations = pgTable(
	"workshop_invocations",
	{
		id: serial("id").primaryKey(),
		workshopProblemId: integer("workshop_problem_id")
			.references(() => workshopProblems.id, { onDelete: "cascade" })
			.notNull(),
		status: workshopInvocationStatusEnum("status").notNull().default("running"),
		selectedSolutionsJson: jsonb("selected_solutions_json").notNull(),
		selectedTestcasesJson: jsonb("selected_testcases_json").notNull(),
		resultsJson: jsonb("results_json").notNull(),
		createdBy: integer("created_by")
			.references(() => users.id, { onDelete: "restrict" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		completedAt: timestamp("completed_at"),
	},
	(t) => ({
		problemIdx: index("workshop_invocations_problem_idx").on(t.workshopProblemId),
	})
);

// Type exports for insert/select
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type ProblemAuthor = typeof problemAuthors.$inferSelect;
export type NewProblemAuthor = typeof problemAuthors.$inferInsert;
export type ProblemReviewer = typeof problemReviewers.$inferSelect;
export type NewProblemReviewer = typeof problemReviewers.$inferInsert;
export type Testcase = typeof testcases.$inferSelect;
export type NewTestcase = typeof testcases.$inferInsert;
export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type SubmissionResult = typeof submissionResults.$inferSelect;
export type NewSubmissionResult = typeof submissionResults.$inferInsert;
export type PlaygroundSession = typeof playgroundSessions.$inferSelect;
export type NewPlaygroundSession = typeof playgroundSessions.$inferInsert;
export type PlaygroundFile = typeof playgroundFiles.$inferSelect;
export type NewPlaygroundFile = typeof playgroundFiles.$inferInsert;
export type SiteSetting = typeof siteSettings.$inferSelect;
export type NewSiteSetting = typeof siteSettings.$inferInsert;
export type Contest = typeof contests.$inferSelect;
export type NewContest = typeof contests.$inferInsert;
export type ContestProblem = typeof contestProblems.$inferSelect;
export type NewContestProblem = typeof contestProblems.$inferInsert;
export type ContestParticipant = typeof contestParticipants.$inferSelect;
export type NewContestParticipant = typeof contestParticipants.$inferInsert;
export type WorkshopProblem = typeof workshopProblems.$inferSelect;
export type NewWorkshopProblem = typeof workshopProblems.$inferInsert;
export type WorkshopDraft = typeof workshopDrafts.$inferSelect;
export type NewWorkshopDraft = typeof workshopDrafts.$inferInsert;
export type WorkshopProblemMember = typeof workshopProblemMembers.$inferSelect;
export type NewWorkshopProblemMember = typeof workshopProblemMembers.$inferInsert;
export type WorkshopResource = typeof workshopResources.$inferSelect;
export type NewWorkshopResource = typeof workshopResources.$inferInsert;
export type WorkshopGenerator = typeof workshopGenerators.$inferSelect;
export type NewWorkshopGenerator = typeof workshopGenerators.$inferInsert;
export type WorkshopTestcase = typeof workshopTestcases.$inferSelect;
export type NewWorkshopTestcase = typeof workshopTestcases.$inferInsert;
export type WorkshopSolution = typeof workshopSolutions.$inferSelect;
export type NewWorkshopSolution = typeof workshopSolutions.$inferInsert;
export type WorkshopInvocation = typeof workshopInvocations.$inferSelect;
export type NewWorkshopInvocation = typeof workshopInvocations.$inferInsert;
export type WorkshopSnapshot = typeof workshopSnapshots.$inferSelect;
export type NewWorkshopSnapshot = typeof workshopSnapshots.$inferInsert;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Verdict = (typeof verdictEnum.enumValues)[number];
export type Language = (typeof languageEnum.enumValues)[number];
export type ProblemType = (typeof problemTypeEnum.enumValues)[number];
export type InputMethod = (typeof inputMethodEnum.enumValues)[number];
export type ContestVisibility = (typeof contestVisibilityEnum.enumValues)[number];
export type ScoreboardType = (typeof scoreboardTypeEnum.enumValues)[number];
