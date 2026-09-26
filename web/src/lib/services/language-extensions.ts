import "server-only";

import { getActiveLanguages, getLanguage, listLanguages } from "./languages";

/**
 * 언어 id → 소스 파일 확장자 (no leading dot). 삭제·비활성 언어도 조회한다
 * (과거 제출/스냅샷 복원용). 알 수 없는 id면 throw — 확장자가 틀리면 저지가
 * 언어를 잘못 판별하므로 조용히 대체하지 않는다.
 */
export async function getLanguageFileExtension(id: string): Promise<string> {
	const row = await getLanguage(id);
	if (!row) throw new Error(`알 수 없는 언어입니다: ${id}`);
	return row.fileExtension;
}

/** 여러 번 조회할 때 쓰는 동기 resolver (쿼리 1회). 규칙은 getLanguageFileExtension과 같다. */
export async function getFileExtensionResolver(): Promise<(id: string) => string> {
	const rows = await listLanguages({ includeDeleted: true });
	const map = new Map(rows.map((r) => [r.id, r.fileExtension]));
	return (id) => {
		const ext = map.get(id);
		if (ext === undefined) throw new Error(`알 수 없는 언어입니다: ${id}`);
		return ext;
	};
}

/** 활성(설치·활성화·미삭제) 언어인지 확인하고 그 확장자를 반환한다. 새로 저장되는 소스에 사용. */
export async function requireActiveLanguageExtension(id: string): Promise<string> {
	const row = (await getActiveLanguages()).find((r) => r.id === id);
	if (!row) throw new Error(`지원하지 않는 언어입니다: ${id}`);
	return row.fileExtension;
}
