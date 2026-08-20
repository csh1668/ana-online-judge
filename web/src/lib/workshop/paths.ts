/**
 * MinIO path layout for workshop:
 *   workshop/{problemId}/drafts/{userId}/...
 *   workshop/{problemId}/invocations/{invocationId}/...
 *   workshop/{problemId}/objects/{sha256}
 */

export function workshopProblemBase(problemId: number): string {
	return `workshop/${problemId}`;
}

export function workshopDraftBase(problemId: number, userId: number): string {
	return `${workshopProblemBase(problemId)}/drafts/${userId}`;
}

export function workshopDraftResourcePath(
	problemId: number,
	userId: number,
	filename: string
): string {
	return `${workshopDraftBase(problemId, userId)}/resources/${filename}`;
}

/**
 * Id-keyed testcase file path. The key embeds the immutable row id — never the
 * display index — so reindexing after deletion is a DB-only operation and a
 * late-arriving judge upload can never land on the wrong testcase. Legacy rows
 * keep their old index-based keys in their DB columns (keys are opaque).
 */
export function workshopDraftTestcaseFilePath(
	problemId: number,
	userId: number,
	testcaseId: number,
	type: "input" | "output"
): string {
	return `${workshopDraftBase(problemId, userId)}/testcases/tc_${testcaseId}.${type}.txt`;
}

export function workshopDraftGeneratorSourcePath(
	problemId: number,
	userId: number,
	name: string,
	ext: string
): string {
	return `${workshopDraftBase(problemId, userId)}/generators/${name}.${ext}`;
}

export function workshopDraftGeneratorBinaryPath(
	problemId: number,
	userId: number,
	name: string
): string {
	return `${workshopDraftBase(problemId, userId)}/generators/${name}`;
}

export function workshopDraftSolutionPath(
	problemId: number,
	userId: number,
	name: string,
	ext: string
): string {
	return `${workshopDraftBase(problemId, userId)}/solutions/${name}.${ext}`;
}

export function workshopDraftCheckerPath(problemId: number, userId: number, ext: string): string {
	return `${workshopDraftBase(problemId, userId)}/checker.${ext}`;
}

export function workshopDraftValidatorPath(problemId: number, userId: number, ext: string): string {
	return `${workshopDraftBase(problemId, userId)}/validator.${ext}`;
}

export function workshopInvocationOutputPath(
	problemId: number,
	invocationId: number,
	solutionId: number,
	testcaseId: number
): string {
	return `${workshopProblemBase(problemId)}/invocations/${invocationId}/${solutionId}_${testcaseId}.output.txt`;
}

export function workshopObjectPath(problemId: number, sha256: string): string {
	return `${workshopProblemBase(problemId)}/objects/${sha256}`;
}
