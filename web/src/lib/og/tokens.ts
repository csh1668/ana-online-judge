import type { CSSProperties } from "react";

/** OG 이미지 공통 상수. 색은 globals.css 토큰(라이트/다크)과 홈 히어로의 ANA 색에서만 고른다. */

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

/** 오른쪽 그림 영역 크기 (OgFrame 기준 left 700, top 60) */
export const OG_PANEL = { width: 470, height: 510 };

export const OG_FONT = { title: "Mulmaru", body: "Pretendard" } as const;

export const OG_COLORS = {
	navy: "#112D4E", // --primary (light), 사이트 헤더 색
	ink: "#0A1629", // --header (dark), 픽셀 외곽선
	darkBg: "#0F1A2E", // --background (dark)
	darkCard: "#152339", // --card (dark)
	darkSecondary: "#1E3050", // --secondary (dark)
	paper: "#F9F7F7", // --background (light)
	mist: "#DBE2EF", // --secondary (light)
	accent: "#3F72AF", // --accent (light)
	sky: "#7BA7D9", // --accent / --verdict-pending (dark)
	mint: "#02CDB7", // 히어로 A
	coral: "#EA4C5A", // 히어로 A
	ac: "#7BD4A3", // --verdict-accepted (dark)
	wa: "#F28B8B", // --verdict-wrong (dark)
	tle: "#F2C572", // --verdict-tle (dark)
	mle: "#F1A372", // --verdict-mle (dark)
	runtime: "#B8A0E5", // --verdict-runtime (dark)
	presentation: "#F0B079", // --verdict-presentation (dark)
	brown: "#B86C2C", // --verdict-presentation (light)
	logoBg: "#F1EDEC", // android-chrome-512x512.png의 불투명 배경색
} as const;

/** 두 hex 색을 t(0~1) 비율로 섞는다. 토큰에 없는 음영/밝은 색을 토큰끼리 만들 때 쓴다. */
export function mixColor(a: string, b: string, t: number): string {
	const parse = (hex: string) => [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16));
	const [from, to] = [parse(a), parse(b)];
	const channels = from.map((v, i) =>
		Math.round(v + (to[i] - v) * t)
			.toString(16)
			.padStart(2, "0")
	);
	return `#${channels.join("")}`;
}

/** 뉴브루탈 하드 섀도. 네이비 배경과 구분되도록 #7BA7D9를 쓴다. */
export const hardShadow = (px: number) => `${px}px ${px}px 0 ${OG_COLORS.sky}`;

/** 그림 영역 안의 절대 위치 박스 (Satori는 자식이 여럿이면 display:flex가 필요) */
export function positioned(left: number, top: number, extra: CSSProperties = {}): CSSProperties {
	return { position: "absolute", left, top, display: "flex", ...extra };
}
