import { SHORT_LETTERS } from "@/lib/tier";

/**
 * 문제 목록 검색어 파서.
 *
 * 사용자가 입력한 검색어를 공백 단위로 토큰화하고, 접두사에 따라 의미를 부여한다.
 * 모든 토큰은 AND로 결합된다.
 *
 *  - `id:<숫자>`           → 문제 ID 정확 일치
 *  - `#<문자열>`           → 알고리즘 태그(이름/슬러그/설명) 부분 일치
 *  - `s#<username>`        → 해당 사용자가 푼 문제 (canonical solved 정의)
 *  - `*<그룹>[숫자]`        → 난이도(티어) 검색
 *      그룹: b(Bronze) / s(Silver) / g(Gold) / p(Platinum) / d(Diamond) / r(Ruby)
 *      숫자: 1(I, 가장 높음) ~ 5(V, 가장 낮음). 생략 시 그룹 전체.
 *      특수 그룹: u(Unrated, tier=0), n(Not Ratable, tier=-1)
 *      예: `*g` → 골드 전체, `*s5` → 실버 5
 *  - `<문자열>`            → 제목/내용 부분 일치
 *
 * 빈 토큰이나 형식이 깨진 토큰(`id:abc`, `*g6`, `*xyz`)은 무시한다.
 */

export type ProblemSearchToken =
	| { type: "id"; value: number }
	| { type: "tag"; value: string }
	| { type: "solver"; value: string }
	| { type: "tier"; values: number[] }
	| { type: "text"; value: string };

const TIER_SPECIALS: Record<string, number> = {
	u: 0, // Unrated
	n: -1, // Not Ratable
};

/**
 * `*` 접두사를 제외한 본문(`g`, `s5`, `u`, ...)을 받아 일치하는 tier 정수 목록을 반환.
 * 형식이 잘못된 경우 null.
 *
 * tier 정수 매핑은 `lib/tier.ts`의 그룹 정의(SHORT_LETTERS = B/S/G/P/D/R, 그룹당 5단계)와
 * 숫자 표시 규칙(subNum 5=V=가장 낮음, 1=I=가장 높음)을 그대로 재사용한다.
 */
export function parseTierTokenBody(body: string): number[] | null {
	const norm = body.trim().toLowerCase();
	if (!norm) return null;

	if (norm in TIER_SPECIALS) return [TIER_SPECIALS[norm]];

	const groupIdx = SHORT_LETTERS.indexOf(norm[0].toUpperCase() as (typeof SHORT_LETTERS)[number]);
	if (groupIdx === -1) return null;
	const rest = norm.slice(1);

	if (!rest) {
		const start = groupIdx * 5 + 1;
		return [start, start + 1, start + 2, start + 3, start + 4];
	}

	const num = Number.parseInt(rest, 10);
	if (!Number.isFinite(num) || num < 1 || num > 5 || String(num) !== rest) return null;
	// num은 화면 표시(B5/B1)와 동일: 5가 가장 낮은 티어, 1이 가장 높은 티어.
	return [groupIdx * 5 + (6 - num)];
}

export function parseProblemSearchQuery(input: string | undefined): ProblemSearchToken[] {
	if (!input) return [];
	const tokens: ProblemSearchToken[] = [];
	for (const raw of input.trim().split(/\s+/)) {
		if (!raw) continue;
		if (raw.startsWith("id:")) {
			const num = Number.parseInt(raw.slice(3), 10);
			if (Number.isFinite(num)) tokens.push({ type: "id", value: num });
			continue;
		}
		if (raw.startsWith("s#")) {
			const v = raw.slice(2);
			if (v) tokens.push({ type: "solver", value: v });
			continue;
		}
		if (raw.startsWith("#")) {
			const v = raw.slice(1);
			if (v) tokens.push({ type: "tag", value: v });
			continue;
		}
		if (raw.startsWith("*")) {
			const values = parseTierTokenBody(raw.slice(1));
			if (values && values.length > 0) tokens.push({ type: "tier", values });
			continue;
		}
		tokens.push({ type: "text", value: raw });
	}
	return tokens;
}
