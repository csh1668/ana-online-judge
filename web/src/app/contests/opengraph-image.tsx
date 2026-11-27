import {
	egg,
	ellipse,
	mixColor,
	OG_COLORS,
	OG_CONTENT_TYPE,
	OG_FONT,
	OG_PANEL,
	OG_SIZE,
	PixelArt,
	type PixelObject,
	positioned,
	rect,
	renderOgImage,
	segment,
	sparkle,
} from "@/lib/og";

// /contests 및 하위 경로 OG 이미지: 문제를 풀면 달아주는 ICPC 풍선
export const alt = "ANA Online Judge 대회";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const BALLOONS = [
	{ x: 82, y: 205, color: OG_COLORS.mint, label: "A" },
	{ x: 186, y: 140, color: OG_COLORS.sky, label: "B" },
	{ x: 290, y: 210, color: OG_COLORS.wa, label: "C" },
	{ x: 392, y: 150, color: OG_COLORS.tle, label: "D" },
];
const RX = 50;
const RY = 60;
/** 풍선 줄이 모이는 매듭 */
const TIE = { x: 236, y: 476 };

function balloon({ x, y, color }: (typeof BALLOONS)[number]): PixelObject {
	const shade = mixColor(color, OG_COLORS.navy, 0.3);
	const bottom = y + RY * 1.1;
	const body = egg(x, y, RX, RY);
	const lit = egg(x - 7, y - 7, RX - 4, RY - 4);
	return {
		outline: OG_COLORS.ink,
		layers: [
			{ test: body, color },
			{ test: (px, py) => body(px, py) && !lit(px, py), color: shade },
			{ test: ellipse(x - 20, y - 26, 9, 14), color: OG_COLORS.paper },
			{ test: rect(x - 9, bottom - 2, x + 9, bottom + 10), color: shade },
		],
	};
}

function balloonObjects(): PixelObject[] {
	const strings = BALLOONS.map((b) => ({
		layers: [{ test: segment(b.x, b.y + RY * 1.1 + 10, TIE.x, TIE.y, 3.3), color: OG_COLORS.mist }],
	}));
	const tie = {
		outline: OG_COLORS.ink,
		layers: [{ test: rect(TIE.x - 9, TIE.y - 6, TIE.x + 9, TIE.y + 8), color: OG_COLORS.coral }],
	};
	return [
		...strings,
		tie,
		...BALLOONS.map(balloon),
		sparkle(28, 70, OG_COLORS.tle),
		sparkle(450, 300, OG_COLORS.sky),
		sparkle(120, 380, OG_COLORS.ac),
		sparkle(360, 52, OG_COLORS.paper),
	];
}

function BalloonLabel({ x, y, label }: (typeof BALLOONS)[number]) {
	return (
		<div
			style={positioned(x - 40, y - 30, {
				width: 80,
				height: 60,
				alignItems: "center",
				justifyContent: "center",
				fontFamily: OG_FONT.title,
				fontSize: 52,
				color: OG_COLORS.navy,
			})}
		>
			{label}
		</div>
	);
}

export default function ContestsOpengraphImage() {
	return renderOgImage(
		<>
			<PixelArt
				width={OG_PANEL.width}
				height={OG_PANEL.height}
				cell={6}
				objects={balloonObjects()}
			/>
			{BALLOONS.map((b) => (
				<BalloonLabel key={b.label} {...b} />
			))}
		</>
	);
}
