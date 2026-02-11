import {
	boolean,
	integer,
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
export const languageEnum = pgEnum("language", ["c", "cpp", "python", "java", "javascript"]);
export const problemTypeEnum = pgEnum("problem_type", ["icpc", "special_judge", "anigma"]);
export const inputMethodEnum = pgEnum("input_method", ["stdin", "args"]);
export const contestVisibilityEnum = pgEnum("contest_visibility", ["public", "private"]);
export const scoreboardTypeEnum = pgEnum("scoreboard_type", ["basic", "spotboard"]);

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
	contestAccountOnly: boolean("contest_account_only").default(false), // Contest-only account
	contestId: integer("contest_id"), // Will reference contests.id
	isActive: boolean("is_active").default(true), // Account active status
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
export const problems = pgTable("problems", {
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
	authorId: integer("author_id").references(() => users.id),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Testcases table
export const testcases = pgTable("testcases", {
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
});

// Submissions table
export const submissions = pgTable("submissions", {
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

	createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
export const contestProblems = pgTable("contest_problems", {
	id: serial("id").primaryKey(),
	contestId: integer("contest_id")
		.references(() => contests.id, { onDelete: "cascade" })
		.notNull(),
	problemId: integer("problem_id")
		.references(() => problems.id, { onDelete: "cascade" })
		.notNull(),
	label: text("label").notNull(), // "A", "B", "C", ...
	order: integer("order").notNull(),
});

// Contest Participants
export const contestParticipants = pgTable("contest_participants", {
	id: serial("id").primaryKey(),
	contestId: integer("contest_id")
		.references(() => contests.id, { onDelete: "cascade" })
		.notNull(),
	userId: integer("user_id")
		.references(() => users.id, { onDelete: "cascade" })
		.notNull(),
	registeredAt: timestamp("registered_at").defaultNow().notNull(),
});

// Playground Sessions
export const playgroundSessions = pgTable("playground_sessions", {
	id: uuid("id").primaryKey().defaultRandom(),
	userId: integer("user_id")
		.references(() => users.id)
		.notNull(),
	name: text("name").notNull().default("Untitled"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

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

// Type exports for insert/select
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
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

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Verdict = (typeof verdictEnum.enumValues)[number];
export type Language = (typeof languageEnum.enumValues)[number];
export type ProblemType = (typeof problemTypeEnum.enumValues)[number];
export type InputMethod = (typeof inputMethodEnum.enumValues)[number];
export type ContestVisibility = (typeof contestVisibilityEnum.enumValues)[number];
export type ScoreboardType = (typeof scoreboardTypeEnum.enumValues)[number];
