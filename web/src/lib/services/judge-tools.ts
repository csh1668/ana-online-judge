import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contestProblems, problems, testcases } from "@/db/schema";
import { recalculateContestBonus } from "@/lib/anigma-bonus";
import { getRedisClient } from "@/lib/redis";
import { generateCheckerPath, generateValidatorPath, uploadFile } from "@/lib/storage";

export async function uploadChecker(
	problemId: number,
	sourceCode: string,
	filename: string = "checker.cpp"
) {
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);
	if (!problem) {
		throw new Error("Problem not found");
	}

	const checkerPath = generateCheckerPath(problemId, filename);
	await uploadFile(checkerPath, sourceCode, "text/plain");

	const [updatedProblem] = await db
		.update(problems)
		.set({ checkerPath, updatedAt: new Date() })
		.where(eq(problems.id, problemId))
		.returning();

	return { success: true, checkerPath, problem: updatedProblem };
}

export async function uploadValidator(
	problemId: number,
	sourceCode: string,
	filename: string = "validator.cpp"
) {
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);
	if (!problem) {
		throw new Error("Problem not found");
	}

	const validatorPath = generateValidatorPath(problemId, filename);
	await uploadFile(validatorPath, sourceCode, "text/plain");

	const [updatedProblem] = await db
		.update(problems)
		.set({ validatorPath, updatedAt: new Date() })
		.where(eq(problems.id, problemId))
		.returning();

	return { success: true, validatorPath, problem: updatedProblem };
}

export async function validateTestcases(problemId: number) {
	const [problem] = await db.select().from(problems).where(eq(problems.id, problemId)).limit(1);
	if (!problem) {
		throw new Error("Problem not found");
	}
	if (!problem.validatorPath) {
		throw new Error("No validator configured for this problem");
	}

	const testcaseList = await db
		.select()
		.from(testcases)
		.where(eq(testcases.problemId, problemId))
		.orderBy(testcases.id);

	if (testcaseList.length === 0) {
		throw new Error("No testcases found for this problem");
	}

	const validateJob = {
		job_type: "validate",
		problem_id: problemId,
		validator_path: problem.validatorPath,
		testcase_inputs: testcaseList.map((tc) => ({
			id: tc.id,
			input_path: tc.inputPath,
		})),
	};

	const redis = await getRedisClient();
	await redis.lpush("judge:queue", JSON.stringify(validateJob));

	return {
		success: true,
		message: `Validation job queued for ${testcaseList.length} testcases`,
		jobId: `validate:${problemId}`,
	};
}

export async function getValidationResult(problemId: number) {
	const redis = await getRedisClient();
	const resultKey = `validate:result:${problemId}`;
	const result = await redis.get(resultKey);
	if (!result) {
		return null;
	}
	return JSON.parse(result);
}

export async function refreshContestScoreboard(contestId: number) {
	const anigmaProblems = await db
		.select({ problemId: contestProblems.problemId })
		.from(contestProblems)
		.innerJoin(problems, eq(contestProblems.problemId, problems.id))
		.where(and(eq(contestProblems.contestId, contestId), eq(problems.problemType, "anigma")));

	if (anigmaProblems.length === 0) {
		return {
			success: false,
			message: "No Anigma problems found in this contest",
		};
	}

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

	const successCount = results.filter((r) => r.success).length;
	const failCount = results.filter((r) => !r.success).length;

	return {
		success: true,
		message: `Scoreboard refreshed: ${successCount} problems updated, ${failCount} failed`,
		results,
	};
}
