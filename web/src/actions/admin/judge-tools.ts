"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { contestProblems, problems, testcases } from "@/db/schema";
import { recalculateContestBonus } from "@/lib/anigma-bonus";
import { requireAdmin } from "@/lib/auth-utils";
import { getRedisClient } from "@/lib/redis";
import { generateCheckerPath, generateValidatorPath, uploadFile } from "@/lib/storage";

// Checker upload
export async function uploadChecker(
	problemId: number,
	sourceCode: string,
	filename: string = "checker.cpp"
) {
	await requireAdmin();

	// Verify problem exists
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);

	if (!problem) {
		throw new Error("Problem not found");
	}

	// Upload checker source to MinIO
	const checkerPath = generateCheckerPath(problemId, filename);
	await uploadFile(checkerPath, sourceCode, "text/plain");

	// Update problem with checker path
	const [updatedProblem] = await db
		.update(problems)
		.set({
			checkerPath,
			updatedAt: new Date(),
		})
		.where(eq(problems.id, problemId))
		.returning();

	revalidatePath(`/admin/problems/${problemId}`);

	return {
		success: true,
		checkerPath,
		problem: updatedProblem,
	};
}

// Validator upload
export async function uploadValidator(
	problemId: number,
	sourceCode: string,
	filename: string = "validator.cpp"
) {
	await requireAdmin();

	// Verify problem exists
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);

	if (!problem) {
		throw new Error("Problem not found");
	}

	// Upload validator source to MinIO
	const validatorPath = generateValidatorPath(problemId, filename);
	await uploadFile(validatorPath, sourceCode, "text/plain");

	// Update problem with validator path
	const [updatedProblem] = await db
		.update(problems)
		.set({
			validatorPath,
			updatedAt: new Date(),
		})
		.where(eq(problems.id, problemId))
		.returning();

	revalidatePath(`/admin/problems/${problemId}`);

	return {
		success: true,
		validatorPath,
		problem: updatedProblem,
	};
}

// Validate testcases using validator
export async function validateTestcases(problemId: number) {
	await requireAdmin();

	// Get problem with validator path
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);

	if (!problem) {
		throw new Error("Problem not found");
	}

	if (!problem.validatorPath) {
		throw new Error("No validator configured for this problem");
	}

	// Get all testcases for the problem
	const testcaseList = await db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, problemId))
		.orderBy(testcases.id);

	if (testcaseList.length === 0) {
		throw new Error("No testcases found for this problem");
	}

	// Create validation job with job_type for unified queue
	const validateJob = {
		job_type: "validate",
		problem_id: problemId,
		validator_path: problem.validatorPath,
		testcase_inputs: testcaseList.map((tc) => ({
			id: tc.id,
			input_path: tc.inputPath,
		})),
	};

	// Push to unified judge queue
	const redis = await getRedisClient();
	await redis.lpush("judge:queue", JSON.stringify(validateJob));

	return {
		success: true,
		message: `Validation job queued for ${testcaseList.length} testcases`,
		jobId: `validate:${problemId}`,
	};
}

// Get validation result
export async function getValidationResult(problemId: number) {
	await requireAdmin();

	const redis = await getRedisClient();
	const resultKey = `validate:result:${problemId}`;
	const result = await redis.get(resultKey);

	if (!result) {
		return null;
	}

	return JSON.parse(result);
}

// Refresh contest scoreboard (recalculate Anigma bonus scores)
export async function refreshContestScoreboard(contestId: number) {
	await requireAdmin();

	// Get all Anigma problems in this contest
	const anigmaProblems = await db
		.select({
			problemId: contestProblems.problemId,
		})
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(and(eq(contestProblems.contestId, contestId), eq(problems.problemType, "anigma")));

	if (anigmaProblems.length === 0) {
		return {
			success: false,
			message: "No Anigma problems found in this contest",
		};
	}

	// Recalculate bonus for each Anigma problem
	const results = [];
	for (const { problemId } of anigmaProblems) {
		try {
			await recalculateContestBonus(contestId, problemId);
			results.push({ problemId, success: true });
		} catch (error) {
			console.error(`Failed to recalculate bonus for problem ${problemId}:`, error);
			results.push({ problemId, success: false, error: String(error) });
		}
	}

	// Revalidate contest pages
	revalidatePath(`/contests/${contestId}`);
	revalidatePath(`/contests/${contestId}/scoreboard`);

	const successCount = results.filter((r) => r.success).length;
	const failCount = results.filter((r) => !r.success).length;

	return {
		success: true,
		message: `Scoreboard refreshed: ${successCount} problems updated, ${failCount} failed`,
		results,
	};
}

export type UploadCheckerReturn = Awaited<ReturnType<typeof uploadChecker>>;
export type UploadValidatorReturn = Awaited<ReturnType<typeof uploadValidator>>;
export type ValidateTestcasesReturn = Awaited<ReturnType<typeof validateTestcases>>;
export type GetValidationResultReturn = Awaited<ReturnType<typeof getValidationResult>>;
export type RefreshContestScoreboardReturn = Awaited<ReturnType<typeof refreshContestScoreboard>>;
