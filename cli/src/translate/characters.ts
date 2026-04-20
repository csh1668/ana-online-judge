import fs from "node:fs";
import path from "node:path";

const DEFAULT_PATH = path.join(process.cwd(), "translate-characters.txt");
const SAMPLE_SIZE = 5;

export function loadCharacterPool(customPath?: string): string[] {
	const filePath = customPath ?? DEFAULT_PATH;
	if (!fs.existsSync(filePath)) return [];
	try {
		const raw = fs.readFileSync(filePath, "utf-8");
		return raw
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0 && !line.startsWith("#"));
	} catch {
		return [];
	}
}

/**
 * Fisher-Yates shuffle한 후 앞 N개를 반환.
 * 풀이 N보다 작으면 가용한 만큼만.
 * 비어 있으면 빈 배열.
 */
export function pickRandomNames(pool: string[], n: number = SAMPLE_SIZE): string[] {
	if (pool.length === 0) return [];
	const arr = [...pool];
	for (let i = arr.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[arr[i], arr[j]] = [arr[j], arr[i]];
	}
	return arr.slice(0, Math.min(n, arr.length));
}
