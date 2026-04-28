import { z } from "zod";
import { VOTES_PAGE_SIZE } from "@/lib/constants/votes";
import { enqueue, runNow } from "@/lib/queue/rating-queue";
import { downloadFile } from "@/lib/storage";
import { getDescendantIds } from "@/lib/tags/tree-queries";
import { translationsSchema } from "@/lib/validation/translations";
import { ensureWorkshopDraft, getActiveDraftForUser } from "@/lib/workshop/drafts";
import { ensureValidateSubscriberStarted } from "@/lib/workshop/validate-pubsub";
import * as adminAlgorithmTags from "./algorithm-tags";
import * as adminContestParticipants from "./contest-participants";
import * as adminContestProblems from "./contest-problems";
import * as adminContests from "./contests";
import * as adminFiles from "./files";
import * as adminJudgeTools from "./judge-tools";
import * as adminProblemStats from "./problem-stats";
import * as adminVoteTags from "./problem-vote-tags";
import * as adminVotes from "./problem-votes";
import * as adminProblems from "./problems";
import * as quotaSvc from "./quota";
import * as adminSettings from "./settings";
import * as adminSources from "./sources";
import * as adminSubmissions from "./submissions";
import * as adminTestcases from "./testcases";
import * as adminUsers from "./users";
import * as workshopAdminSvc from "./workshop-admin";
import * as workshopCheckerSvc from "./workshop-checker";
import * as workshopGeneratorsSvc from "./workshop-generators";
import * as workshopGroupsSvc from "./workshop-groups";
import * as workshopInvocationsSvc from "./workshop-invocations";
import * as workshopInboxSvc from "./workshop-manual-inbox";
import * as workshopMembersSvc from "./workshop-members";
import * as workshopProblemsSvc from "./workshop-problems";
import * as workshopPublishSvc from "./workshop-publish";
import * as workshopReadinessSvc from "./workshop-publish-readiness";
import * as workshopResourcesSvc from "./workshop-resources";
import * as workshopScriptSvc from "./workshop-script-runner";
import * as workshopSnapshotsSvc from "./workshop-snapshots";
import * as workshopSolutionsSvc from "./workshop-solutions";
import * as workshopStatementSvc from "./workshop-statement";
import * as workshopTestcasesSvc from "./workshop-testcases";
import * as workshopValidatorSvc from "./workshop-validator";

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
			translations: translationsSchema,
			timeLimit: z.number().int().default(1000),
			memoryLimit: z.number().int().default(512),
			maxScore: z.number().int().default(100),
			isPublic: z.boolean().default(false),
			judgeAvailable: z.boolean().optional(),
			problemType: z.enum(["icpc", "special_judge", "anigma", "interactive"]).optional(),
			allowedLanguages: z.array(z.string()).nullable().optional(),
		}),
		handler: async ({ body }) =>
			adminProblems.createProblem(body as Parameters<typeof adminProblems.createProblem>[0]),
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

	// ========== Problem Translations ==========
	{
		type: "json",
		method: "GET",
		path: "problems/:id/translations",
		description: "Get all translations for a problem",
		handler: async ({ pathParams }) => {
			const translations = await adminProblems.getTranslations(parseInt(pathParams.id, 10));
			if (!translations) throw new NotFoundError("Problem not found");
			return translations;
		},
	},
	{
		type: "json",
		method: "POST",
		path: "problems/:id/translations/:language",
		description: "Upsert a translation for a problem",
		body: z.object({
			title: z.string().min(1),
			content: z.string().min(1),
			translatorId: z.number().int().nullable().optional(),
		}),
		handler: async ({ pathParams, body }) => {
			return adminProblems.upsertTranslation(
				parseInt(pathParams.id, 10),
				pathParams.language as "ko" | "en" | "ja" | "pl" | "hr",
				body as { title: string; content: string; translatorId?: number | null }
			);
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "problems/:id/translations/:language",
		description: "Delete a non-original translation",
		handler: async ({ pathParams }) => {
			return adminProblems.deleteTranslation(
				parseInt(pathParams.id, 10),
				pathParams.language as "ko" | "en" | "ja" | "pl" | "hr"
			);
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "problems/:id/translations/:language/promote",
		description: "Promote a translation to be the original language",
		handler: async ({ pathParams }) => {
			return adminProblems.promoteOriginal(
				parseInt(pathParams.id, 10),
				pathParams.language as "ko" | "en" | "ja" | "pl" | "hr"
			);
		},
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
			sort: z.enum(adminProblems.GET_PROBLEMS_SORT_KEYS).optional(),
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
		description:
			"Upload a testcase (FormData: inputFile, outputFile, score?, isHidden?, subtaskGroup?)",
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
			const subtaskGroupRaw = formData.get("subtaskGroup");
			let subtaskGroup: number | undefined;
			if (typeof subtaskGroupRaw === "string" && subtaskGroupRaw.length > 0) {
				const parsed = parseInt(subtaskGroupRaw, 10);
				if (!Number.isFinite(parsed) || parsed < 0) {
					return Response.json(
						{ error: "subtaskGroup must be a non-negative integer" },
						{ status: 400 }
					);
				}
				subtaskGroup = parsed;
			}

			const inputRaw = Buffer.from(await inputFile.arrayBuffer());
			const outputRaw = Buffer.from(await outputFile.arrayBuffer());
			const inputBuffer = adminTestcases.normalizeLineEndings(inputRaw, inputFile.name);
			const outputBuffer = adminTestcases.normalizeLineEndings(outputRaw, outputFile.name);

			const result = await adminTestcases.uploadTestcase(problemId, inputBuffer, outputBuffer, {
				score,
				isHidden,
				...(subtaskGroup !== undefined ? { subtaskGroup } : {}),
			});
			return Response.json(result, { status: 201 });
		},
	},
	{
		type: "custom",
		method: "POST",
		path: "problems/:id/testcases/bulk",
		description:
			"Bulk upload testcases (FormData: inputFiles[], outputFiles[], metadata? JSON array of {score,isHidden,subtaskGroup})",
		handler: async (request, pathParams) => {
			const problemId = parseInt(pathParams.id, 10);
			const formData = await request.formData();
			const inputFiles = formData.getAll("inputFiles").filter((f): f is File => f instanceof File);
			const outputFiles = formData
				.getAll("outputFiles")
				.filter((f): f is File => f instanceof File);

			if (inputFiles.length === 0) {
				return Response.json({ error: "inputFiles[] is required" }, { status: 400 });
			}
			if (inputFiles.length !== outputFiles.length) {
				return Response.json(
					{
						error: `inputFiles (${inputFiles.length}) and outputFiles (${outputFiles.length}) count mismatch`,
					},
					{ status: 400 }
				);
			}

			let metadata: Array<{ score?: number; isHidden?: boolean; subtaskGroup?: number }> = [];
			const metadataRaw = formData.get("metadata");
			if (typeof metadataRaw === "string" && metadataRaw.length > 0) {
				try {
					const parsed = JSON.parse(metadataRaw);
					if (!Array.isArray(parsed)) throw new Error("metadata must be an array");
					metadata = parsed;
				} catch (err) {
					const msg = err instanceof Error ? err.message : String(err);
					return Response.json({ error: `Invalid metadata: ${msg}` }, { status: 400 });
				}
			}

			const pairs = await Promise.all(
				inputFiles.map(async (inputFile, i) => {
					const outputFile = outputFiles[i];
					const inputRaw = Buffer.from(await inputFile.arrayBuffer());
					const outputRaw = Buffer.from(await outputFile.arrayBuffer());
					return {
						inputBuffer: adminTestcases.normalizeLineEndings(inputRaw, inputFile.name),
						outputBuffer: adminTestcases.normalizeLineEndings(outputRaw, outputFile.name),
						score: metadata[i]?.score,
						isHidden: metadata[i]?.isHidden,
						subtaskGroup: metadata[i]?.subtaskGroup,
					};
				})
			);

			const result = await adminTestcases.uploadTestcasesBulk(problemId, pairs);
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

	// ========== Problem Votes (difficulty / tags) ==========
	// 관리자 API 키로 호출되며, `userId`를 명시해 해당 유저 명의로 투표를 수행한다.
	// 어뷰징 방지용 AC 체크는 `isAdmin: true`로 면제하지만,
	// 문제 상세의 "현재 진행 중인 컨테스트에 포함" 차단은 그대로 적용된다.
	{
		type: "json",
		method: "GET",
		path: "problems/:id/votes",
		description: "List difficulty votes for a problem (paginated)",
		query: z.object({
			page: z.coerce.number().int().min(1).default(1),
			limit: z.coerce.number().int().min(1).max(100).default(VOTES_PAGE_SIZE),
		}),
		handler: async ({ pathParams, query }) => {
			const q = query as { page: number; limit: number };
			const problemId = parseInt(pathParams.id, 10);
			const [votes, totalVotes] = await Promise.all([
				adminVotes.listVotesForProblem(problemId, {
					limit: q.limit,
					offset: (q.page - 1) * q.limit,
				}),
				adminVotes.countVotesForProblem(problemId),
			]);
			return { votes, totalVotes, page: q.page, limit: q.limit };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "problems/:id/votes/:userId",
		description: "Get a specific user's vote on a problem",
		handler: async ({ pathParams }) => {
			const problemId = parseInt(pathParams.id, 10);
			const userId = parseInt(pathParams.userId, 10);
			const [vote, tagIds] = await Promise.all([
				adminVotes.getMyVote(userId, problemId),
				adminVoteTags.getMyVoteTags(userId, problemId),
			]);
			return { vote, tagIds };
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "problems/:id/votes/:userId",
		description:
			"Upsert a user's difficulty vote and algorithm tags. level=1..30 (난이도), null=판단 불가. tagIds 미지정 시 기존 태그 유지.",
		body: z.object({
			level: z.number().int().min(1).max(30).nullable(),
			comment: z.string().nullable().optional(),
			tagIds: z.array(z.number().int()).optional(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as {
				level: number | null;
				comment?: string | null;
				tagIds?: number[];
			};
			const problemId = parseInt(pathParams.id, 10);
			const userId = parseInt(pathParams.userId, 10);
			await adminVotes.upsertVote({
				userId,
				problemId,
				level: b.level,
				comment: b.comment ?? null,
				isAdmin: true,
			});
			if (b.tagIds !== undefined) {
				await adminVoteTags.replaceUserVoteTags({ userId, problemId, tagIds: b.tagIds });
			}
			await runNow({ kind: "recomputeProblemTier", problemId });
			await runNow({ kind: "recomputeProblemTags", problemId });
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "problems/:id/votes/:userId",
		description: "Remove a user's difficulty vote and tag picks, then recompute tier/tags",
		handler: async ({ pathParams }) => {
			const problemId = parseInt(pathParams.id, 10);
			const userId = parseInt(pathParams.userId, 10);
			await adminVotes.removeVote(userId, problemId);
			await adminVoteTags.replaceUserVoteTags({ userId, problemId, tagIds: [] });
			await runNow({ kind: "recomputeProblemTier", problemId });
			await runNow({ kind: "recomputeProblemTags", problemId });
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "problems/:id/confirmed-tags",
		description: "List confirmed algorithm tags for a problem",
		handler: async ({ pathParams }) =>
			adminVoteTags.listConfirmedTagsForProblem(parseInt(pathParams.id, 10)),
	},

	// ========== Algorithm Tags (specific paths first) ==========
	{
		type: "json",
		method: "GET",
		path: "tags/search",
		description: "Search algorithm tags by name (ILIKE, returns with ancestor path)",
		query: z.object({
			q: z.string().default(""),
			limit: z.coerce.number().int().min(1).max(100).default(30),
		}),
		handler: async ({ query }) => {
			const q = query as { q: string; limit: number };
			return adminAlgorithmTags.searchTags(q.q, q.limit);
		},
	},
	{
		type: "json",
		method: "GET",
		path: "tags/roots",
		description: "List root algorithm tags",
		handler: async () => adminAlgorithmTags.listRootTags(),
	},
	{
		type: "json",
		method: "GET",
		path: "tags/by-slug/:slug",
		description: "Get an algorithm tag by slug (with ancestor path)",
		handler: async ({ pathParams }) => {
			const tag = await adminAlgorithmTags.getTagBySlug(pathParams.slug);
			if (!tag) throw new NotFoundError("Tag not found");
			return tag;
		},
	},
	{
		type: "json",
		method: "GET",
		path: "tags",
		description: "List algorithm tags (flat, with problem count and pagination)",
		query: z.object({
			search: z.string().optional(),
			sortBy: z.enum(["name", "problemCount"]).optional(),
			order: z.enum(["asc", "desc"]).optional(),
			page: z.coerce.number().int().min(1).default(1),
			limit: z.coerce.number().int().min(1).max(200).default(100),
		}),
		handler: async ({ query }) =>
			adminAlgorithmTags.listAllTagsWithProblemCount(
				query as Parameters<typeof adminAlgorithmTags.listAllTagsWithProblemCount>[0]
			),
	},
	{
		type: "json",
		method: "POST",
		path: "tags",
		description: "Create an algorithm tag (actor recorded as null for API-origin mutations)",
		body: z.object({
			parentId: z.number().int().nullable(),
			slug: z.string().min(1),
			name: z.string().min(1),
			description: z.string().nullable().optional(),
		}),
		handler: async ({ body }) => {
			const b = body as {
				parentId: number | null;
				slug: string;
				name: string;
				description?: string | null;
			};
			return adminAlgorithmTags.createTag({
				parentId: b.parentId,
				slug: b.slug,
				name: b.name,
				description: b.description ?? null,
				userId: null,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "tags/:id",
		description: "Get an algorithm tag by id (with ancestor path)",
		handler: async ({ pathParams }) => {
			const tag = await adminAlgorithmTags.getTag(parseInt(pathParams.id, 10));
			if (!tag) throw new NotFoundError("Tag not found");
			return tag;
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "tags/:id",
		description: "Update an algorithm tag (rename / reparent / change slug / description)",
		body: z.object({
			parentId: z.number().int().nullable().optional(),
			slug: z.string().min(1).optional(),
			name: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as {
				parentId?: number | null;
				slug?: string;
				name?: string;
				description?: string | null;
			};
			return adminAlgorithmTags.updateTag(parseInt(pathParams.id, 10), { ...b, userId: null });
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "tags/:id",
		description:
			"Delete an algorithm tag subtree (cascades to problem_vote_tags / problem_confirmed_tags, triggers tag recompute for affected problems)",
		handler: async ({ pathParams }) => {
			const id = parseInt(pathParams.id, 10);
			const descendantIds = await getDescendantIds(id);
			const affectedProblemIds = await adminVoteTags.listProblemIdsAffectedByTags(descendantIds);
			await adminAlgorithmTags.deleteTag(id);
			for (const problemId of affectedProblemIds) {
				enqueue({ kind: "recomputeProblemTags", problemId });
			}
			return { affectedProblemCount: affectedProblemIds.length };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "tags/:id/children",
		description: "List direct children of an algorithm tag",
		handler: async ({ pathParams }) => adminAlgorithmTags.listChildren(parseInt(pathParams.id, 10)),
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
		description: "Delete a user. `actorUserId` identifies the caller (used to block self-delete).",
		query: z.object({ actorUserId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { actorUserId: number };
			return adminUsers.deleteUser(parseInt(pathParams.id, 10), q.actorUserId);
		},
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
		path: "users/:id/playground-quota",
		description: "Set playground quota",
		body: z.object({ quota: z.number().int().nonnegative() }),
		handler: async ({ pathParams, body }) =>
			quotaSvc.setPlaygroundQuota(parseInt(pathParams.id, 10), (body as { quota: number }).quota),
	},
	{
		type: "json",
		method: "PUT",
		path: "users/:id/workshop-quota",
		description: "Set workshop quota",
		body: z.object({ quota: z.number().int().nonnegative() }),
		handler: async ({ pathParams, body }) => {
			const userId = parseInt(pathParams.id, 10);
			if (!Number.isFinite(userId) || userId <= 0) {
				throw new Error("Invalid user id");
			}
			return quotaSvc.setWorkshopQuota(userId, (body as { quota: number }).quota);
		},
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
	// ========== Sources ==========
	{
		type: "json",
		method: "GET",
		path: "sources/search",
		description: "Search sources by name (normalized ILIKE)",
		query: z.object({ q: z.string() }),
		handler: async ({ query }) => adminSources.searchSources((query as { q: string }).q),
	},
	{
		type: "json",
		method: "GET",
		path: "sources",
		description: "List child sources (roots when parent omitted)",
		query: z.object({ parent: z.coerce.number().int().optional() }),
		handler: async ({ query }) => {
			const q = query as { parent?: number };
			return q.parent === undefined
				? adminSources.listRootSources()
				: adminSources.listChildren(q.parent);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "sources",
		description: "Create a source node",
		body: z.object({
			parentId: z.number().int().nullable(),
			slug: z.string().min(1),
			name: z.string().min(1),
			year: z.number().int().nullable(),
		}),
		handler: async ({ body }) =>
			adminSources.createSource(body as Parameters<typeof adminSources.createSource>[0], null),
	},
	{
		type: "json",
		method: "GET",
		path: "sources/:id",
		description: "Get a single source node",
		handler: async ({ pathParams }) => {
			const row = await adminSources.getSource(Number.parseInt(pathParams.id, 10));
			if (!row) throw new NotFoundError("Source not found");
			return row;
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "sources/:id",
		description: "Update a source node (rename, reparent, change year/slug)",
		body: z.object({
			parentId: z.number().int().nullable().optional(),
			slug: z.string().optional(),
			name: z.string().optional(),
			year: z.number().int().nullable().optional(),
		}),
		handler: async ({ pathParams, body }) =>
			adminSources.updateSource(
				Number.parseInt(pathParams.id, 10),
				body as Parameters<typeof adminSources.updateSource>[1],
				null
			),
	},
	{
		type: "json",
		method: "DELETE",
		path: "sources/:id",
		description: "Delete a source subtree (cascades to problem_sources, detaches contests)",
		handler: async ({ pathParams }) =>
			adminSources.deleteSource(Number.parseInt(pathParams.id, 10), null),
	},
	{
		type: "json",
		method: "GET",
		path: "sources/:id/problems",
		description: "List problems attached to a source (optionally including descendants)",
		query: z.object({
			includeDescendants: z.coerce.boolean().default(true),
			page: z.coerce.number().int().min(1).default(1),
			limit: z.coerce.number().int().min(1).max(100).default(20),
		}),
		handler: async ({ pathParams, query }) => {
			const q = query as { includeDescendants: boolean; page: number; limit: number };
			return adminSources.listProblemsBySource(Number.parseInt(pathParams.id, 10), q);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "sources/:id/problems:bulk-add",
		description:
			"Add problems to a source (idempotent). problemNumber 는 출처 내 라벨(A/B/..) 이며 기존 값이 비어있을 때만 갱신된다.",
		body: z.object({
			items: z.array(
				z.object({
					problemId: z.number().int(),
					problemNumber: z.string().nullable().optional(),
				})
			),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { items: { problemId: number; problemNumber?: string | null }[] };
			return adminSources.addProblemsToSource(Number.parseInt(pathParams.id, 10), b.items, null);
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "contests/:id/source",
		description: "Attach or detach a source from a contest",
		body: z.object({ sourceId: z.number().int().nullable() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { sourceId: number | null };
			// REST API is authenticated by shared API key, so no specific actor user id.
			// Audit log actor remains null for API-origin mutations.
			await adminSources.setContestSource(Number.parseInt(pathParams.id, 10), b.sourceId, null);
			return { ok: true };
		},
	},
	// ========================================================================
	// Workshop (창작마당)
	// ========================================================================
	// Workshop endpoints are admin-API-key authenticated. Draft-scoped operations
	// require an explicit `userId` (query for GET/DELETE, body for POST/PUT) so
	// the caller indicates which author's draft is targeted.
	// `getActiveDraftForUser(problemId, userId, true)` bypasses membership check
	// (admin) and auto-creates the draft if missing.
	// IMPORTANT: more specific paths come BEFORE parameterized paths.

	// ---------- Workshop Admin (specific paths first) ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/admin/problems",
		description: "Admin: list every workshop problem (optional title/owner filter)",
		query: z.object({ q: z.string().optional() }),
		handler: async ({ query }) => {
			const q = query as { q?: string };
			return workshopAdminSvc.listAllWorkshopProblemsForAdmin(q.q);
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/admin/problems/:id",
		description: "Admin: get workshop problem detail (with latest snapshot)",
		handler: async ({ pathParams }) => {
			const detail = await workshopAdminSvc.getAdminWorkshopProblemDetail(
				parseInt(pathParams.id, 10)
			);
			if (!detail) throw new NotFoundError("Workshop problem not found");
			return detail;
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/admin/problems/:id/readiness",
		description: "Admin: compute publish readiness for the latest committed snapshot",
		handler: async ({ pathParams }) =>
			workshopReadinessSvc.computePublishReadiness(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/admin/problems/:id/publish",
		description: "Admin: publish the latest snapshot as a NEW problems row",
		handler: async ({ pathParams }) =>
			workshopPublishSvc.publishWorkshopAsNewProblem({
				workshopProblemId: parseInt(pathParams.id, 10),
			}),
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/admin/problems/:id/republish",
		description: "Admin: re-publish (destructive) the latest snapshot to the existing problems row",
		handler: async ({ pathParams }) =>
			workshopPublishSvc.republishWorkshopToExistingProblem({
				workshopProblemId: parseInt(pathParams.id, 10),
			}),
	},

	// ========== Workshop Groups ==========
	{
		type: "json",
		method: "POST",
		path: "workshop/admin/groups",
		description: "Create a workshop group with one initial owner (admin)",
		body: z.object({
			adminUserId: z.number().int(),
			name: z.string().min(1).max(100),
			description: z.string().max(1000).optional(),
			initialOwnerUserId: z.number().int(),
		}),
		handler: async ({ body }) => {
			const b = body as {
				adminUserId: number;
				name: string;
				description?: string;
				initialOwnerUserId: number;
			};
			return workshopGroupsSvc.createGroup({
				name: b.name,
				description: b.description,
				initialOwnerUserId: b.initialOwnerUserId,
				createdBy: b.adminUserId,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/admin/groups",
		description: "List all workshop groups (admin view)",
		handler: async () => workshopGroupsSvc.listAllGroups(),
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/admin/groups/:gid",
		description: "Delete a workshop group (detach published, cascade unpublished)",
		handler: async ({ pathParams }) => {
			await workshopGroupsSvc.deleteGroup(parseInt(pathParams.gid, 10));
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/groups/:gid/members",
		description: "List group members",
		handler: async ({ pathParams }) =>
			workshopGroupsSvc.listGroupMembers(parseInt(pathParams.gid, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/groups/:gid/members",
		description: "Add a user to a group (with sync fan-out into all group problems' members)",
		body: z.object({
			username: z.string().min(1),
			role: z.enum(["owner", "member"]),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { username: string; role: "owner" | "member" };
			await workshopGroupsSvc.addGroupMember(parseInt(pathParams.gid, 10), b.username, b.role);
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/groups/:gid/members/:userId",
		description: "Remove a user from a group. Transfers problem ownership if needed.",
		handler: async ({ pathParams }) => {
			await workshopGroupsSvc.removeGroupMember(
				parseInt(pathParams.gid, 10),
				parseInt(pathParams.userId, 10)
			);
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/groups/:gid/problems",
		description: "List problems in a group",
		handler: async ({ pathParams }) =>
			workshopGroupsSvc.listGroupProblems(parseInt(pathParams.gid, 10)),
	},

	// ---------- Workshop Problems (CRUD) ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems",
		description:
			"List workshop problems the given user is a member of. For an unscoped admin view use `workshop/admin/problems`.",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ query }) => {
			const q = query as { userId: number };
			return workshopProblemsSvc.listMyWorkshopProblems(q.userId, false);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems",
		description: "Create a workshop problem owned by userId (auto-seeds draft + bundled checker)",
		body: z.object({
			userId: z.number().int(),
			title: z.string().min(1),
			problemType: z.enum(["icpc", "special_judge"]).default("icpc"),
			timeLimit: z.number().int().min(100).max(10000).default(1000),
			memoryLimit: z.number().int().min(16).max(2048).default(256),
		}),
		handler: async ({ body }) => {
			const b = body as {
				userId: number;
				title: string;
				problemType: "icpc" | "special_judge";
				timeLimit: number;
				memoryLimit: number;
			};
			const problem = await workshopProblemsSvc.createWorkshopProblem(
				{
					title: b.title,
					problemType: b.problemType,
					timeLimit: b.timeLimit,
					memoryLimit: b.memoryLimit,
				},
				b.userId
			);
			await ensureWorkshopDraft(problem.id, b.userId);
			return problem;
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id",
		description:
			"Get workshop problem detail as the given user (membership-checked). For an unscoped admin view use `workshop/admin/problems/:id`.",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problem = await workshopProblemsSvc.getWorkshopProblemForUser(
				parseInt(pathParams.id, 10),
				q.userId,
				false
			);
			if (!problem) throw new NotFoundError("Workshop problem not found or user has no access");
			return problem;
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id",
		description: "Update workshop problem time/memory limits",
		body: z.object({
			userId: z.number().int(),
			timeLimit: z.number().int().min(100).max(10000),
			memoryLimit: z.number().int().min(16).max(2048),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; timeLimit: number; memoryLimit: number };
			await workshopProblemsSvc.updateWorkshopProblemLimits(
				parseInt(pathParams.id, 10),
				b.userId,
				{ timeLimit: b.timeLimit, memoryLimit: b.memoryLimit },
				true
			);
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id",
		description: "Delete a workshop problem (cascades to drafts/snapshots/MinIO data)",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			await workshopProblemsSvc.deleteWorkshopProblem(parseInt(pathParams.id, 10), q.userId, true);
			return { ok: true };
		},
	},

	// ---------- Statement ----------
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/statement",
		description: "Update workshop problem statement (title + markdown description)",
		body: z.object({
			title: z.string().min(1).max(200),
			description: z.string().max(200_000),
		}),
		handler: async ({ pathParams, body }) =>
			workshopStatementSvc.updateStatement(
				parseInt(pathParams.id, 10),
				body as { title: string; description: string }
			),
	},

	// ---------- Members ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/members",
		description: "List workshop problem members",
		handler: async ({ pathParams }) => workshopMembersSvc.listMembers(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/members",
		description: "Add a member to a workshop problem (looked up by username)",
		body: z.object({
			username: z.string().min(1),
			role: z.enum(["owner", "member"]),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { username: string; role: "owner" | "member" };
			await workshopMembersSvc.addMember(parseInt(pathParams.id, 10), b.username, b.role);
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/members/:userId/role",
		description: "Change a member's role (owner/member)",
		body: z.object({ role: z.enum(["owner", "member"]) }),
		handler: async ({ pathParams, body }) => {
			const b = body as { role: "owner" | "member" };
			await workshopMembersSvc.changeMemberRole(
				parseInt(pathParams.id, 10),
				parseInt(pathParams.userId, 10),
				b.role
			);
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/members/:userId",
		description: "Remove a member from a workshop problem",
		handler: async ({ pathParams }) => {
			await workshopMembersSvc.removeMember(
				parseInt(pathParams.id, 10),
				parseInt(pathParams.userId, 10)
			);
			return { ok: true };
		},
	},

	// ---------- Testcases (specific paths first) ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/testcases",
		description: "List testcases for a user's draft",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			const testcases = await workshopTestcasesSvc.listTestcasesForDraft(draft.id);
			return { draftId: draft.id, testcases };
		},
	},
	{
		type: "custom",
		method: "POST",
		path: "workshop/problems/:id/testcases",
		description:
			"Upload a manual testcase (FormData: userId, inputFile, outputFile?, score?, subtaskGroup?)",
		handler: async (request, pathParams) => {
			const problemId = parseInt(pathParams.id, 10);
			const formData = await request.formData();
			const userIdRaw = formData.get("userId");
			if (typeof userIdRaw !== "string") {
				return Response.json({ error: "userId is required" }, { status: 400 });
			}
			const userId = parseInt(userIdRaw, 10);
			if (!Number.isFinite(userId)) {
				return Response.json({ error: "userId must be an integer" }, { status: 400 });
			}
			const inputFile = formData.get("inputFile");
			if (!(inputFile instanceof File)) {
				return Response.json({ error: "inputFile is required" }, { status: 400 });
			}
			const outputFile = formData.get("outputFile");
			const input = Buffer.from(await inputFile.arrayBuffer());
			const output =
				outputFile instanceof File && outputFile.size > 0
					? Buffer.from(await outputFile.arrayBuffer())
					: null;

			const draft = await getActiveDraftForUser(problemId, userId, true);
			const scoreRaw = formData.get("score");
			const subtaskRaw = formData.get("subtaskGroup");
			const created = await workshopTestcasesSvc.createManualTestcase({
				problemId,
				userId,
				draftId: draft.id,
				input,
				output,
				score: typeof scoreRaw === "string" ? parseInt(scoreRaw, 10) || 0 : 0,
				subtaskGroup: typeof subtaskRaw === "string" ? parseInt(subtaskRaw, 10) || 0 : 0,
			});
			return Response.json(created, { status: 201 });
		},
	},
	{
		type: "custom",
		method: "POST",
		path: "workshop/problems/:id/testcases/bulk",
		description:
			"Bulk-upload manual testcases from a ZIP (FormData: userId, zipFile, defaultScore?, defaultSubtaskGroup?)",
		handler: async (request, pathParams) => {
			const problemId = parseInt(pathParams.id, 10);
			const formData = await request.formData();
			const userIdRaw = formData.get("userId");
			if (typeof userIdRaw !== "string") {
				return Response.json({ error: "userId is required" }, { status: 400 });
			}
			const userId = parseInt(userIdRaw, 10);
			if (!Number.isFinite(userId)) {
				return Response.json({ error: "userId must be an integer" }, { status: 400 });
			}
			const zipFile = formData.get("zipFile");
			if (!(zipFile instanceof File) || zipFile.size === 0) {
				return Response.json({ error: "zipFile is required" }, { status: 400 });
			}
			const zipBuffer = Buffer.from(await zipFile.arrayBuffer());
			const pairs = await workshopTestcasesSvc.parseTestcaseZip(zipBuffer);

			const draft = await getActiveDraftForUser(problemId, userId, true);
			const defScoreRaw = formData.get("defaultScore");
			const defSubRaw = formData.get("defaultSubtaskGroup");
			const created = await workshopTestcasesSvc.bulkCreateManualTestcases({
				problemId,
				userId,
				draftId: draft.id,
				pairs,
				defaultScore: typeof defScoreRaw === "string" ? parseInt(defScoreRaw, 10) || 0 : 0,
				defaultSubtaskGroup: typeof defSubRaw === "string" ? parseInt(defSubRaw, 10) || 0 : 0,
			});
			return Response.json({ count: created.length, testcases: created }, { status: 201 });
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/testcases/:testcaseId/content",
		description: "Read truncated input/output content for a testcase (preview)",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			return workshopTestcasesSvc.readTestcaseContent({
				draftId: draft.id,
				testcaseId: parseInt(pathParams.testcaseId, 10),
			});
		},
	},
	{
		type: "custom",
		method: "PUT",
		path: "workshop/problems/:id/testcases/:testcaseId",
		description:
			"Update a manual testcase (FormData: userId, inputFile?, outputFile?, clearOutput?, score?, subtaskGroup?)",
		handler: async (request, pathParams) => {
			const problemId = parseInt(pathParams.id, 10);
			const testcaseId = parseInt(pathParams.testcaseId, 10);
			const formData = await request.formData();
			const userIdRaw = formData.get("userId");
			if (typeof userIdRaw !== "string") {
				return Response.json({ error: "userId is required" }, { status: 400 });
			}
			const userId = parseInt(userIdRaw, 10);
			if (!Number.isFinite(userId)) {
				return Response.json({ error: "userId must be an integer" }, { status: 400 });
			}
			const draft = await getActiveDraftForUser(problemId, userId, true);

			const inputFile = formData.get("inputFile");
			const outputFile = formData.get("outputFile");
			const clearOutput = formData.get("clearOutput") === "true";
			const newInput =
				inputFile instanceof File && inputFile.size > 0
					? Buffer.from(await inputFile.arrayBuffer())
					: undefined;
			let newOutput: Buffer | null | undefined;
			if (clearOutput) newOutput = null;
			else if (outputFile instanceof File && outputFile.size > 0)
				newOutput = Buffer.from(await outputFile.arrayBuffer());
			else newOutput = undefined;

			const scoreRaw = formData.get("score");
			const subtaskRaw = formData.get("subtaskGroup");
			const updated = await workshopTestcasesSvc.updateTestcase({
				problemId,
				userId,
				draftId: draft.id,
				testcaseId,
				score: typeof scoreRaw === "string" ? parseInt(scoreRaw, 10) || 0 : undefined,
				subtaskGroup: typeof subtaskRaw === "string" ? parseInt(subtaskRaw, 10) || 0 : undefined,
				newInput,
				newOutput,
			});
			return Response.json(updated);
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/testcases/:testcaseId",
		description: "Delete a manual testcase (re-indexes remaining)",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			await workshopTestcasesSvc.deleteTestcase({
				problemId,
				userId: q.userId,
				draftId: draft.id,
				testcaseId: parseInt(pathParams.testcaseId, 10),
			});
			return { ok: true };
		},
	},

	// ---------- Solutions (specific paths first) ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/solutions",
		description: "List solutions for a user's draft",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			const solutions = await workshopSolutionsSvc.listSolutionsForDraft(draft.id);
			return { draftId: draft.id, solutions };
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/solutions",
		description: "Create a solution",
		body: z.object({
			userId: z.number().int(),
			name: z.string().min(1).max(64),
			language: z.enum([
				"c",
				"cpp",
				"python",
				"java",
				"rust",
				"go",
				"javascript",
				"csharp",
				"text",
			]),
			source: z.string(),
			expectedVerdict: z.enum([
				"accepted",
				"wrong_answer",
				"time_limit",
				"memory_limit",
				"runtime_error",
				"presentation_error",
				"tl_or_ml",
			]),
			isMain: z.boolean().default(false),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as Parameters<typeof workshopSolutionsSvc.createSolution>[0] & {
				userId: number;
			};
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopSolutionsSvc.createSolution({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				name: b.name,
				language: b.language,
				source: b.source,
				expectedVerdict: b.expectedVerdict,
				isMain: b.isMain,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/solutions/:solutionId/source",
		description: "Read a solution's source",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			return workshopSolutionsSvc.readSolutionSource(parseInt(pathParams.solutionId, 10), draft.id);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/solutions/:solutionId/main",
		description: "Set this solution as main (atomically unsets others in the draft)",
		body: z.object({ userId: z.number().int() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			await workshopSolutionsSvc.setMainSolution(draft.id, parseInt(pathParams.solutionId, 10));
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/solutions/:solutionId",
		description: "Update solution metadata and/or source",
		body: z.object({
			userId: z.number().int(),
			name: z.string().min(1).max(64).optional(),
			language: z
				.enum(["c", "cpp", "python", "java", "rust", "go", "javascript", "csharp", "text"])
				.optional(),
			source: z.string().optional(),
			expectedVerdict: z
				.enum([
					"accepted",
					"wrong_answer",
					"time_limit",
					"memory_limit",
					"runtime_error",
					"presentation_error",
					"tl_or_ml",
				])
				.optional(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as Parameters<typeof workshopSolutionsSvc.updateSolution>[0] & {
				userId: number;
			};
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopSolutionsSvc.updateSolution({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				solutionId: parseInt(pathParams.solutionId, 10),
				name: b.name,
				language: b.language,
				source: b.source,
				expectedVerdict: b.expectedVerdict,
			});
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/solutions/:solutionId",
		description: "Delete a solution",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			await workshopSolutionsSvc.deleteSolution(draft.id, parseInt(pathParams.solutionId, 10));
			return { ok: true };
		},
	},

	// ---------- Generators (specific paths first) ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/generators",
		description: "List generators for a user's draft",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			const generators = await workshopGeneratorsSvc.listGeneratorsForDraft(draft.id);
			return { draftId: draft.id, generators };
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/generators",
		description: "Create a generator (source provided as plain text)",
		body: z.object({
			userId: z.number().int(),
			name: z.string().min(1).max(64),
			language: z.enum(["c", "cpp", "python", "java", "rust", "go", "javascript", "csharp"]),
			source: z.string().min(1),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as {
				userId: number;
				name: string;
				language: workshopGeneratorsSvc.GeneratorLanguage;
				source: string;
			};
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopGeneratorsSvc.createGenerator({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				name: b.name,
				language: b.language,
				source: Buffer.from(b.source, "utf-8"),
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/generators/:generatorId/source",
		description: "Read a generator's source",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			return workshopGeneratorsSvc.readGeneratorSource(
				draft.id,
				parseInt(pathParams.generatorId, 10)
			);
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/generators/:generatorId",
		description: "Replace a generator's source (language unchanged)",
		body: z.object({
			userId: z.number().int(),
			source: z.string().min(1),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; source: string };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopGeneratorsSvc.updateGeneratorSource({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				generatorId: parseInt(pathParams.generatorId, 10),
				source: Buffer.from(b.source, "utf-8"),
			});
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/generators/:generatorId",
		description: "Delete a generator",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			await workshopGeneratorsSvc.deleteGenerator({
				problemId,
				userId: q.userId,
				draftId: draft.id,
				generatorId: parseInt(pathParams.generatorId, 10),
			});
			return { ok: true };
		},
	},

	// ---------- Validator (specific paths first) ----------
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/validator/run",
		description: "Run full validation on every testcase",
		body: z.object({ userId: z.number().int() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			await ensureValidateSubscriberStarted();
			const queued = await workshopValidatorSvc.runFullValidation({
				problemId,
				userId: b.userId,
				draftId: draft.id,
			});
			return { draftId: draft.id, jobs: queued };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/validator",
		description: "Get the current validator source (or null if unset)",
		handler: async ({ pathParams }) =>
			workshopValidatorSvc.getValidatorSource(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/validator",
		description: "Save validator source",
		body: z.object({
			userId: z.number().int(),
			language: z.enum(["cpp", "python"]),
			source: z.string().min(1),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as {
				userId: number;
				language: workshopValidatorSvc.ValidatorLanguage;
				source: string;
			};
			return workshopValidatorSvc.saveValidatorSource({
				problemId: parseInt(pathParams.id, 10),
				userId: b.userId,
				language: b.language,
				source: b.source,
			});
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/validator",
		description: "Delete the validator",
		handler: async ({ pathParams }) =>
			workshopValidatorSvc.deleteValidator(parseInt(pathParams.id, 10)),
	},

	// ---------- Checker ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/checker",
		description: "Get the current checker source",
		handler: async ({ pathParams }) =>
			workshopCheckerSvc.getCheckerSource(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/checker",
		description: "Save checker source",
		body: z.object({
			userId: z.number().int(),
			language: z.enum(["cpp", "python"]),
			source: z.string().min(1),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as {
				userId: number;
				language: workshopCheckerSvc.CheckerLanguage;
				source: string;
			};
			return workshopCheckerSvc.saveCheckerSource({
				problemId: parseInt(pathParams.id, 10),
				userId: b.userId,
				language: b.language,
				source: b.source,
			});
		},
	},

	// ---------- Resources (specific paths first) ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/resources",
		description: "List resources for a user's draft",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			const resources = await workshopResourcesSvc.listResourcesForDraft(draft.id);
			return { draftId: draft.id, resources };
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/resources",
		description: "Upload a text resource (overwrites if name exists)",
		body: z.object({
			userId: z.number().int(),
			name: z.string().min(1).max(128),
			content: z.string(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; name: string; content: string };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopResourcesSvc.uploadResource({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				name: b.name,
				content: Buffer.from(b.content, "utf-8"),
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/resources/:resourceId/content",
		description: "Read a resource's text content",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			const { name, content } = await workshopResourcesSvc.readResourceContent(
				draft.id,
				parseInt(pathParams.resourceId, 10)
			);
			return { name, content: content.toString("utf-8") };
		},
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/resources/:resourceId/rename",
		description: "Rename a resource",
		body: z.object({
			userId: z.number().int(),
			newName: z.string().min(1).max(128),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; newName: string };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopResourcesSvc.renameResource({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				resourceId: parseInt(pathParams.resourceId, 10),
				newName: b.newName,
			});
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/resources/:resourceId",
		description: "Delete a resource",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, q.userId, true);
			await workshopResourcesSvc.deleteResource(draft.id, parseInt(pathParams.resourceId, 10));
			return { ok: true };
		},
	},

	// ---------- Manual Inbox (specific paths first) ----------
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/manual-inbox/rename",
		description: "Rename an inbox file",
		body: z.object({
			userId: z.number().int(),
			oldName: z.string().min(1),
			newName: z.string().min(1),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; oldName: string; newName: string };
			await workshopInboxSvc.renameInboxFile({
				problemId: parseInt(pathParams.id, 10),
				userId: b.userId,
				oldName: b.oldName,
				newName: b.newName,
			});
			return { ok: true };
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/manual-inbox",
		description: "List inbox files for a user",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			const files = await workshopInboxSvc.listInbox(parseInt(pathParams.id, 10), q.userId);
			return { files };
		},
	},
	{
		type: "custom",
		method: "POST",
		path: "workshop/problems/:id/manual-inbox",
		description: "Upload an inbox file (FormData: userId, file, name?)",
		handler: async (request, pathParams) => {
			const problemId = parseInt(pathParams.id, 10);
			const formData = await request.formData();
			const userIdRaw = formData.get("userId");
			if (typeof userIdRaw !== "string") {
				return Response.json({ error: "userId is required" }, { status: 400 });
			}
			const userId = parseInt(userIdRaw, 10);
			if (!Number.isFinite(userId)) {
				return Response.json({ error: "userId must be an integer" }, { status: 400 });
			}
			const file = formData.get("file");
			if (!(file instanceof File) || file.size === 0) {
				return Response.json({ error: "file is required" }, { status: 400 });
			}
			const nameRaw = formData.get("name");
			const filename = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : file.name;
			const created = await workshopInboxSvc.uploadInboxFile({
				problemId,
				userId,
				filename,
				content: Buffer.from(await file.arrayBuffer()),
			});
			return Response.json(created, { status: 201 });
		},
	},
	{
		type: "json",
		method: "DELETE",
		path: "workshop/problems/:id/manual-inbox",
		description: "Delete an inbox file (filename in query)",
		query: z.object({ userId: z.coerce.number().int(), filename: z.string().min(1) }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number; filename: string };
			await workshopInboxSvc.deleteInboxFile({
				problemId: parseInt(pathParams.id, 10),
				userId: q.userId,
				filename: q.filename,
			});
			return { ok: true };
		},
	},

	// ---------- Snapshots (specific paths first) ----------
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/snapshots/:snapshotId/rollback",
		description: "Roll the user's draft back to a snapshot (auto-snapshots first)",
		body: z.object({ userId: z.number().int() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number };
			return workshopSnapshotsSvc.rollbackToSnapshot({
				problemId: parseInt(pathParams.id, 10),
				userId: b.userId,
				snapshotId: parseInt(pathParams.snapshotId, 10),
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/snapshots/:snapshotId",
		description: "Get one snapshot",
		handler: async ({ pathParams }) => {
			const snapshot = await workshopSnapshotsSvc.getSnapshot(
				parseInt(pathParams.id, 10),
				parseInt(pathParams.snapshotId, 10)
			);
			if (!snapshot) throw new NotFoundError("Snapshot not found");
			return snapshot;
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/snapshots",
		description: "List snapshots (newest first)",
		handler: async ({ pathParams }) =>
			workshopSnapshotsSvc.listSnapshots(parseInt(pathParams.id, 10)),
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/snapshots",
		description: "Create a snapshot of the user's current draft",
		body: z.object({
			userId: z.number().int(),
			label: z.string().min(1),
			message: z.string().nullable().optional(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; label: string; message?: string | null };
			const problemId = parseInt(pathParams.id, 10);
			await getActiveDraftForUser(problemId, b.userId, true);
			return workshopSnapshotsSvc.createSnapshot({
				problemId,
				userId: b.userId,
				label: b.label,
				message: b.message ?? null,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/draft-status",
		description: "Detect if the user's draft is stale relative to the latest snapshot",
		query: z.object({ userId: z.coerce.number().int() }),
		handler: async ({ pathParams, query }) => {
			const q = query as { userId: number };
			return workshopSnapshotsSvc.detectStaleDraft({
				problemId: parseInt(pathParams.id, 10),
				userId: q.userId,
			});
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/update-to-latest",
		description: "Update the user's draft to the latest snapshot (auto-snapshots first)",
		body: z.object({ userId: z.number().int() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number };
			return workshopSnapshotsSvc.updateDraftToLatest({
				problemId: parseInt(pathParams.id, 10),
				userId: b.userId,
			});
		},
	},

	// ---------- Invocations ----------
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/invocations",
		description: "List recent invocations",
		query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }),
		handler: async ({ pathParams, query }) => {
			const q = query as { limit: number };
			return workshopInvocationsSvc.listInvocations(parseInt(pathParams.id, 10), q.limit);
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/invocations",
		description: "Run a new invocation (NxM matrix of solutions x testcases)",
		body: z.object({
			userId: z.number().int(),
			selectedSolutionIds: z.array(z.number().int()).min(1),
			selectedTestcaseIds: z.array(z.number().int()).min(1),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as {
				userId: number;
				selectedSolutionIds: number[];
				selectedTestcaseIds: number[];
			};
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopInvocationsSvc.createInvocation({
				problemId,
				userId: b.userId,
				draftId: draft.id,
				selectedSolutionIds: b.selectedSolutionIds,
				selectedTestcaseIds: b.selectedTestcaseIds,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/invocations/:invocationId",
		description: "Get invocation detail",
		handler: async ({ pathParams }) => {
			const row = await workshopInvocationsSvc.getInvocation(parseInt(pathParams.invocationId, 10));
			if (!row || row.workshopProblemId !== parseInt(pathParams.id, 10)) {
				throw new NotFoundError("Invocation not found");
			}
			return row;
		},
	},
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/generate-answers",
		description: "Run isMain solution against all testcases to fill in outputs",
		body: z.object({ userId: z.number().int() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number };
			const problemId = parseInt(pathParams.id, 10);
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			return workshopInvocationsSvc.generateAnswers({
				problemId,
				userId: b.userId,
				draftId: draft.id,
			});
		},
	},

	// ---------- Generator Script ----------
	{
		type: "json",
		method: "POST",
		path: "workshop/problems/:id/script/run",
		description: "Save and run the generator script (wipes existing generated testcases)",
		body: z.object({
			userId: z.number().int(),
			script: z.string(),
		}),
		handler: async ({ pathParams, body }) => {
			const b = body as { userId: number; script: string };
			const problemId = parseInt(pathParams.id, 10);
			const problem = await workshopProblemsSvc.getWorkshopProblemForUser(
				problemId,
				b.userId,
				true
			);
			if (!problem) throw new NotFoundError("Workshop problem not found");
			const draft = await getActiveDraftForUser(problemId, b.userId, true);
			await workshopScriptSvc.saveScript(problemId, b.script);
			return workshopScriptSvc.runScript({
				problem,
				userId: b.userId,
				draftId: draft.id,
				script: b.script,
			});
		},
	},
	{
		type: "json",
		method: "GET",
		path: "workshop/problems/:id/script",
		description: "Get the saved generator script",
		handler: async ({ pathParams }) => ({
			script: await workshopScriptSvc.getScript(parseInt(pathParams.id, 10)),
		}),
	},
	{
		type: "json",
		method: "PUT",
		path: "workshop/problems/:id/script",
		description: "Save the generator script (no run)",
		body: z.object({ script: z.string() }),
		handler: async ({ pathParams, body }) => {
			const b = body as { script: string };
			await workshopScriptSvc.saveScript(parseInt(pathParams.id, 10), b.script);
			return { ok: true };
		},
	},

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
