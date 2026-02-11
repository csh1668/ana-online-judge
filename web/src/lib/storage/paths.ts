/**
 * Generate a problem base path
 * New structure: problems/{problemId}/
 */
export function generateProblemBasePath(problemId: number): string {
	return `problems/${problemId}`;
}

/**
 * Generate a testcase file path
 * New structure: problems/{problemId}/testcases/{index}_{input|output}.txt
 */
export function generateTestcasePath(
	problemId: number,
	testcaseIndex: number,
	type: "input" | "output"
): string {
	return `${generateProblemBasePath(problemId)}/testcases/${testcaseIndex}_${type}.txt`;
}

/**
 * Generate a checker file path
 * Structure: problems/{problemId}/checker/{filename}
 */
export function generateCheckerPath(problemId: number, filename: string): string {
	return `${generateProblemBasePath(problemId)}/checker/${filename}`;
}

/**
 * Generate a validator file path
 * Structure: problems/{problemId}/validator/{filename}
 */
export function generateValidatorPath(problemId: number, filename: string): string {
	return `${generateProblemBasePath(problemId)}/validator/${filename}`;
}

/**
 * Generate an external file path
 * Structure: problems/{problemId}/external_files/{filename}
 */
export function generateExternalFilePath(problemId: number, filename: string): string {
	return `${generateProblemBasePath(problemId)}/external_files/${filename}`;
}

/**
 * Generate an image file path
 */
export function generateImagePath(problemId: number | null, filename: string): string {
	const prefix = problemId ? `images/problems/${problemId}` : "images/general";
	return `${prefix}/${filename}`;
}

/**
 * Generate a general file path
 */
export function generateFilePath(problemId: number | null, filename: string): string {
	const prefix = problemId ? `files/problems/${problemId}` : "files/general";
	return `${prefix}/${filename}`;
}

/**
 * Get the public URL for an image (via API route proxy)
 */
export function getImageUrl(key: string): string {
	return `/api/images/${encodeURIComponent(key)}`;
}

/**
 * Get the public URL for a file (via API route proxy)
 */
export function getFileUrl(key: string): string {
	return `/api/files/${encodeURIComponent(key)}`;
}

/**
 * Generate a playground file path
 * Structure: playground/{sessionId}/{filePath}
 */
export function generatePlaygroundFilePath(sessionId: string, filePath: string): string {
	return `playground/${sessionId}/${filePath}`;
}
