import { boolean, integer, pgEnum, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

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
]);
export const languageEnum = pgEnum("language", ["c", "cpp", "python", "java"]);

// Users table
export const users = pgTable("users", {
	id: serial("id").primaryKey(),
	email: text("email").notNull().unique(),
	password: text("password").notNull(), // bcrypt hashed
	name: text("name").notNull(),
	role: userRoleEnum("role").default("user").notNull(),
	rating: integer("rating").default(1500),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Problems table
export const problems = pgTable("problems", {
	id: serial("id").primaryKey(),
	title: text("title").notNull(),
	content: text("content").notNull(), // Markdown content
	timeLimit: integer("time_limit").notNull().default(1000), // ms
	memoryLimit: integer("memory_limit").notNull().default(256), // MB
	isPublic: boolean("is_public").default(false).notNull(),
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
