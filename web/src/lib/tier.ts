// 순수 함수 헬퍼. DB 접근 없음, 클라이언트/서버 공용.

// 레이팅 → 사용자 티어 정수. 하한 기준 (rating >= min → tier).
export const USER_TIER_THRESHOLDS: ReadonlyArray<{ tier: number; min: number }> = [
	{ tier: 1, min: 30 }, // Bronze V
	{ tier: 2, min: 60 }, // Bronze IV
	{ tier: 3, min: 90 }, // Bronze III
	{ tier: 4, min: 120 }, // Bronze II
	{ tier: 5, min: 150 }, // Bronze I
	{ tier: 6, min: 200 }, // Silver V
	{ tier: 7, min: 300 }, // Silver IV
	{ tier: 8, min: 400 }, // Silver III
	{ tier: 9, min: 500 }, // Silver II
	{ tier: 10, min: 650 }, // Silver I
	{ tier: 11, min: 800 }, // Gold V
	{ tier: 12, min: 950 }, // Gold IV
	{ tier: 13, min: 1100 }, // Gold III
	{ tier: 14, min: 1250 }, // Gold II
	{ tier: 15, min: 1400 }, // Gold I
	{ tier: 16, min: 1600 }, // Platinum V
	{ tier: 17, min: 1750 }, // Platinum IV
	{ tier: 18, min: 1900 }, // Platinum III
	{ tier: 19, min: 2000 }, // Platinum II
	{ tier: 20, min: 2100 }, // Platinum I
	{ tier: 21, min: 2200 }, // Diamond V
	{ tier: 22, min: 2300 }, // Diamond IV
	{ tier: 23, min: 2400 }, // Diamond III
	{ tier: 24, min: 2500 }, // Diamond II
	{ tier: 25, min: 2600 }, // Diamond I
	{ tier: 26, min: 2700 }, // Ruby V
	{ tier: 27, min: 2800 }, // Ruby IV
	{ tier: 28, min: 2850 }, // Ruby III
	{ tier: 29, min: 2900 }, // Ruby II
	{ tier: 30, min: 2950 }, // Ruby I
	{ tier: 31, min: 3000 }, // Master
];

export function ratingToUserTier(rating: number): number {
	let result = 0;
	for (const { tier, min } of USER_TIER_THRESHOLDS) {
		if (rating >= min) result = tier;
		else break;
	}
	return result;
}

export const GROUP_NAMES = ["Bronze", "Silver", "Gold", "Platinum", "Diamond", "Ruby"] as const;
export const ROMAN = ["V", "IV", "III", "II", "I"] as const;
export const SHORT_LETTERS = ["B", "S", "G", "P", "D", "R"] as const;

export type TierKind = "problem" | "user";

export function groupIndex(tier: number): number | null {
	// tier 1~5 → 0 (Bronze), 6~10 → 1 (Silver), ... 26~30 → 5 (Ruby)
	if (tier < 1 || tier > 30) return null;
	return Math.floor((tier - 1) / 5);
}

export function tierLabel(tier: number, kind: TierKind): string {
	if (kind === "problem" && tier === -1) return "Not Ratable";
	if (tier === 0) return "Unrated";
	if (tier === 31) return kind === "user" ? "Master" : "Unrated"; // problem은 Master 없음
	const g = groupIndex(tier);
	if (g === null) return "Unrated";
	const subIdx = (tier - 1) % 5; // 0~4
	return `${GROUP_NAMES[g]} ${ROMAN[subIdx]}`;
}

export function tierShortLabel(tier: number, kind: TierKind): string {
	if (kind === "problem" && tier === -1) return "N/R";
	if (tier === 0) return "—";
	if (tier === 31) return kind === "user" ? "M" : "—";
	const g = groupIndex(tier);
	if (g === null) return "—";
	const subNum = 5 - ((tier - 1) % 5); // 5,4,3,2,1
	return `${SHORT_LETTERS[g]}${subNum}`;
}

export type TierGroup =
	| "bronze"
	| "silver"
	| "gold"
	| "platinum"
	| "diamond"
	| "ruby"
	| "master"
	| "unrated"
	| "not_ratable";

export function tierGroup(tier: number, kind: TierKind): TierGroup {
	if (kind === "problem" && tier === -1) return "not_ratable";
	if (tier === 0) return "unrated";
	if (tier === 31) return "master";
	const g = groupIndex(tier);
	if (g === null) return "unrated";
	return (["bronze", "silver", "gold", "platinum", "diamond", "ruby"] as const)[g];
}

// CSS 색상 토큰. Tailwind inline color로 사용.
const GROUP_COLORS: Record<TierGroup, string> = {
	bronze: "#ad5600",
	silver: "#435f7a",
	gold: "#ec9a00",
	platinum: "#27e2a4",
	diamond: "#00b4fc",
	ruby: "#ff0062",
	master: "transparent", // 컴포넌트에서 gradient로 별도 처리
	unrated: "#2d2d2d",
	not_ratable: "#555555",
};

export function tierColor(tier: number, kind: TierKind): string {
	return GROUP_COLORS[tierGroup(tier, kind)];
}
