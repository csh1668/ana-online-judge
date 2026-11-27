import type { ReactNode } from "react";
import { OG_COLORS, OG_FONT, OG_PANEL } from "./tokens";

const ANA_LETTERS = [
	{ letter: "A", color: OG_COLORS.mint },
	{ letter: "N", color: OG_COLORS.sky }, // 히어로의 #455D8D는 네이비 위 대비 2.1:1이라 #7BA7D9(5.6:1) 사용
	{ letter: "A", color: OG_COLORS.coral },
];

function TitleLines() {
	return (
		<div
			style={{
				position: "absolute",
				left: 80,
				top: 0,
				height: 630,
				display: "flex",
				flexDirection: "column",
				justifyContent: "center",
			}}
		>
			<div style={{ display: "flex", fontFamily: OG_FONT.title, fontSize: 70, lineHeight: 1.1 }}>
				{ANA_LETTERS.map(({ letter, color }) => (
					<span key={color} style={{ color }}>
						{letter}
					</span>
				))}
				<span style={{ color: OG_COLORS.paper, marginLeft: 24 }}>Online Judge</span>
			</div>
			<div
				style={{
					display: "flex",
					marginTop: 20,
					fontFamily: OG_FONT.title,
					fontSize: 54,
					lineHeight: 1.1,
					color: OG_COLORS.paper,
				}}
			>
				{"</> AOJ"}
			</div>
			<div
				style={{
					display: "flex",
					marginTop: 26,
					fontFamily: OG_FONT.body,
					fontSize: 30,
					color: OG_COLORS.mist,
				}}
			>
				프로그래밍 문제를 풀거나 만들어보세요
			</div>
		</div>
	);
}

/** 모든 OG 이미지 공통 틀: 네이비 배경 + 왼쪽 텍스트 3줄 + 오른쪽 그림 영역 */
export function OgFrame({ children }: { children: ReactNode }) {
	return (
		<div
			style={{
				position: "relative",
				display: "flex",
				width: "100%",
				height: "100%",
				background: OG_COLORS.navy,
			}}
		>
			<TitleLines />
			<div
				style={{
					position: "absolute",
					left: 700,
					top: 60,
					width: OG_PANEL.width,
					height: OG_PANEL.height,
					display: "flex",
				}}
			>
				{children}
			</div>
		</div>
	);
}
