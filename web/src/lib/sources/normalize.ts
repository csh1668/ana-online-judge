// Unicode NFKC + lowercase + 공백 정규화. 한글·영문·전각/반각 섞인 검색을 흡수.
export function normalizeSourceName(input: string): string {
	return input.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}
