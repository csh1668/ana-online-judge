import { sql } from "drizzle-orm";
import {
	type AnyPgColumn,
	boolean,
	check,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	primaryKey,
	serial,
	text,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { LANGUAGE_VALUES } from "@/lib/languages";

export type { Language } from "@/lib/languages";

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
export const languageEnum = pgEnum("language", LANGUAGE_VALUES);
export const problemTypeEnum = pgEnum("problem_type", [
	"icpc",
	"special_judge",
	"anigma",
	"interactive",
]);
export const inputMethodEnum = pgEnum("input_method", ["stdin", "args"]);
export const contestVisibilityEnum = pgEnum("contest_visibility", ["public", "private"]);
export const scoreboardTypeEnum = pgEnum("scoreboard_type", ["basic", "spotboard"]);
export const postContestVisibilityEnum = pgEnum("post_contest_visibility", ["public", "frozen"]);
export const submissionVisibilityEnum = pgEnum("submission_visibility", [
	"public",
	"private",
	"public_on_ac",
]);
export const externalSiteEnum = pgEnum("external_site", ["codeforces", "atcoder"]);
export type ExternalSite = (typeof externalSiteEnum.enumValues)[number];
export const tokenTypeEnum = pgEnum("token_type", ["oauth_device", "pat"]);

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
export const workshopGroupMemberRoleEnum = pgEnum("workshop_group_member_role", [
	"owner",
	"member",
]);
export const workshopInvocationKindEnum = pgEnum("workshop_invocation_kind", [
	"invoke",
	"generate",
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
	playgroundQuota: integer("playground_quota").notNull().default(3), // Playground 최대 세션 수
	workshopQuota: integer("workshop_quota").notNull().default(5), // Workshop (창작마당) 최대 문제 수
	contestId: integer("contest_id"), // 대회 계정이 묶인 contest. NULL이면 일반 계정.
	isActive: boolean("is_active").default(true), // Account active status
	mustChangePassword: boolean("must_change_password").notNull().default(false),
	defaultSubmissionVisibility: submissionVisibilityEnum("default_submission_visibility")
		.default("public")
		.notNull(),
	bio: text("bio"),
	avatarUrl: text("avatar_url"),
	authId: text("auth_id").unique(), // OAuth provider unique ID (e.g., Google ID)
	authProvider: text("auth_provider"), // OAuth provider name (e.g., 'google', 'github')
	mainExternalSite: externalSiteEnum("main_external_site"),
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
		// title, content는 translations JSONB로 대체됨.
		translations: jsonb("translations").$type<Translations>().notNull(),
		displayTitle: text("display_title")
			.generatedAlwaysAs(
				sql`COALESCE(
					translations->'entries'->'ko'->>'title',
					(translations->'entries'->(translations->>'original'))->>'title'
				)`
			)
			.notNull(),
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
		tier: integer("tier").notNull().default(0), // -1=not_ratable, 0=unrated, 1~30=Bronze5~Ruby1
		tierUpdatedAt: timestamp("tier_updated_at"),
		hasSubtasks: boolean("has_subtasks").notNull().default(false),
		useFullJudge: boolean("use_full_judge").notNull().default(false),
		passThreshold: integer("pass_threshold"),
		// 스페셜 저지 체커 출력(stderr)을 제출자에게 공개할지 여부. 기본값은 숨김.
		// 관리자는 이 값과 무관하게 항상 볼 수 있음 (submissions/[id] 상세 페이지).
		showCheckerOutput: boolean("show_checker_output").notNull().default(false),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		publicAvailableIdx: index("problems_public_available_idx").on(t.isPublic, t.judgeAvailable),
		displayTitleIdx: index("problems_display_title_idx").on(t.displayTitle),
	})
);

// Problem Votes — 문제 난이도/의견 투표 (한 사용자 문제당 1표)
export const problemVotes = pgTable(
	"problem_votes",
	{
		id: serial("id").primaryKey(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		level: integer("level"), // 1~30 = 난이도 투표, 0 = not_ratable (PS 문제 아님), null = 난이도 매기지 못하겠음 (의견/태그만)
		comment: text("comment"), // 사용자 의견 텍스트 (nullable)
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		uniqPair: uniqueIndex("problem_votes_problem_user_idx").on(t.problemId, t.userId),
		problemIdx: index("problem_votes_problem_idx").on(t.problemId),
	})
);

// Algorithm Tags — 트리 구조 알고리즘 태그
export const algorithmTags = pgTable(
	"algorithm_tags",
	{
		id: serial("id").primaryKey(),
		parentId: integer("parent_id").references((): AnyPgColumn => algorithmTags.id, {
			onDelete: "cascade",
		}),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		description: text("description"),
		createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
		updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		parentIdx: index("algorithm_tags_parent_idx").on(t.parentId),
		slugIdx: uniqueIndex("algorithm_tags_slug_idx").on(t.slug),
		nameTrgmIdx: index("algorithm_tags_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
		slugTrgmIdx: index("algorithm_tags_slug_trgm_idx").using("gin", sql`${t.slug} gin_trgm_ops`),
		descriptionTrgmIdx: index("algorithm_tags_description_trgm_idx").using(
			"gin",
			sql`${t.description} gin_trgm_ops`
		),
	})
);

// Problem Vote Tags — 문제 투표에 포함된 태그 (자식 + 자동 추가된 부모 모두)
export const problemVoteTags = pgTable(
	"problem_vote_tags",
	{
		id: serial("id").primaryKey(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		tagId: integer("tag_id")
			.references(() => algorithmTags.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		uniqRow: uniqueIndex("problem_vote_tags_uniq").on(t.problemId, t.userId, t.tagId),
		problemTagIdx: index("problem_vote_tags_problem_tag_idx").on(t.problemId, t.tagId),
		tagIdx: index("problem_vote_tags_tag_idx").on(t.tagId),
	})
);

// Problem Confirmed Tags — 1/3 다수결로 확정된 태그 캐시
export const problemConfirmedTags = pgTable(
	"problem_confirmed_tags",
	{
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		tagId: integer("tag_id")
			.references(() => algorithmTags.id, { onDelete: "cascade" })
			.notNull(),
		confirmedAt: timestamp("confirmed_at").defaultNow().notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.problemId, t.tagId] }),
		tagIdx: index("problem_confirmed_tags_tag_idx").on(t.tagId),
	})
);

// Problem Favorites — 사용자가 즐겨찾기한 문제
export const problemFavorites = pgTable(
	"problem_favorites",
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
		pk: primaryKey({ columns: [t.userId, t.problemId] }),
		problemIdx: index("problem_favorites_problem_idx").on(t.problemId),
		userCreatedIdx: index("problem_favorites_user_created_idx").on(t.userId, t.createdAt),
	})
);

// Problem Authors (junction table) - 문제 출제자 (여러 명)
// userId(사이트 사용자)와 externalName(외부 인사) 중 정확히 하나만 NOT NULL.
export const problemAuthors = pgTable(
	"problem_authors",
	{
		id: serial("id").primaryKey(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
		externalName: text("external_name"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		userUniq: uniqueIndex("problem_authors_user_uniq")
			.on(t.problemId, t.userId)
			.where(sql`${t.userId} IS NOT NULL`),
		externalUniq: uniqueIndex("problem_authors_external_uniq")
			.on(t.problemId, t.externalName)
			.where(sql`${t.externalName} IS NOT NULL`),
		userIdx: index("problem_authors_user_idx").on(t.userId),
		identityCheck: check(
			"problem_authors_identity_check",
			sql`(${t.userId} IS NOT NULL) <> (${t.externalName} IS NOT NULL)`
		),
	})
);

// Problem Reviewers (junction table) - 문제 검수자 (여러 명)
// userId(사이트 사용자)와 externalName(외부 인사) 중 정확히 하나만 NOT NULL.
export const problemReviewers = pgTable(
	"problem_reviewers",
	{
		id: serial("id").primaryKey(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id").references(() => users.id, { onDelete: "cascade" }),
		externalName: text("external_name"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		userUniq: uniqueIndex("problem_reviewers_user_uniq")
			.on(t.problemId, t.userId)
			.where(sql`${t.userId} IS NOT NULL`),
		externalUniq: uniqueIndex("problem_reviewers_external_uniq")
			.on(t.problemId, t.externalName)
			.where(sql`${t.externalName} IS NOT NULL`),
		userIdx: index("problem_reviewers_user_idx").on(t.userId),
		identityCheck: check(
			"problem_reviewers_identity_check",
			sql`(${t.userId} IS NOT NULL) <> (${t.externalName} IS NOT NULL)`
		),
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
			.references(() => problems.id, { onDelete: "cascade" })
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
		visibility: submissionVisibilityEnum("visibility").default("public").notNull(),

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
export const submissionResults = pgTable(
	"submission_results",
	{
		id: serial("id").primaryKey(),
		submissionId: integer("submission_id")
			.references(() => submissions.id, { onDelete: "cascade" })
			.notNull(),
		testcaseId: integer("testcase_id")
			.references(() => testcases.id, { onDelete: "cascade" })
			.notNull(),
		verdict: verdictEnum("verdict").notNull(),
		executionTime: integer("execution_time"), // ms
		memoryUsed: integer("memory_used"), // KB
		checkerMessage: text("checker_message"), // stderr from checker (admin only)
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		// 결과 이중 반영(동시 delete+insert 경합)이 중복 행을 남기지 못하도록 보장
		submissionTestcaseUq: uniqueIndex("submission_results_submission_testcase_uq").on(
			t.submissionId,
			t.testcaseId
		),
	})
);

// Contests table
export const contests = pgTable(
	"contests",
	{
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		description: text("description"),
		startTime: timestamp("start_time").notNull(),
		endTime: timestamp("end_time").notNull(),
		freezeMinutes: integer("freeze_minutes").default(60), // Minutes before end to freeze (null = no freeze)
		visibility: contestVisibilityEnum("visibility").default("public").notNull(),
		postContestVisibility: postContestVisibilityEnum("post_contest_visibility")
			.default("public")
			.notNull(),
		scoreboardType: scoreboardTypeEnum("scoreboard_type").default("basic").notNull(),
		penaltyMinutes: integer("penalty_minutes").default(20).notNull(), // ICPC penalty minutes
		sourceId: integer("source_id").references((): AnyPgColumn => sources.id, {
			onDelete: "set null",
		}),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		sourceIdx: index("contests_source_idx").on(t.sourceId),
	})
);

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

// Contest Operators - 대회 운영진
export const contestOperators = pgTable(
	"contest_operators",
	{
		contestId: integer("contest_id")
			.references(() => contests.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.contestId, t.userId] }),
		userIdx: index("contest_operators_user_idx").on(t.userId),
	})
);

// Practices (사용자가 생성하는 미니 대회)
export const practices = pgTable(
	"practices",
	{
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		description: text("description"),
		createdBy: integer("created_by")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		startTime: timestamp("start_time").notNull(),
		endTime: timestamp("end_time").notNull(),
		penaltyMinutes: integer("penalty_minutes").default(20).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		createdByIdx: index("practices_created_by_idx").on(t.createdBy),
		createdByDayIdx: index("practices_created_by_day_idx").on(t.createdBy, t.createdAt),
	})
);

export const practiceProblems = pgTable(
	"practice_problems",
	{
		id: serial("id").primaryKey(),
		practiceId: integer("practice_id")
			.references(() => practices.id, { onDelete: "cascade" })
			.notNull(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		label: text("label").notNull(),
		order: integer("order").notNull(),
	},
	(t) => ({
		practiceOrderIdx: index("practice_problems_practice_order_idx").on(t.practiceId, t.order),
		uniqProblem: uniqueIndex("practice_problems_uniq").on(t.practiceId, t.problemId),
	})
);

// Problem Sets (사용자 큐레이션 문제집)
export const problemSets = pgTable(
	"problem_sets",
	{
		id: serial("id").primaryKey(),
		title: text("title").notNull(),
		description: text("description"),
		createdBy: integer("created_by")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		likeCount: integer("like_count").default(0).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		createdByIdx: index("problem_sets_created_by_idx").on(t.createdBy),
		likeCountIdx: index("problem_sets_like_count_idx").on(t.likeCount),
		titleTrgmIdx: index("problem_sets_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
		descriptionTrgmIdx: index("problem_sets_description_trgm_idx").using(
			"gin",
			sql`${t.description} gin_trgm_ops`
		),
	})
);

export const problemSetItems = pgTable(
	"problem_set_items",
	{
		id: serial("id").primaryKey(),
		problemSetId: integer("problem_set_id")
			.references(() => problemSets.id, { onDelete: "cascade" })
			.notNull(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		order: integer("order").notNull(),
	},
	(t) => ({
		setOrderIdx: index("problem_set_items_set_order_idx").on(t.problemSetId, t.order),
		uniqProblem: uniqueIndex("problem_set_items_uniq").on(t.problemSetId, t.problemId),
	})
);

export const problemSetLikes = pgTable(
	"problem_set_likes",
	{
		problemSetId: integer("problem_set_id")
			.references(() => problemSets.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.problemSetId, t.userId] }),
		userCreatedIdx: index("problem_set_likes_user_created_idx").on(t.userId, t.createdAt),
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

export const workshopGroups = pgTable("workshop_groups", {
	id: serial("id").primaryKey(),
	name: text("name").notNull(),
	description: text("description").notNull().default(""),
	createdBy: integer("created_by")
		.references(() => users.id, { onDelete: "restrict" })
		.notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const workshopGroupMembers = pgTable(
	"workshop_group_members",
	{
		id: serial("id").primaryKey(),
		groupId: integer("group_id")
			.references(() => workshopGroups.id, { onDelete: "cascade" })
			.notNull(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		role: workshopGroupMemberRoleEnum("role").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		uniqPair: uniqueIndex("workshop_group_members_pair_idx").on(t.groupId, t.userId),
		userIdx: index("workshop_group_members_user_idx").on(t.userId),
	})
);

export const workshopProblems = pgTable(
	"workshop_problems",
	{
		id: serial("id").primaryKey(),
		publishedProblemId: integer("published_problem_id").references(() => problems.id, {
			onDelete: "set null",
		}),
		groupId: integer("group_id").references(() => workshopGroups.id, {
			onDelete: "set null",
		}),
		createdBy: integer("created_by")
			.references(() => users.id, { onDelete: "restrict" })
			.notNull(),
		publishedSnapshotId: integer("published_snapshot_id").references(
			(): AnyPgColumn => workshopSnapshots.id,
			{ onDelete: "set null" }
		),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		createdByIdx: index("workshop_problems_created_by_idx").on(t.createdBy),
		groupIdx: index("workshop_problems_group_idx").on(t.groupId),
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
		/** Optimistic-lock counter. Header-field updates require the expected value and bump it. */
		version: integer("version").notNull().default(0),
		// --- Phase A: per-draft 격리 헤더 (workshopProblems에서 이전) ---
		title: text("title").notNull().default(""),
		description: text("description").notNull().default(""),
		problemType: workshopProblemTypeEnum("problem_type").notNull().default("icpc"),
		timeLimit: integer("time_limit").notNull().default(1000),
		memoryLimit: integer("memory_limit").notNull().default(512),
		seed: text("seed").notNull().default(""),
		checkerLanguage: text("checker_language"),
		checkerPath: text("checker_path"),
		validatorLanguage: text("validator_language"),
		validatorPath: text("validator_path"),
		generatorScript: text("generator_script"),
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
		uniqDraftIndex: uniqueIndex("workshop_testcases_draft_index_uniq").on(t.draftId, t.index),
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
		/** Null for legacy rows created before draft scoping. New rows always set it. */
		draftId: integer("draft_id").references(() => workshopDrafts.id, { onDelete: "set null" }),
		kind: workshopInvocationKindEnum("kind").notNull().default("invoke"),
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
		draftIdx: index("workshop_invocations_draft_idx").on(t.draftId),
	})
);

// Problem Sources (문제 출처)
export const sources = pgTable(
	"sources",
	{
		id: serial("id").primaryKey(),
		parentId: integer("parent_id").references((): AnyPgColumn => sources.id, {
			onDelete: "cascade",
		}),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		nameNormalized: text("name_normalized").notNull(),
		description: text("description"),
		year: integer("year"),
		createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
		updatedBy: integer("updated_by").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		parentIdx: index("sources_parent_idx").on(t.parentId),
		siblingSlugIdx: uniqueIndex("sources_parent_slug_idx")
			.on(t.parentId, t.slug)
			.where(sql`parent_id IS NOT NULL`),
		rootSlugIdx: uniqueIndex("sources_root_slug_idx").on(t.slug).where(sql`parent_id IS NULL`),
		nameNormalizedIdx: index("sources_name_normalized_idx").on(t.nameNormalized),
	})
);

export const problemSources = pgTable(
	"problem_sources",
	{
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		sourceId: integer("source_id")
			.references(() => sources.id, { onDelete: "cascade" })
			.notNull(),
		problemNumber: text("problem_number"),
		createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		pk: primaryKey({ columns: [t.problemId, t.sourceId] }),
		sourceIdx: index("problem_sources_source_idx").on(t.sourceId),
	})
);

export const sourceAuditLog = pgTable(
	"source_audit_log",
	{
		id: serial("id").primaryKey(),
		sourceId: integer("source_id"),
		action: text("action").notNull(),
		actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
		payloadJson: jsonb("payload_json").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		sourceIdx: index("source_audit_log_source_idx").on(t.sourceId, t.createdAt),
		actorIdx: index("source_audit_log_actor_idx").on(t.actorId, t.createdAt),
	})
);

// User External Handles (Codeforces / AtCoder etc.)
export const userExternalHandles = pgTable(
	"user_external_handles",
	{
		id: serial("id").primaryKey(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		provider: externalSiteEnum("provider").notNull(),
		handle: text("handle").notNull(),
		rating: integer("rating"),
		updatedAt: timestamp("updated_at").defaultNow().notNull(),
	},
	(t) => ({
		userProviderUniq: uniqueIndex("user_external_handles_user_provider_uniq").on(
			t.userId,
			t.provider
		),
		handleUniq: uniqueIndex("user_external_handles_handle_uniq").on(
			t.provider,
			sql`lower(${t.handle})`
		),
		providerUpdatedIdx: index("user_external_handles_provider_updated_idx").on(
			t.provider,
			t.updatedAt
		),
	})
);

// User API Tokens (OAuth Device + PAT)
export const userApiTokens = pgTable(
	"user_api_tokens",
	{
		id: serial("id").primaryKey(),
		userId: integer("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		tokenHash: text("token_hash").notNull().unique(),
		refreshHash: text("refresh_hash").unique(),
		type: tokenTypeEnum("type").notNull(),
		scopes: text("scopes").array().notNull().default(sql`ARRAY['user']::text[]`),
		label: text("label"),
		expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
		refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }),
		lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
		revokedAt: timestamp("revoked_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
	},
	(t) => ({
		userIdx: index("user_api_tokens_user_idx").on(t.userId),
		tokenHashIdx: index("user_api_tokens_token_hash_idx").on(t.tokenHash),
	})
);

// =========================
// Notifications tables
// =========================

export const notificationTypeEnum = pgEnum("notification_type", [
	"submission_viewed",
	"rejudge",
	"admin_announcement",
	"board_comment",
]);

export const notifications = pgTable(
	"notifications",
	{
		id: serial("id").primaryKey(),
		userId: integer("user_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		type: notificationTypeEnum("type").notNull(),
		body: text("body").notNull(),
		readAt: timestamp("read_at"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		userCreatedIdx: index("notifications_user_created_idx").on(t.userId, t.createdAt),
		userReadIdx: index("notifications_user_read_idx").on(t.userId, t.readAt),
	})
);

export const submissionViews = pgTable(
	"submission_views",
	{
		id: serial("id").primaryKey(),
		submissionId: integer("submission_id")
			.references(() => submissions.id, { onDelete: "cascade" })
			.notNull(),
		viewerId: integer("viewer_id")
			.references(() => users.id, { onDelete: "cascade" })
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(t) => ({
		uniqViewer: unique("submission_views_submission_viewer_uniq").on(t.submissionId, t.viewerId),
	})
);

export const rejudgeBatches = pgTable("rejudge_batches", {
	id: serial("id").primaryKey(),
	adminId: integer("admin_id")
		.references(() => users.id)
		.notNull(),
	reason: text("reason").notNull(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rejudgeBatchItems = pgTable(
	"rejudge_batch_items",
	{
		id: serial("id").primaryKey(),
		batchId: integer("batch_id")
			.references(() => rejudgeBatches.id, { onDelete: "cascade" })
			.notNull(),
		submissionId: integer("submission_id")
			.references(() => submissions.id, { onDelete: "cascade" })
			.notNull(),
		problemId: integer("problem_id")
			.references(() => problems.id, { onDelete: "cascade" })
			.notNull(),
		beforeVerdict: verdictEnum("before_verdict").notNull(),
		afterVerdict: verdictEnum("after_verdict").default("pending").notNull(),
	},
	(t) => ({
		problemBatchIdx: index("rejudge_items_problem_batch_idx").on(t.problemId, t.batchId),
		submissionIdx: index("rejudge_items_submission_idx").on(t.submissionId),
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
export type ProblemFavorite = typeof problemFavorites.$inferSelect;
export type NewProblemFavorite = typeof problemFavorites.$inferInsert;
export type ProblemVote = typeof problemVotes.$inferSelect;
export type NewProblemVote = typeof problemVotes.$inferInsert;
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
export type ContestOperator = typeof contestOperators.$inferSelect;
export type NewContestOperator = typeof contestOperators.$inferInsert;
export type Practice = typeof practices.$inferSelect;
export type NewPractice = typeof practices.$inferInsert;
export type PracticeProblem = typeof practiceProblems.$inferSelect;
export type NewPracticeProblem = typeof practiceProblems.$inferInsert;
export type ProblemSet = typeof problemSets.$inferSelect;
export type NewProblemSet = typeof problemSets.$inferInsert;
export type ProblemSetItem = typeof problemSetItems.$inferSelect;
export type NewProblemSetItem = typeof problemSetItems.$inferInsert;
export type ProblemSetLike = typeof problemSetLikes.$inferSelect;
export type NewProblemSetLike = typeof problemSetLikes.$inferInsert;
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
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type ProblemSource = typeof problemSources.$inferSelect;
export type NewProblemSource = typeof problemSources.$inferInsert;
export type SourceAuditLog = typeof sourceAuditLog.$inferSelect;
export type NewSourceAuditLog = typeof sourceAuditLog.$inferInsert;
export type AlgorithmTag = typeof algorithmTags.$inferSelect;
export type NewAlgorithmTag = typeof algorithmTags.$inferInsert;
export type ProblemVoteTag = typeof problemVoteTags.$inferSelect;
export type NewProblemVoteTag = typeof problemVoteTags.$inferInsert;
export type ProblemConfirmedTag = typeof problemConfirmedTags.$inferSelect;
export type NewProblemConfirmedTag = typeof problemConfirmedTags.$inferInsert;
export type UserExternalHandle = typeof userExternalHandles.$inferSelect;
export type NewUserExternalHandle = typeof userExternalHandles.$inferInsert;
export type UserApiToken = typeof userApiTokens.$inferSelect;
export type NewUserApiToken = typeof userApiTokens.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NotificationType = (typeof notificationTypeEnum.enumValues)[number];
export type SubmissionView = typeof submissionViews.$inferSelect;
export type RejudgeBatch = typeof rejudgeBatches.$inferSelect;
export type RejudgeBatchItem = typeof rejudgeBatchItems.$inferSelect;

export type UserRole = (typeof userRoleEnum.enumValues)[number];
export type Verdict = (typeof verdictEnum.enumValues)[number];
// `Language` is re-exported at the top of this file from `@/lib/languages`
// (the single source of truth for the language set).
export type ProblemType = (typeof problemTypeEnum.enumValues)[number];
export type InputMethod = (typeof inputMethodEnum.enumValues)[number];
export type ContestVisibility = (typeof contestVisibilityEnum.enumValues)[number];
export type ScoreboardType = (typeof scoreboardTypeEnum.enumValues)[number];
export type PostContestVisibility = (typeof postContestVisibilityEnum.enumValues)[number];
export type SubmissionVisibility = (typeof submissionVisibilityEnum.enumValues)[number];
export type TokenType = (typeof tokenTypeEnum.enumValues)[number];

// Translation types (JSONB structure for problems.translations)
export type LanguageCode = "ko" | "en" | "ja" | "pl" | "hr";

export type Translation = {
	title: string;
	content: string;
	translatorId?: number | null;
	createdAt: string; // ISO 8601
	updatedAt: string; // ISO 8601
};

export type Translations = {
	original: LanguageCode;
	entries: Partial<Record<LanguageCode, Translation>>;
};
