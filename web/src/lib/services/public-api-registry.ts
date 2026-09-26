import "server-only";

import { z } from "zod";
import type { Endpoint } from "./api-types";
import { NotFoundError } from "./api-types";
import { getActiveLanguages } from "./languages";
import { getPublicProblem, listPublicProblems } from "./public/problems";
import { listPublicSubmissions } from "./public/submissions";
import { getPublicUserByUsername, listPublicUsers } from "./public/users";

const paginationQuery = z.object({
	page: z.coerce.number().int().min(1).default(1),
	limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const publicEndpoints: Endpoint[] = [
	// ========== Problems ==========
	{
		type: "json",
		method: "GET",
		path: "problems",
		description: "공개 문제 목록을 조회합니다.",
		query: paginationQuery.extend({
			search: z.string().optional(),
			sort: z.enum(["id", "tier", "createdAt", "random"]).default("id"),
			order: z.enum(["asc", "desc"]).default("asc"),
		}),
		handler: async ({ query }) =>
			listPublicProblems(query as Parameters<typeof listPublicProblems>[0]),
	},
	{
		type: "json",
		method: "GET",
		path: "problems/:id",
		description: "공개 문제 상세 정보를 조회합니다.",
		handler: async ({ pathParams }) => {
			const id = Number.parseInt(pathParams.id, 10);
			if (!Number.isFinite(id)) throw new NotFoundError("Invalid problem id");
			const p = await getPublicProblem(id);
			if (!p) throw new NotFoundError("Problem not found");
			return p;
		},
	},

	// ========== Users ==========
	{
		type: "json",
		method: "GET",
		path: "users",
		description: "사용자 목록을 조회합니다.",
		query: paginationQuery.extend({
			search: z.string().optional(),
			sort: z.enum(["rating", "recent"]).default("rating"),
			order: z.enum(["asc", "desc"]).default("desc"),
		}),
		handler: async ({ query }) => listPublicUsers(query as Parameters<typeof listPublicUsers>[0]),
	},
	{
		type: "json",
		method: "GET",
		path: "users/:username",
		description: "사용자 상세 정보를 조회합니다.",
		handler: async ({ pathParams }) => {
			const u = await getPublicUserByUsername(pathParams.username);
			if (!u) throw new NotFoundError("User not found");
			return u;
		},
	},

	// ========== Submissions ==========
	{
		type: "json",
		method: "GET",
		path: "submissions",
		description: "제출 목록을 조회합니다.",
		query: paginationQuery.extend({
			username: z.string().optional(),
			problemId: z.coerce.number().int().optional(),
			verdict: z.string().optional(),
			language: z.string().optional(),
			sort: z.enum(["id", "createdAt", "executionTime", "memoryUsed"]).default("createdAt"),
			order: z.enum(["asc", "desc"]).default("desc"),
		}),
		handler: async ({ query }) =>
			listPublicSubmissions(query as Parameters<typeof listPublicSubmissions>[0]),
	},

	// ========== Meta ==========
	{
		type: "json",
		method: "GET",
		path: "meta/languages",
		description: "지원 언어 목록과 컴파일/실행 명령 (클라이언트용 mirror)",
		handler: async () => {
			const rows = (await getActiveLanguages()).filter((r) => r.clientRunCommand);
			const split = (s: string) => {
				const [command, ...args] = s.trim().split(/\s+/);
				return { command, args };
			};
			return {
				languages: rows.map((r) => ({
					id: r.id,
					displayName: r.label,
					aliases: [...new Set([r.id, ...r.aliases])],
					version: r.version,
					fileExtensions: [r.fileExtension],
					defaultExtension: r.fileExtension,
					sourceFile: r.sourceFile,
					compile: r.clientCompileCommand ? split(r.clientCompileCommand) : undefined,
					run: split(r.clientRunCommand as string),
					timeMultiplier: Number(r.timeMultiplier),
					timeAddSec: r.timeBonusMs / 1000,
					memoryMultiplier: Number(r.memoryMultiplier),
					memoryAddMb: r.memoryBonusMb,
				})),
			};
		},
	},
	{
		type: "custom",
		method: "GET",
		path: "meta/endpoints",
		description: "지원하는 endpoint 목록을 반환합니다.",
		handler: async (_request, _pathParams) => {
			const { generateContracts } = await import("./api-contract");
			const contracts = generateContracts(publicEndpoints);
			return Response.json({ endpoints: contracts });
		},
	},
];
