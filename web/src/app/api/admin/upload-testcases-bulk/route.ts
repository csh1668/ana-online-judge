import { count, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { testcases } from "@/db/schema";
import { generateTestcasePath, uploadFile } from "@/lib/storage";

interface TestcasePair {
	input: File;
	output: File;
	index: number;
}

/**
 * Parse testcase files and match input/output pairs
 * Supports patterns:
 * - 1.in / 1.out
 * - 1_input.txt / 1_output.txt
 * - input_1.txt / output_1.txt
 * - test1.in / test1.out
 */
function parseTestcaseFiles(files: File[]): TestcasePair[] {
	const inputFiles: Array<{ file: File; index: number }> = [];
	const outputFiles: Array<{ file: File; index: number }> = [];

	// Regex patterns to extract test case index
	// Supports: (no extension), .txt, .in, .out
	const patterns = [
		// 1.in, 1.out (extension required for this pattern)
		/^(\d+)\.(in|input)$/i,
		/^(\d+)\.(out|output|ans|answer)$/i,
		// 1_input.txt, 1_input (with or without extension)
		/^(\d+)_(in|input)(\.(txt|in))?$/i,
		/^(\d+)_(out|output|ans|answer)(\.(txt|out))?$/i,
		// input_1.txt, input_1 (with or without extension)
		/^(in|input)_(\d+)(\.(txt|in))?$/i,
		/^(out|output|ans|answer)_(\d+)(\.(txt|out))?$/i,
		// test1.in, test1.out (extension required for this pattern)
		/^test(\d+)\.(in|input)$/i,
		/^test(\d+)\.(out|output|ans|answer)$/i,
		// test1_input, test1_output (no extension)
		/^test(\d+)_(in|input)$/i,
		/^test(\d+)_(out|output|ans|answer)$/i,
	];

	for (const file of files) {
		const name = file.name.toLowerCase();
		let matched = false;

		// Try input patterns
		for (let i = 0; i < patterns.length; i += 2) {
			const inputPattern = patterns[i];
			const match = name.match(inputPattern);
			if (match) {
				// Extract index: for patterns like "input_1", index is in match[2]
				// for others like "1_input", "1.in", "test1_input", index is in match[1]
				const index = parseInt(match[2] && /^\d+$/.test(match[2]) ? match[2] : match[1], 10);
				if (!isNaN(index)) {
					inputFiles.push({ file, index });
					matched = true;
					break;
				}
			}
		}

		// Try output patterns
		if (!matched) {
			for (let i = 1; i < patterns.length; i += 2) {
				const outputPattern = patterns[i];
				const match = name.match(outputPattern);
				if (match) {
					// Extract index: for patterns like "output_1", index is in match[2]
					// for others like "1_output", "1.out", "test1_output", index is in match[1]
					const index = parseInt(match[2] && /^\d+$/.test(match[2]) ? match[2] : match[1], 10);
					if (!isNaN(index)) {
						outputFiles.push({ file, index });
						matched = true;
						break;
					}
				}
			}
		}
	}

	// Sort by index
	inputFiles.sort((a, b) => a.index - b.index);
	outputFiles.sort((a, b) => a.index - b.index);

	// Match pairs
	const pairs: TestcasePair[] = [];
	const inputMap = new Map(inputFiles.map((f) => [f.index, f.file]));
	const outputMap = new Map(outputFiles.map((f) => [f.index, f.file]));

	// Find all indices
	const allIndices = new Set([...inputMap.keys(), ...outputMap.keys()]);

	for (const index of Array.from(allIndices).sort((a, b) => a - b)) {
		const input = inputMap.get(index);
		const output = outputMap.get(index);

		if (input && output) {
			pairs.push({ input, output, index });
		}
	}

	return pairs;
}

export async function POST(request: Request) {
	try {
		// Check authentication
		const session = await auth();
		if (!session?.user || session.user.role !== "admin") {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		const formData = await request.formData();
		const problemId = parseInt(formData.get("problemId") as string, 10);
		const defaultScore = parseInt(formData.get("defaultScore") as string, 10) || 10;
		const isHidden = formData.get("isHidden") === "true";

		if (Number.isNaN(problemId)) {
			return NextResponse.json({ error: "유효하지 않은 문제 ID입니다." }, { status: 400 });
		}

		// Get all files
		const files: File[] = [];
		for (const [key, value] of formData.entries()) {
			if (key.startsWith("files") && value instanceof File) {
				files.push(value);
			}
		}

		if (files.length === 0) {
			return NextResponse.json({ error: "파일이 업로드되지 않았습니다." }, { status: 400 });
		}

		// Parse and match testcase pairs
		const pairs = parseTestcaseFiles(files);

		if (pairs.length === 0) {
			return NextResponse.json(
				{
					error:
						"테스트케이스 쌍을 찾을 수 없습니다. 파일명 패턴: 1.in/1.out, 1_input.txt/1_output.txt 등을 사용하세요.",
				},
				{ status: 400 }
			);
		}

		// Get current testcase count
		const [countResult] = await db
			.select({ count: count() })
			.from(testcases)
			.where(eq(testcases.problemId, problemId));

		let currentIndex = countResult.count + 1;

		const uploadedTestcases = [];

		// Helper function to process file: normalize line endings for text files, keep binary as-is
		const processFile = async (file: File): Promise<Buffer> => {
			const buffer = Buffer.from(await file.arrayBuffer());

			// Check if file is likely text (by extension or content-type)
			const isTextFile =
				file.type.startsWith("text/") ||
				/\.(txt|in|out|ans|answer)$/i.test(file.name);

			if (isTextFile) {
				// Normalize line endings: CRLF -> LF, CR -> LF
				// Convert to string, normalize, then back to buffer
				const text = buffer.toString("utf-8");
				const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
				return Buffer.from(normalized, "utf-8");
			}

			// Binary file: return as-is
			return buffer;
		};

		// Upload each pair
		for (const pair of pairs) {
			const inputPath = generateTestcasePath(problemId, currentIndex, "input");
			const outputPath = generateTestcasePath(problemId, currentIndex, "output");

			const inputBuffer = await processFile(pair.input);
			const outputBuffer = await processFile(pair.output);

			await Promise.all([
				uploadFile(inputPath, inputBuffer, "application/octet-stream"),
				uploadFile(outputPath, outputBuffer, "application/octet-stream"),
			]);

			// Create testcase record in database
			const [newTestcase] = await db
				.insert(testcases)
				.values({
					problemId,
					inputPath,
					outputPath,
					score: defaultScore,
					isHidden,
				})
				.returning();

			uploadedTestcases.push({
				id: newTestcase.id,
				index: currentIndex,
				inputFile: pair.input.name,
				outputFile: pair.output.name,
			});

			currentIndex++;
		}

		return NextResponse.json({
			message: `${uploadedTestcases.length}개의 테스트케이스가 추가되었습니다.`,
			testcases: uploadedTestcases,
		});
	} catch (error) {
		console.error("Bulk upload testcase error:", error);
		return NextResponse.json(
			{ error: "테스트케이스 일괄 업로드 중 오류가 발생했습니다." },
			{ status: 500 }
		);
	}
}
