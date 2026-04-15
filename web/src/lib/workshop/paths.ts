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

export function workshopDraftTestcasePath(
	problemId: number,
	userId: number,
	index: number,
	type: "input" | "output"
): string {
	return `${workshopDraftBase(problemId, userId)}/testcases/testcase_${index}.${type}.txt`;
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
	invocationId: string,
	solutionId: number,
	testcaseId: number
): string {
	return `${workshopProblemBase(problemId)}/invocations/${invocationId}/${solutionId}_${testcaseId}.output.txt`;
}

export function workshopObjectPath(problemId: number, sha256: string): string {
	return `${workshopProblemBase(problemId)}/objects/${sha256}`;
}
