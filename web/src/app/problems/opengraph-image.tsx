import {
	hardShadow,
	OG_COLORS,
	OG_CONTENT_TYPE,
	OG_FONT,
	OG_PANEL,
	OG_SIZE,
	PixelArt,
	type PixelObject,
	positioned,
	renderOgImage,
	rotated,
	segment,
	sparkle,
} from "@/lib/og";

// /problems 및 하위 경로 OG 이미지: "</>" 코드 블록을 내려치는 판사봉
export const alt = "ANA Online Judge 문제";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

/** 판사봉 머리 끝이 코드 블록 윗면에 닿는 지점 */
const IMPACT = { x: 238, y: 300 };
/** 판사봉 기울기(rad). 손잡이는 오른쪽 위, 머리 끝은 IMPACT */
const TILT = -0.45;
const HEAD_HALF = 78;

function gavel(): PixelObject {
	const head = {
		x: IMPACT.x - Math.sin(-TILT) * HEAD_HALF,
		y: IMPACT.y - Math.cos(TILT) * HEAD_HALF,
	};
	// 로컬 좌표: x축 = 손잡이 방향, y축 = 머리 길이 방향
	const box = (x0: number, y0: number, x1: number, y1: number) =>
		rotated(head.x, head.y, TILT, (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1);
	return {
		outline: OG_COLORS.ink,
		layers: [
			{ test: box(30, -11, 250, 11), color: OG_COLORS.brown },
			{ test: box(30, -11, 250, -5), color: OG_COLORS.presentation },
			{ test: box(240, -16, 266, 16), color: OG_COLORS.brown },
			{ test: box(30, -16, 46, 16), color: OG_COLORS.tle },
			{ test: box(-36, -HEAD_HALF, 36, HEAD_HALF), color: OG_COLORS.brown },
			{ test: box(-36, -HEAD_HALF, -20, HEAD_HALF), color: OG_COLORS.presentation },
			{ test: box(-36, -58, 36, -46), color: OG_COLORS.tle },
			{ test: box(-36, 46, 36, 58), color: OG_COLORS.tle },
		],
	};
}

/** 충격선: 위쪽 방향만, 판사봉 머리와 겹치지 않는 각도 */
function impactLines(): PixelObject[] {
	return [-172, -155, -70, -40, -12].map((deg, i) => {
		const angle = (deg * Math.PI) / 180;
		const [r0, r1] = deg < -100 ? [62, 100] : [54, 92];
		const at = (r: number) => [IMPACT.x + Math.cos(angle) * r, IMPACT.y + Math.sin(angle) * r];
		const [x0, y0] = at(r0);
		const [x1, y1] = at(r1);
		return {
			layers: [
				{ test: segment(x0, y0, x1, y1, 4.6), color: i % 2 ? OG_COLORS.paper : OG_COLORS.tle },
			],
		};
	});
}

function CodeBlock() {
	return (
		<div
			style={positioned(28, IMPACT.y, {
				width: 270,
				height: 150,
				alignItems: "center",
				justifyContent: "center",
				background: OG_COLORS.darkSecondary,
				border: `5px solid ${OG_COLORS.mist}`,
				borderRadius: 2,
				boxShadow: hardShadow(12),
				fontFamily: OG_FONT.title,
				fontSize: 88,
			})}
		>
			<span style={{ color: OG_COLORS.mint }}>{"<"}</span>
			<span style={{ color: OG_COLORS.sky }}>/</span>
			<span style={{ color: OG_COLORS.coral }}>{">"}</span>
		</div>
	);
}

export default function ProblemsOpengraphImage() {
	return renderOgImage(
		<>
			<CodeBlock />
			<PixelArt
				width={OG_PANEL.width}
				height={OG_PANEL.height}
				cell={6}
				objects={[
					...impactLines(),
					gavel(),
					sparkle(60, 120, OG_COLORS.sky),
					sparkle(420, 330, OG_COLORS.tle),
					sparkle(380, 470, OG_COLORS.paper),
				]}
			/>
		</>
	);
}
