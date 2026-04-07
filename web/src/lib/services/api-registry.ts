import { z } from "zod";
import { downloadFile } from "@/lib/storage";
import * as adminContestParticipants from "./contest-participants";
import * as adminContestProblems from "./contest-problems";
import * as adminContests from "./contests";
import * as adminFiles from "./files";
import * as adminJudgeTools from "./judge-tools";
import * as adminProblemStats from "./problem-stats";
import * as adminProblems from "./problems";
import * as adminSettings from "./settings";
import * as adminSubmissions from "./submissions";
import * as adminTestcases from "./testcases";
import * as adminUsers from "./users";

// --- Types ---

interface HandlerContext {
	pathParams: Record<string, string>;
	query: Record<string, unknown>;
	body: Record<string, unknown>;
}

interface JsonEndpoint {
	type: "json";
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	description: string;
	query?: z.ZodObject<z.ZodRawShape>;
	body?: z.ZodObject<z.ZodRawShape>;
	handler: (ctx: HandlerContext) => Promise<unknown>;
}

interface CustomEndpoint {
	type: "custom";
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	description: string;
	handler: (request: Request, pathParams: Record<string, string>) => Promise<Response>;
}

export type Endpoint = JsonEndpoint | CustomEndpoint;

// --- Schemas ---

const paginationQuery = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

// --- Registry ---
// IMPORTANT: specific paths must come BEFORE parameterized paths
// e.g., "users/search" before "users/:id", "settings/registration" before "settings/:key"

export const endpoints: Endpoint[] = [
	// ========== Problems ==========
	{
		type: "json",
		method: "GET",
		path: "problems",
		description: "List problems",
		query: paginationQuery,
		handler: async ({ query }) => adminProblems.getAdminProblems(query),
	},
	{
		type: "json",
		method: "POST",
		path: "problems",
		description: "Create a problem",
		body: z.object({
			id: z.number().int().optional(),
			title: z.string(),
			content: z.string(),
			timeLimit: z.number().int().default(1000),
			memoryLimit: z.number().int().default(512),
			maxScore: z.number().int().default(100),
			isPublic: z.boolean().default(false),
			judgeAvailable: z.boolean().optional(),
			problemType: z.enum(["icpc", "special_judge", "anigma", "interactive"]).optional(),
			allowedLanguages: z.array(z.string()).nullable().optional(),
			authorId: z.number().int().default(1),
		}),
		handler: async ({ body }) => {
			const b = body as Record<string, unknown>;
			const authorId = (b.authorId as number) ?? 1;
			const { authorId: _, ...data } = b;
			return adminProblems.createProblem(
				data as Parameters<typeof adminProblems.createProblem>[0],
				authorId
			);
		},
	},
	{
		type: "json",
		method: "GET",
		path: "problems/:id",
		description: "Get problem details",
		handler: async ({ pathParams }) => {
			const problem = await adminProblems.getProblemForEdit(parseInt(pathParams.id, 10));
			if (!problem) throw new NotFoundError("Problem not found");
			return problem;
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "problems/:id",
		description: "Update a problem",
		body: z.object({
			title: z.string().optional(),
			content: z.string().optional(),
			timeLimit: z.number().int().optional(),
			memoryLimit: z.number().int().optional(),
			maxScore: z.number().int().optional(),
			isPublic: z.boolean().optional(),
			judgeAvailable: z.boolean().optional(),
			problemType: z.enum(["icpc", "special_judge", "anigma", "interactive"]).optional(),
			checkerPath: z.string().nullable().optional(),
			validatorPath: z.string().nullable().optional(),
			allowedLanguages: z.array(z.string()).nullable().optional(),
		}),
		handler: async ({ pathParams, body }) =>
			adminProblems.updateProblem(
				parseInt(pathParams.id, 10),
				body as Parameters<typeof adminProblems.updateProblem>[1]
			),
	},
	{
		type: "json",
		method: "DELETE",
		path: "problems/:id",
		description: "Delete a problem",
		handler: async ({ pathParams }) => adminProblems.deleteProblem(parseInt(pathParams.id, 10)),
	},

	// ========== Public Problem Views ==========
	{
		type: "json",
		method: "GET",
		path: "public/problems",
		description: "List problems with public visibility filter and stats",
		query: paginationQuery.extend({
			publicOnly: z.coerce.boolean().optional(),
			search: z.string().optional(),
			sort: z.enum(["id", "title", "createdAt", "acceptRate", "submissionCount"]).optional(),
			order: z.enum(["asc", "desc"]).optional(),
			filter: z.enum(["all", "unsolved", "solved", "wrong", "new"]).optional(),
			userId: z.coerce.number().int().optional(),
			includeUnavailable: z.coerce.boolean().optional(),
			isAdmin: z.coerce.boolean().default(false),
		}),
		handler: async ({ query }) => {
			const q = query as Record<string, unknown> & { isAdmin: boolean };
			const { isAdmin, ...options } = q;
			return adminProblems.getProblems(options as Parameters<typeof adminProblems.getProblems>[0], {
				isAdmin,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "public/problems/:id",
		description: "Get problem detail with visibility check",
		query: z.object({
			contestId: z.coerce.number().int().optional(),
			userId: z.coerce.number().int().optional(),
			isAdmin: z.coerce.boolean().default(false),
		}),
		handler: async ({ pathParams, query }) => {
			const q = query as { contestId?: number; userId?: number; isAdmin: boolean };
			const problem = await adminProblems.getProblemById(parseInt(pathParams.id, 10), q.contestId, {
				userId: q.userId,
				isAdmin: q.isAdmin,
			});
			if (!problem) throw new NotFoundError("Problem not found or not accessible");
			return problem;
		},
	},

	// ========== Problem Staff (authors / reviewers) ==========
	{
		type: "json",
		method: "GET",
		path: "problems/:id/staff",
		description: "Get problem authors and reviewers",
		handler: async ({ pathParams }) => adminProblems.getProblemStaff(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "problems/:id/staff",
		description: "Add a problem author or reviewer",
		body: z.object({
			userId: z.number().int(),
			role: z.enum(["author", "reviewer"]),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; role: "author" | "reviewer" };
			return adminProblems.addProblemStaff(parseInt(pathParams.id, 10), b.userId, b.role);
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "problems/:id/staff/:userId",
		description: "Remove a problem author or reviewer",
		query: z.object({ role: z.enum(["author", "reviewer"]) }),
		handler: async ({ pathParams, query }) => {
			const q = query as { role: "author" | "reviewer" };
			return adminProblems.removeProblemStaff(
				parseInt(pathParams.id, 10),
				parseInt(pathParams.userId, 10),
				q.role
			);
		},
	},

	// ========== Problem Stats ==========
	{
		type: "json",
		method: "GET",
		path: "problems/:id/stats",
		description: "Get problem submission statistics",
		handler: async ({ pathParams }) =>
			adminProblemStats.getProblemStats(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "GET",
		path: "problems/:id/ranking",
		description: "Get problem accepted user ranking",
		query: z.object({
			sortBy: z.enum(["executionTime", "codeLength"]).default("executionTime"),
			language: z.string().optional(),
			page: z.coerce.number().int().default(1),
			limit: z.coerce.number().int().default(20),
		}),
		handler: async ({ pathParams, query }) => {
			const q = query as {
				sortBy: "executionTime" | "codeLength";
				language?: string;
				page: number;
				limit: number;
			};
			return adminProblemStats.getProblemRanking(parseInt(pathParams.id, 10), q);
		},
	},

	// ========== Testcases ==========
	{
		type: "json",
		method: "GET",
		path: "problems/:id/testcases",
		description: "List testcases for a problem",
		handler: async ({ pathParams }) => adminTestcases.getTestcases(parseInt(pathParams.id, 10)),
	},
	{
		type: "custom",
		method: "POST",
		path: "problems/:id/testcases",
		description: "Upload a testcase (FormData: inputFile, outputFile, score?, isHidden?)",
		handler: async (request, pathParams) => {
			const problemId = parseInt(pathParams.id, 10);
			const formData = await request.formData();
			const inputFile = formData.get("inputFile") as File | null;
			const outputFile = formData.get("outputFile") as File | null;
			if (!inputFile || !outputFile) {
				return Response.json({ error: "inputFile and outputFile are required" }, { status: 400 });
			}
			const score = parseInt(formData.get("score") as string, 10) || 0;
			const isHidden = formData.get("isHidden") !== "false";

			const inputRaw = Buffer.from(await inputFile.arrayBuffer());
			const outputRaw = Buffer.from(await outputFile.arrayBuffer());
			const inputBuffer = adminTestcases.normalizeLineEndings(inputRaw, inputFile.name);
			const outputBuffer = adminTestcases.normalizeLineEndings(outputRaw, outputFile.name);

			const result = await adminTestcases.uploadTestcase(problemId, inputBuffer, outputBuffer, {
				score,
				isHidden,
			});
			return Response.json(result, { status: 201 });
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "problems/:id/testcases/:testcaseId",
		description: "Delete a testcase",
		handler: async ({ pathParams }) =>
			adminTestcases.deleteTestcase(parseInt(pathParams.testcaseId, 10)),
	},

	// ========== Judge Tools ==========
	{
		type: "json",
		method: "POST",
		path: "problems/:id/checker",
		description: "Upload checker source code",
		body: z.object({ sourceCode: z.string(), filename: z.string().optional() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { sourceCode: string; filename?: string };
			return adminJudgeTools.uploadChecker(parseInt(pathParams.id, 10), b.sourceCode, b.filename);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "problems/:id/validator",
		description: "Upload validator source code",
		body: z.object({ sourceCode: z.string(), filename: z.string().optional() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { sourceCode: string; filename?: string };
			return adminJudgeTools.uploadValidator(parseInt(pathParams.id, 10), b.sourceCode, b.filename);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "problems/:id/validate",
		description: "Validate testcases",
		handler: async ({ pathParams }) =>
			adminJudgeTools.validateTestcases(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "GET",
		path: "problems/:id/validation-result",
		description: "Get validation result",
		handler: async ({ pathParams }) => {
			const result = await adminJudgeTools.getValidationResult(parseInt(pathParams.id, 10));
			return result ?? { status: "pending" };
		},
	},

	// ========== Users (specific paths first) ==========
	{
		type: "json",
		method: "GET",
		path: "users/search",
		description: "Search users by username or name",
		query: z.object({
			q: z.string().default(""),
			limit: z.coerce.number().int().default(20),
		}),
		handler: async ({ query }) => {
			const q = query as { q: string; limit: number };
			return adminUsers.searchUsers(q.q, q.limit);
		},
	},
	{
		type: "json",
		method: "GET",
		path: "users/by-username/:username",
		description: "Get a user by username (public profile)",
		handler: async ({ pathParams }) => {
			const user = await adminUsers.getUserByUsername(pathParams.username);
			if (!user) throw new NotFoundError("User not found");
			return user;
		},
	},
	{
		type: "json",
		method: "GET",
		path: "users",
		description: "List users",
		query: paginationQuery,
		handler: async ({ query }) => adminUsers.getAdminUsers(query),
	},
	{
		type: "json",
		method: "PUT",
		path: "users/:id/profile",
		description: "Update user profile (name, bio, avatarUrl)",
		body: z.object({
			name: z.string().optional(),
			bio: z.string().nullable().optional(),
			avatarUrl: z.string().nullable().optional(),
		}),
		handler: async ({ pathParams, body }) =>
			adminUsers.updateUserProfile(
				parseInt(pathParams.id, 10),
				body as Parameters<typeof adminUsers.updateUserProfile>[1]
			),
	},
	{
		type: "json",
		method: "DELETE",
		path: "users/:id",
		description: "Delete a user",
		handler: async ({ pathParams }) => adminUsers.deleteUser(parseInt(pathParams.id, 10), 0),
	},
	{
		type: "json",
		method: "PUT",
		path: "users/:id/role",
		description: "Update user role",
		body: z.object({ role: z.enum(["user", "admin"]) }),
		handler: async ({ pathParams, body }) =>
			adminUsers.updateUserRole(
				parseInt(pathParams.id, 10),
				(body as { role: "user" | "admin" }).role
			),
	},
	{
		type: "json",
		method: "PUT",
		path: "users/:id/playground",
		description: "Toggle playground access",
		body: z.object({ hasAccess: z.boolean() }),
		handler: async ({ pathParams, body }) =>
			adminUsers.togglePlaygroundAccess(
				parseInt(pathParams.id, 10),
				(body as { hasAccess: boolean }).hasAccess
			),
	},

	// ========== Contests ==========
	{
		type: "json",
		method: "GET",
		path: "contests",
		description: "List contests",
		query: paginationQuery.extend({
			status: z.enum(["upcoming", "running", "finished"]).optional(),
			visibility: z.enum(["public", "private"]).optional(),
		}),
		handler: async ({ query }) => {
			const q = query as { page: number; limit: number; status?: string; visibility?: string };
			return adminContests.getContests({
				page: q.page,
				limit: q.limit,
				...(q.status && { status: q.status as "upcoming" | "running" | "finished" }),
				...(q.visibility && { visibility: q.visibility as "public" | "private" }),
			});
		},
	},
	{
		type: "json",
		method: "POST",
		path: "contests",
		description: "Create a contest",
		body: z.object({
			title: z.string(),
			description: z.string().optional(),
			startTime: z.string(),
			endTime: z.string(),
			freezeMinutes: z.number().int().nullable().optional(),
			visibility: z.enum(["public", "private"]).optional(),
			scoreboardType: z.enum(["basic", "spotboard"]).optional(),
			penaltyMinutes: z.number().int().optional(),
		}),
		handler: async ({ body }) => {
			const b = body as Record<string, unknown>;
			return adminContests.createContest({
				...b,
				startTime: new Date(b.startTime as string),
				endTime: new Date(b.endTime as string),
			} as Parameters<typeof adminContests.createContest>[0]);
		},
	},
	{
		type: "json",
		method: "GET",
		path: "contests/:id",
		description: "Get contest details",
		handler: async ({ pathParams }) => {
			const contest = await adminContests.getContestById(parseInt(pathParams.id, 10));
			if (!contest) throw new NotFoundError("Contest not found");
			return contest;
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "contests/:id",
		description: "Update a contest",
		body: z.object({
			title: z.string().optional(),
			description: z.string().optional(),
			startTime: z.string().optional(),
			endTime: z.string().optional(),
			freezeMinutes: z.number().int().nullable().optional(),
			visibility: z.enum(["public", "private"]).optional(),
			scoreboardType: z.enum(["basic", "spotboard"]).optional(),
			penaltyMinutes: z.number().int().optional(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as Record<string, unknown>;
			if (b.startTime) b.startTime = new Date(b.startTime as string);
			if (b.endTime) b.endTime = new Date(b.endTime as string);
			return adminContests.updateContest(
				parseInt(pathParams.id, 10),
				b as Parameters<typeof adminContests.updateContest>[1]
			);
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "contests/:id",
		description: "Delete a contest",
		handler: async ({ pathParams }) => adminContests.deleteContest(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "contests/:id/freeze",
		description: "Toggle freeze state",
		handler: async ({ pathParams }) => adminContests.toggleFreezeState(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "contests/:id/refresh-scoreboard",
		description: "Refresh contest scoreboard",
		handler: async ({ pathParams }) =>
			adminJudgeTools.refreshContestScoreboard(parseInt(pathParams.id, 10)),
	},

	// ========== Contest Problems (specific paths first) ==========
	{
		type: "json",
		method: "PUT",
		path: "contests/:id/problems/reorder",
		description: "Reorder contest problems",
		body: z.object({ problemIds: z.array(z.number().int()) }),
		handler: async ({ pathParams, body }) =>
			adminContestProblems.reorderContestProblems(
				parseInt(pathParams.id, 10),
				(body as { problemIds: number[] }).problemIds
			),
	},
	{
		type: "json",
		method: "POST",
		path: "contests/:id/problems",
		description: "Add a problem to contest",
		body: z.object({ problemId: z.number().int(), label: z.string() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { problemId: number; label: string };
			return adminContestProblems.addProblemToContest({
				contestId: parseInt(pathParams.id, 10),
				problemId: b.problemId,
				label: b.label,
			});
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "contests/:id/problems/:contestProblemId",
		description: "Remove a problem from contest",
		handler: async ({ pathParams }) =>
			adminContestProblems.removeProblemFromContest(parseInt(pathParams.contestProblemId, 10)),
	},

	// ========== Contest Participants ==========
	{
		type: "json",
		method: "GET",
		path: "contests/:id/participants",
		description: "List contest participants",
		query: z.object({
			page: z.coerce.number().int().default(1),
			limit: z.coerce.number().int().default(100),
		}),
		handler: async ({ pathParams, query }) =>
			adminContestParticipants.getContestParticipants(parseInt(pathParams.id, 10), query),
	},
	{
		type: "json",
		method: "POST",
		path: "contests/:id/participants",
		description: "Add participant to contest",
		body: z.object({ userId: z.number().int() }),
		handler: async ({ pathParams, body }) =>
			adminContestParticipants.addParticipantToContest(
				parseInt(pathParams.id, 10),
				(body as { userId: number }).userId
			),
	},
	{
		type: "json",
		method: "DELETE",
		path: "contests/:id/participants/:userId",
		description: "Remove participant from contest",
		handler: async ({ pathParams }) =>
			adminContestParticipants.removeParticipantFromContest(
				parseInt(pathParams.id, 10),
				parseInt(pathParams.userId, 10)
			),
	},

	// ========== Settings (specific paths first) ==========
	{
		type: "json",
		method: "GET",
		path: "settings/registration",
		description: "Get registration status",
		handler: async () => ({ enabled: await adminSettings.getRegistrationStatus() }),
	},
	{
		type: "json",
		method: "PUT",
		path: "settings/registration",
		description: "Toggle registration",
		body: z.object({ enabled: z.boolean() }),
		handler: async ({ body }) =>
			adminSettings.toggleRegistration((body as { enabled: boolean }).enabled),
	},
	{
		type: "json",
		method: "GET",
		path: "settings/google-registration",
		description: "Get Google registration status",
		handler: async () => ({ enabled: await adminSettings.getGoogleRegistrationStatus() }),
	},
	{
		type: "json",
		method: "PUT",
		path: "settings/google-registration",
		description: "Toggle Google registration",
		body: z.object({ enabled: z.boolean() }),
		handler: async ({ body }) =>
			adminSettings.toggleGoogleRegistration((body as { enabled: boolean }).enabled),
	},
	{
		type: "json",
		method: "GET",
		path: "settings/:key",
		description: "Get a site setting",
		handler: async ({ pathParams }) => ({
			key: pathParams.key,
			value: await adminSettings.getSiteSetting(pathParams.key),
		}),
	},
	{
		type: "json",
		method: "PUT",
		path: "settings/:key",
		description: "Set a site setting",
		body: z.object({ value: z.string() }),
		handler: async ({ pathParams, body }) =>
			adminSettings.setSiteSetting(pathParams.key, (body as { value: string }).value),
	},

	// ========== Files ==========
	{
		type: "json",
		method: "GET",
		path: "files",
		description: "List all uploaded files",
		handler: async () => adminFiles.getAllUploadedFiles(),
	},
	{
		type: "json",
		method: "DELETE",
		path: "files",
		description: "Delete a file",
		query: z.object({ key: z.string() }),
		handler: async ({ query }) => adminFiles.deleteUploadedFile((query as { key: string }).key),
	},
	{
		type: "custom",
		method: "GET",
		path: "files/download",
		description: "Download a file",
		handler: async (request) => {
			const { searchParams } = new URL(request.url);
			const path = searchParams.get("path");
			if (!path) return Response.json({ error: "path parameter is required" }, { status: 400 });
			const buffer = await downloadFile(path);
			const filename = path.split("/").pop() || "file";
			return new Response(new Uint8Array(buffer), {
				headers: {
					"Content-Disposition": `attachment; filename="${filename}"`,
					"Content-Type": "application/octet-stream",
				},
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "files/content",
		description: "Get file content as text",
		query: z.object({ path: z.string() }),
		handler: async ({ query }) => {
			const buffer = await downloadFile((query as { path: string }).path);
			return { content: buffer.toString("utf-8") };
		},
	},

	// ========== Submissions ==========
	{
		type: "json",
		method: "GET",
		path: "submissions",
		description: "List submissions (admin view, no visibility filter)",
		query: paginationQuery.extend({
			userId: z.coerce.number().int().optional(),
			problemId: z.coerce.number().int().optional(),
			contestId: z.coerce.number().int().optional(),
			verdict: z.string().optional(),
			language: z.string().optional(),
			sort: z.enum(["id", "executionTime", "memoryUsed", "createdAt"]).optional(),
			order: z.enum(["asc", "desc"]).optional(),
		}),
		handler: async ({ query }) => adminSubmissions.getSubmissions(query),
	},
	{
		type: "json",
		method: "POST",
		path: "submissions",
		description: "Submit code for judging",
		body: z.object({
			problemId: z.number().int(),
			code: z.string(),
			language: z.string(),
			userId: z.number().int(),
			contestId: z.number().int().optional(),
		}),
		handler: async ({ body }) =>
			adminSubmissions.submitCode(body as Parameters<typeof adminSubmissions.submitCode>[0]),
	},
	{
		type: "json",
		method: "GET",
		path: "submissions/:id",
		description: "Get submission details",
		handler: async ({ pathParams }) => {
			const result = await adminSubmissions.getSubmissionById(parseInt(pathParams.id, 10));
			if (!result) throw new NotFoundError("Submission not found");
			return result;
		},
	},
	{
		type: "json",
		method: "GET",
		path: "submissions/user-problem-statuses",
		description: "Get accepted statuses for a user across multiple problems",
		query: z.object({
			userId: z.coerce.number().int(),
			problemIds: z.string(), // comma-separated
			contestId: z.coerce.number().int().optional(),
		}),
		handler: async ({ query }) => {
			const q = query as { userId: number; problemIds: string; contestId?: number };
			const ids = q.problemIds
				.split(",")
				.map((s) => parseInt(s.trim(), 10))
				.filter((n) => !Number.isNaN(n));
			const map = await adminSubmissions.getUserProblemStatuses(ids, q.userId, q.contestId);
			return Object.fromEntries(map);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "submissions/:id/rejudge",
		description: "Rejudge a submission",
		handler: async ({ pathParams }) =>
			adminSubmissions.rejudgeSubmission(parseInt(pathParams.id, 10)),
	},

	// ========== Meta ==========
	{
		type: "json",
		method: "GET",
		path: "meta/endpoints",
		description: "List all API endpoints with schemas (for CLI auto-generation)",
		handler: async () => {
			const { generateContracts } = await import("./api-contract");
			return generateContracts();
		},
	},
];

// --- Errors ---

export class NotFoundError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "NotFoundError";
	}
}
