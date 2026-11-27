import {
	hardShadow,
	loadLogoDataUrl,
	OG_COLORS,
	OG_CONTENT_TYPE,
	OG_FONT,
	OG_PANEL,
	OG_SIZE,
	PixelArt,
	positioned,
	renderOgImage,
	sparkle,
} from "@/lib/og";

// 사이트 기본 OG 이미지: AOJ 로고 + 판정 배지. 하위 경로가 자체 이미지를 두지 않으면 이걸 이어받는다.
export const alt = "ANA Online Judge";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const BADGES = [
	{ text: "AC", color: OG_COLORS.ac, x: 6, y: 78, rotate: -8 },
	{ text: "WA", color: OG_COLORS.wa, x: 360, y: 52, rotate: 7 },
	{ text: "TLE", color: OG_COLORS.tle, x: 0, y: 392, rotate: 6 },
	{ text: "MLE", color: OG_COLORS.mle, x: 336, y: 408, rotate: -7 },
];

/** 로고 PNG는 불투명 배경이라, 같은 색 바탕의 타일에 담아 경계를 감춘다. */
function LogoTile({ src }: { src: string }) {
	return (
		<div
			style={positioned(95, 110, {
				width: 280,
				height: 280,
				background: OG_COLORS.logoBg,
				border: `5px solid ${OG_COLORS.ink}`,
				borderRadius: 2,
				boxShadow: hardShadow(12),
			})}
		>
			{/* biome-ignore lint/performance/noImgElement: Satori는 next/image가 아닌 img만 지원 */}
			<img src={src} alt="" width={270} height={270} />
		</div>
	);
}

function VerdictBadge({ text, color, x, y, rotate }: (typeof BADGES)[number]) {
	return (
		<div
			style={positioned(x, y, {
				padding: "6px 16px 4px",
				fontFamily: OG_FONT.title,
				fontSize: 40,
				color: OG_COLORS.navy,
				background: color,
				border: `4px solid ${OG_COLORS.ink}`,
				borderRadius: 2,
				boxShadow: hardShadow(6),
				transform: `rotate(${rotate}deg)`,
			})}
		>
			{text}
		</div>
	);
}

export default async function OpengraphImage() {
	const logoSrc = await loadLogoDataUrl();
	return renderOgImage(
		<>
			<PixelArt
				width={OG_PANEL.width}
				height={OG_PANEL.height}
				cell={6}
				objects={[
					sparkle(430, 250, OG_COLORS.sky),
					sparkle(40, 270, OG_COLORS.tle),
					sparkle(250, 470, OG_COLORS.paper),
					sparkle(230, 40, OG_COLORS.runtime),
				]}
			/>
			<LogoTile src={logoSrc} />
			{BADGES.map((badge) => (
				<VerdictBadge key={badge.text} {...badge} />
			))}
		</>
	);
}
