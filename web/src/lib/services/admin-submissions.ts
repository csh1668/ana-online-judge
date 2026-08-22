import { and, asc, count, desc, eq, gte, inArray, isNull, lt, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
	contestProblems,
	contests,
	type Language,
	languageEnum,
	problems,
	rejudgeBatches,
	rejudgeBatchItems,
	type SubmissionVisibility,
	submissionResults,
	submissions,
	submissionVisibilityEnum,
	testcases as testcasesTbl,
	users,
	type Verdict,
	verdictEnum,
} from "@/db/schema";
import { SYSTEM_JOB_PRIORITY } from "@/lib/judge-priority";
import { pushStandardJudgeJob } from "@/lib/judge-queue";
import { createNotificationsBulk } from "@/lib/services/notifications";

export type AdminSubmissionContestFilter = number | "any" | "none";
export type AdminSubmissionVisibilityFilter = SubmissionVisibility | "all";

export type AdminSubmissionFilter = {
	userIds?: number[];
	problemId?: number;
	contestId?: AdminSubmissionContestFilter;
	verdicts?: Verdict[];
	languages?: Language[];
	dateFrom?: Date;
	dateTo?: Date;
	visibility?: AdminSubmissionVisibilityFilter;
	// 특정 재채점 배치의 멤버십으로 필터(before/after 단계의 verdict 기준).
	rejudgeBatchId?: number;
	rejudgePhase?: "before" | "after";
	rejudgeVerdict?: Verdict;
};

export type AdminSubmissionsSort = "id" | "createdAt" | "executionTime" | "memoryUsed";

export function buildSubmissionFilterWhere(filter: AdminSubmissionFilter): SQL | undefined {
	const conds: SQL[] = [];
	if (filter.userIds && filter.userIds.length > 0) {
		conds.push(inArray(submissions.userId, filter.userIds));
	}
	if (filter.problemId) {
		conds.push(eq(submissions.problemId, filter.problemId));
	}
	if (filter.contestId === "none") {
		conds.push(isNull(submissions.contestId));
	} else if (filter.contestId === "any" || filter.contestId === undefined) {
		// no-op
	} else {
		conds.push(eq(submissions.contestId, filter.contestId));
	}
	if (filter.verdicts && filter.verdicts.length > 0) {
		conds.push(inArray(submissions.verdict, filter.verdicts));
	}
	if (filter.languages && filter.languages.length > 0) {
		conds.push(inArray(submissions.language, filter.languages));
	}
	if (filter.dateFrom) {
		conds.push(gte(submissions.createdAt, filter.dateFrom));
	}
	if (filter.dateTo) {
		// dateTo is treated as exclusive (caller passes a value already shifted to end-of-day or next-day)
		conds.push(lt(submissions.createdAt, filter.dateTo));
	}
	if (filter.visibility && filter.visibility !== "all") {
		conds.push(eq(submissions.visibility, filter.visibility));
	}
	if (filter.rejudgeBatchId !== undefined && filter.rejudgeVerdict !== undefined) {
		const col =
			filter.rejudgePhase === "before"
				? rejudgeBatchItems.beforeVerdict
				: rejudgeBatchItems.afterVerdict;
		const sub = db
			.select({ submissionId: rejudgeBatchItems.submissionId })
			.from(rejudgeBatchItems)
			.where(
				and(eq(rejudgeBatchItems.batchId, filter.rejudgeBatchId), eq(col, filter.rejudgeVerdict))
			);
		conds.push(inArray(submissions.id, sub));
	}
	return conds.length > 0 ? and(...conds) : undefined;
}

export async function listAdminSubmissions(
	filter: AdminSubmissionFilter,
	pagination: { page: number; limit: number },
	sort: { key: AdminSubmissionsSort; order: "asc" | "desc" }
) {
	const offset = (pagination.page - 1) * pagination.limit;
	const where = buildSubmissionFilterWhere(filter);

	let orderBy: SQL;
	switch (sort.key) {
		case "id":
			orderBy = sort.order === "asc" ? asc(submissions.id) : desc(submissions.id);
			break;
		case "executionTime":
			orderBy =
				sort.order === "asc" ? asc(submissions.executionTime) : desc(submissions.executionTime);
			break;
		case "memoryUsed":
			orderBy = sort.order === "asc" ? asc(submissions.memoryUsed) : desc(submissions.memoryUsed);
			break;
		default:
			orderBy = sort.order === "asc" ? asc(submissions.createdAt) : desc(submissions.createdAt);
			break;
	}

	const [list, totalRow] = await Promise.all([
		db
			.select({
				id: submissions.id,
				userId: submissions.userId,
				userUsername: users.username,
				userName: users.name,
				problemId: submissions.problemId,
				problemTitle: problems.displayTitle,
				problemType: problems.problemType,
				verdict: submissions.verdict,
				language: submissions.language,
				executionTime: submissions.executionTime,
				memoryUsed: submissions.memoryUsed,
				score: submissions.score,
				visibility: submissions.visibility,
				contestId: submissions.contestId,
				contestTitle: contests.title,
				contestProblemLabel: contestProblems.label,
				createdAt: submissions.createdAt,
			})
			.from(submissions)
			.innerJoin(users, eq(users.id, submissions.userId))
			.innerJoin(problems, eq(problems.id, submissions.problemId))
			.leftJoin(contests, eq(contests.id, submissions.contestId))
			.leftJoin(
				contestProblems,
				and(
					eq(contestProblems.contestId, submissions.contestId),
					eq(contestProblems.problemId, submissions.problemId)
				)
			)
			.where(where)
			.orderBy(orderBy)
			.limit(pagination.limit)
			.offset(offset),
		db.select({ count: count() }).from(submissions).where(where),
	]);

	return { submissions: list, total: totalRow[0].count };
}

export type AdminSubmissionRow = Awaited<
	ReturnType<typeof listAdminSubmissions>
>["submissions"][number];

// Helper: parse URL searchParams → AdminSubmissionFilter
export function parseAdminSubmissionFilter(params: {
	userIds?: string;
	problemId?: string;
	contestId?: string;
	verdicts?: string;
	languages?: string;
	dateFrom?: string;
	dateTo?: string;
	visibility?: string;
	rejudgeBatch?: string;
	phase?: string;
	verdict?: string;
}): AdminSubmissionFilter {
	const userIds = params.userIds
		? params.userIds
				.split(",")
				.map((s) => Number.parseInt(s, 10))
				.filter((n) => Number.isFinite(n))
		: undefined;
	const problemId = params.problemId ? Number.parseInt(params.problemId, 10) : undefined;
	let contestId: AdminSubmissionContestFilter | undefined;
	if (params.contestId === "none") contestId = "none";
	else if (params.contestId === "any") contestId = "any";
	else if (params.contestId) {
		const n = Number.parseInt(params.contestId, 10);
		if (Number.isFinite(n)) contestId = n;
	}
	const verdictSet = new Set<string>(verdictEnum.enumValues);
	const verdicts = params.verdicts
		? (params.verdicts.split(",").filter((v) => verdictSet.has(v)) as Verdict[])
		: undefined;
	const langSet = new Set<string>(languageEnum.enumValues);
	const languages = params.languages
		? (params.languages.split(",").filter((l) => langSet.has(l)) as Language[])
		: undefined;
	const dateFrom = params.dateFrom ? new Date(params.dateFrom) : undefined;
	let dateTo: Date | undefined;
	if (params.dateTo) {
		// shift by 1 day to make exclusive end-of-day
		const d = new Date(params.dateTo);
		d.setDate(d.getDate() + 1);
		dateTo = d;
	}
	const visSet = new Set<string>(submissionVisibilityEnum.enumValues);
	let visibility: AdminSubmissionVisibilityFilter | undefined;
	if (params.visibility === "all") visibility = "all";
	else if (params.visibility && visSet.has(params.visibility))
		visibility = params.visibility as SubmissionVisibility;

	// 재채점 배치 멤버십 필터. rejudgeBatch가 있으면 verdict(단수)는 배치 단계의 결과로 해석한다.
	let rejudgeBatchId: number | undefined;
	if (params.rejudgeBatch) {
		const n = Number.parseInt(params.rejudgeBatch, 10);
		if (Number.isFinite(n)) rejudgeBatchId = n;
	}
	const rejudgePhase =
		params.phase === "before" || params.phase === "after" ? params.phase : undefined;
	const rejudgeVerdict =
		params.verdict && verdictSet.has(params.verdict) ? (params.verdict as Verdict) : undefined;

	return {
		userIds: userIds && userIds.length > 0 ? userIds : undefined,
		problemId: problemId && Number.isFinite(problemId) ? problemId : undefined,
		contestId,
		verdicts: verdicts && verdicts.length > 0 ? verdicts : undefined,
		languages: languages && languages.length > 0 ? languages : undefined,
		dateFrom,
		dateTo,
		visibility,
		rejudgeBatchId,
		rejudgePhase,
		rejudgeVerdict,
	};
}

const REJUDGE_BATCH_CAP = 50_000;
const DELETE_BATCH_CAP = 50_000;

export type DeleteResult = {
	deleted: number;
	skipped: number;
};

export async function deleteSubmissionsByIds(ids: number[]): Promise<DeleteResult> {
	const uniqueIds = Array.from(new Set(ids));
	if (uniqueIds.length === 0) return { deleted: 0, skipped: 0 };
	if (uniqueIds.length > DELETE_BATCH_CAP) {
		throw new Error(
			`삭제 대상이 너무 많습니다(${uniqueIds.length} > ${DELETE_BATCH_CAP}). 필터를 좁혀주세요.`
		);
	}

	const rows = await db
		.select({ id: submissions.id })
		.from(submissions)
		.where(inArray(submissions.id, uniqueIds));
	const existingIds = rows.map((row) => row.id);

	if (existingIds.length > 0) {
		await db.delete(submissions).where(inArray(submissions.id, existingIds));
	}

	return { deleted: existingIds.length, skipped: uniqueIds.length - existingIds.length };
}

export async function deleteSubmissionsByFilter(
	filter: AdminSubmissionFilter
): Promise<DeleteResult> {
	const where = buildSubmissionFilterWhere(filter);
	const rows = await db
		.select({ id: submissions.id })
		.from(submissions)
		.where(where)
		.limit(DELETE_BATCH_CAP + 1);
	if (rows.length > DELETE_BATCH_CAP) {
		throw new Error(`삭제 대상이 너무 많습니다(>${DELETE_BATCH_CAP}). 필터를 좁혀주세요.`);
	}
	const ids = rows.map((row) => row.id);
	if (ids.length === 0) return { deleted: 0, skipped: 0 };
	await db.delete(submissions).where(inArray(submissions.id, ids));
	return { deleted: ids.length, skipped: 0 };
}

export type RejudgeSkipReason = "anigma" | "in_progress" | "orphan" | "unsupported_type";
export type RejudgeResult = {
	enqueued: number;
	skipped: { id: number; reason: RejudgeSkipReason }[];
};

export async function rejudgeSubmissionsByIds(
	ids: number[],
	opts: { reason: string; adminId: number }
): Promise<RejudgeResult> {
	if (ids.length === 0) return { enqueued: 0, skipped: [] };
	if (ids.length > REJUDGE_BATCH_CAP) {
		throw new Error(
			`재채점 대상이 너무 많습니다(${ids.length} > ${REJUDGE_BATCH_CAP}). 필터를 좁혀주세요.`
		);
	}

	const subs = await db
		.select({
			id: submissions.id,
			userId: submissions.userId,
			problemId: submissions.problemId,
			problemTitle: problems.displayTitle,
			code: submissions.code,
			language: submissions.language,
			verdict: submissions.verdict,
			problemType: problems.problemType,
			timeLimit: problems.timeLimit,
			memoryLimit: problems.memoryLimit,
			maxScore: problems.maxScore,
			hasSubtasks: problems.hasSubtasks,
			useFullJudge: problems.useFullJudge,
			passThreshold: problems.passThreshold,
			checkerPath: problems.checkerPath,
		})
		.from(submissions)
		.innerJoin(problems, eq(problems.id, submissions.problemId))
		.where(inArray(submissions.id, ids));

	const skipped: RejudgeResult["skipped"] = [];
	const targets: typeof subs = [];
	const seenIds = new Set<number>();
	for (const s of subs) {
		seenIds.add(s.id);
		if (s.problemType === "anigma") {
			skipped.push({ id: s.id, reason: "anigma" });
			continue;
		}
		if (s.verdict === "pending" || s.verdict === "judging") {
			skipped.push({ id: s.id, reason: "in_progress" });
			continue;
		}
		targets.push(s);
	}
	for (const id of ids) {
		if (!seenIds.has(id)) skipped.push({ id, reason: "orphan" });
	}

	if (targets.length === 0) return { enqueued: 0, skipped };

	// 재채점 배치 생성(사유·관리자 기록)
	const [batch] = await db
		.insert(rejudgeBatches)
		.values({ adminId: opts.adminId, reason: opts.reason })
		.returning({ id: rejudgeBatches.id });

	const distinctProblemIds = Array.from(new Set(targets.map((t) => t.problemId)));
	const tcs = await db
		.select({
			problemId: testcasesTbl.problemId,
			id: testcasesTbl.id,
			inputPath: testcasesTbl.inputPath,
			outputPath: testcasesTbl.outputPath,
			subtaskGroup: testcasesTbl.subtaskGroup,
			score: testcasesTbl.score,
		})
		.from(testcasesTbl)
		.where(inArray(testcasesTbl.problemId, distinctProblemIds));
	const tcByProblem = new Map<number, typeof tcs>();
	for (const tc of tcs) {
		const arr = tcByProblem.get(tc.problemId) ?? [];
		arr.push(tc);
		tcByProblem.set(tc.problemId, arr);
	}

	let enqueued = 0;
	for (const t of targets) {
		// 배치 아이템: 리셋 전 verdict 스냅샷(afterVerdict는 default "pending")
		await db.insert(rejudgeBatchItems).values({
			batchId: batch.id,
			submissionId: t.id,
			problemId: t.problemId,
			beforeVerdict: t.verdict,
		});

		await db.delete(submissionResults).where(eq(submissionResults.submissionId, t.id));
		await db
			.update(submissions)
			.set({
				verdict: "pending",
				executionTime: null,
				memoryUsed: null,
				score: null,
				errorMessage: null,
			})
			.where(eq(submissions.id, t.id));

		const problemTcs = tcByProblem.get(t.problemId) ?? [];
		await pushStandardJudgeJob(
			{
				submissionId: t.id,
				problemId: t.problemId,
				code: t.code,
				language: t.language,
				timeLimit: t.timeLimit,
				memoryLimit: t.memoryLimit,
				maxScore: t.maxScore,
				hasSubtasks: t.hasSubtasks,
				useFullJudge: t.useFullJudge,
				passThreshold: t.passThreshold,
				testcases: problemTcs.map((tc) => ({
					id: tc.id,
					inputPath: tc.inputPath,
					outputPath: tc.outputPath,
					subtaskGroup: tc.subtaskGroup ?? 0,
					score: tc.score ?? 0,
				})),
				problemType: t.problemType,
				checkerPath: t.checkerPath,
			},
			SYSTEM_JOB_PRIORITY
		);
		enqueued++;
	}

	// 사용자·문제별 알림 1건. targets(실제 enqueue된 것)만 대상.
	const byUserProblem = new Map<
		string,
		{ userId: number; problemId: number; problemTitle: string; subIds: number[] }
	>();
	for (const t of targets) {
		const key = `${t.userId}:${t.problemId}`;
		const entry = byUserProblem.get(key) ?? {
			userId: t.userId,
			problemId: t.problemId,
			problemTitle: t.problemTitle,
			subIds: [],
		};
		entry.subIds.push(t.id);
		byUserProblem.set(key, entry);
	}
	const notifRows = [...byUserProblem.values()].map(
		({ userId, problemId, problemTitle, subIds }) => {
			const problemLink = `[${problemTitle}](/problems/${problemId})`;
			const subRef =
				subIds.length === 1
					? `[제출 #${subIds[0]}](/submissions/${subIds[0]})`
					: `[제출 ${subIds.length}건](/submissions?me=true)`;
			const body = `${problemLink} 문제가 재채점되었습니다. (${subRef}, 사유: ${opts.reason})`;
			return { userId, type: "rejudge" as const, body };
		}
	);
	await createNotificationsBulk(notifRows);

	return { enqueued, skipped };
}

/**
 * 세션 컨텍스트가 없는 경로(API 키 기반 CLI 재채점)에서 배치 작성자로 쓸 관리자 id를
 * 결정한다. API 키는 특정 사용자에 묶이지 않으므로 가장 먼저 생성된 관리자에게 귀속한다.
 * 부트스트랩상 관리자는 최소 1명 존재하지만, 만약 없으면 throw 한다.
 */
export async function resolveSystemAdminId(): Promise<number> {
	const [admin] = await db
		.select({ id: users.id })
		.from(users)
		.where(eq(users.role, "admin"))
		.orderBy(asc(users.id))
		.limit(1);
	if (!admin) throw new Error("재채점을 귀속할 관리자 계정이 없습니다.");
	return admin.id;
}

export async function rejudgeSubmissionsByFilter(
	filter: AdminSubmissionFilter,
	opts: { reason: string; adminId: number }
): Promise<RejudgeResult> {
	const where = buildSubmissionFilterWhere(filter);
	const rows = await db
		.select({ id: submissions.id })
		.from(submissions)
		.where(where)
		.limit(REJUDGE_BATCH_CAP + 1);
	if (rows.length > REJUDGE_BATCH_CAP) {
		throw new Error(`재채점 대상이 너무 많습니다(>${REJUDGE_BATCH_CAP}). 필터를 좁혀주세요.`);
	}
	return rejudgeSubmissionsByIds(
		rows.map((r) => r.id),
		opts
	);
}

export async function countSubmissionsByFilter(filter: AdminSubmissionFilter): Promise<number> {
	const where = buildSubmissionFilterWhere(filter);
	const [row] = await db.select({ count: count() }).from(submissions).where(where);
	return row.count;
}

/**
 * 채점 결과 회신 시 호출. 해당 제출의 "열린"(afterVerdict가 아직 pending/judging인)
 * rejudgeBatchItem 1건을 최종 verdict로 갱신한다. 재채점이 아닌 일반 제출이면 no-op.
 * 진행 중 제출 스킵 불변식 덕에 열린 아이템은 최대 1개.
 */
export async function updateRejudgeBatchItemResult(
	submissionId: number,
	verdict: Verdict
): Promise<void> {
	const [open] = await db
		.select({ id: rejudgeBatchItems.id })
		.from(rejudgeBatchItems)
		.where(
			and(
				eq(rejudgeBatchItems.submissionId, submissionId),
				inArray(rejudgeBatchItems.afterVerdict, ["pending", "judging"])
			)
		)
		.orderBy(asc(rejudgeBatchItems.id))
		.limit(1);
	if (!open) return;
	await db
		.update(rejudgeBatchItems)
		.set({ afterVerdict: verdict })
		.where(eq(rejudgeBatchItems.id, open.id));
}

export type RejudgeHistoryEntry = {
	batchId: number;
	reason: string;
	adminName: string | null;
	createdAt: Date;
	total: number;
	beforeCounts: Record<string, number>;
	afterCounts: Record<string, number>;
};

/**
 * 특정 문제에 대한 재채점 이력을 배치별로 반환한다(최신순). 각 배치마다 이 문제에
 * 해당하는 아이템들의 before/after verdict 분포를 집계한다.
 */
export async function getRejudgeHistoryForProblem(
	problemId: number
): Promise<RejudgeHistoryEntry[]> {
	const batches = await db
		.select({
			batchId: rejudgeBatches.id,
			reason: rejudgeBatches.reason,
			adminName: users.name,
			createdAt: rejudgeBatches.createdAt,
		})
		.from(rejudgeBatchItems)
		.innerJoin(rejudgeBatches, eq(rejudgeBatches.id, rejudgeBatchItems.batchId))
		.leftJoin(users, eq(users.id, rejudgeBatches.adminId))
		.where(eq(rejudgeBatchItems.problemId, problemId))
		.groupBy(rejudgeBatches.id, users.name)
		.orderBy(desc(rejudgeBatches.createdAt));

	const result: RejudgeHistoryEntry[] = [];
	for (const b of batches) {
		const items = await db
			.select({
				beforeVerdict: rejudgeBatchItems.beforeVerdict,
				afterVerdict: rejudgeBatchItems.afterVerdict,
			})
			.from(rejudgeBatchItems)
			.where(
				and(eq(rejudgeBatchItems.batchId, b.batchId), eq(rejudgeBatchItems.problemId, problemId))
			);
		const beforeCounts: Record<string, number> = {};
		const afterCounts: Record<string, number> = {};
		for (const it of items) {
			beforeCounts[it.beforeVerdict] = (beforeCounts[it.beforeVerdict] ?? 0) + 1;
			afterCounts[it.afterVerdict] = (afterCounts[it.afterVerdict] ?? 0) + 1;
		}
		result.push({ ...b, total: items.length, beforeCounts, afterCounts });
	}
	return result;
}
