import {
	hardShadow,
	OG_COLORS,
	OG_CONTENT_TYPE,
	OG_FONT,
	OG_SIZE,
	positioned,
	renderOgImage,
	Sprite,
} from "@/lib/og";

// /submissions 및 하위 경로 OG 이미지: 채점이 끝난 결과 창
export const alt = "ANA Online Judge 제출";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

const CHECK_SPRITE = ["......##", ".....##.", "##..##..", ".####...", "..##...."];
const SEGMENTS = Array.from({ length: 14 }, (_, i) => `segment-${i}`);
const TESTCASES = Array.from({ length: 6 }, (_, i) => `testcase-${i}`);
const WINDOW_BUTTONS = [OG_COLORS.wa, OG_COLORS.tle, OG_COLORS.ac];

function TitleBar() {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: 8,
				height: 42,
				padding: "0 14px",
				background: OG_COLORS.accent,
				borderBottom: `4px solid ${OG_COLORS.mist}`,
			}}
		>
			{WINDOW_BUTTONS.map((color) => (
				<div key={color} style={{ width: 14, height: 14, background: color }} />
			))}
			<div
				style={{
					display: "flex",
					marginLeft: 10,
					fontFamily: OG_FONT.title,
					fontSize: 20,
					color: OG_COLORS.paper,
				}}
			>
				submit #1000
			</div>
		</div>
	);
}

/** 100% 완료된 진행 바. 칸마다 flexGrow로 안쪽 너비를 남김없이 채운다. */
function ProgressBar() {
	return (
		<div
			style={{
				display: "flex",
				gap: 4,
				padding: 4,
				marginTop: 10,
				border: `4px solid ${OG_COLORS.mist}`,
				background: OG_COLORS.darkBg,
			}}
		>
			{SEGMENTS.map((key) => (
				<div key={key} style={{ flexGrow: 1, height: 22, background: OG_COLORS.sky }} />
			))}
		</div>
	);
}

function TestcaseChecks() {
	return (
		<div style={{ display: "flex", gap: 12, marginTop: 22 }}>
			{TESTCASES.map((key) => (
				<div
					key={key}
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: 50,
						height: 46,
						border: `3px solid ${OG_COLORS.ac}`,
						background: OG_COLORS.darkSecondary,
					}}
				>
					<Sprite rows={CHECK_SPRITE} palette={{ "#": OG_COLORS.ac }} cell={4} />
				</div>
			))}
		</div>
	);
}

function JudgeWindow() {
	return (
		<div
			style={positioned(10, 92, {
				flexDirection: "column",
				width: 440,
				background: OG_COLORS.darkCard,
				border: `4px solid ${OG_COLORS.mist}`,
				borderRadius: 2,
				boxShadow: hardShadow(10),
			})}
		>
			<TitleBar />
			<div style={{ display: "flex", flexDirection: "column", padding: "22px 24px 26px" }}>
				{/* 레포의 진행 문구 `채점 중 (n%)`(submission-status.tsx)와 같은 형식의 완료 표현 */}
				<div
					style={{ display: "flex", fontFamily: OG_FONT.body, fontSize: 22, color: OG_COLORS.mist }}
				>
					채점 완료 (100%)
				</div>
				<ProgressBar />
				<div
					style={{
						display: "flex",
						marginTop: 20,
						fontFamily: OG_FONT.title,
						fontSize: 52,
						color: OG_COLORS.ac,
					}}
				>
					맞았습니다
				</div>
				<TestcaseChecks />
			</div>
		</div>
	);
}

export default function SubmissionsOpengraphImage() {
	return renderOgImage(<JudgeWindow />);
}
