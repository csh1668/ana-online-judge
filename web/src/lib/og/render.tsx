import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { OgFrame } from "./frame";
import { OG_FONT, OG_SIZE } from "./tokens";

// 경로는 리터럴로 둬야 빌드 파일 추적(NFT)이 프로젝트 전체로 번지지 않는다.
// OG 이미지는 빌드 시 정적 생성되며, next build의 cwd는 로컬·Docker(/app) 모두 web 루트다.
// next/og(Satori)는 woff2를 읽지 못하므로 Mulmaru는 assets/fonts의 공식 OTF를 쓴다.
async function loadFonts() {
	const [mulmaru, pretendard] = await Promise.all([
		readFile(join(process.cwd(), "assets", "fonts", "Mulmaru.otf")),
		readFile(
			join(
				process.cwd(),
				"node_modules",
				"pretendard",
				"dist",
				"public",
				"static",
				"Pretendard-SemiBold.otf"
			)
		),
	]);
	return [
		{ name: OG_FONT.title, data: mulmaru, weight: 400 as const, style: "normal" as const },
		{ name: OG_FONT.body, data: pretendard, weight: 600 as const, style: "normal" as const },
	];
}

export async function loadLogoDataUrl() {
	const logo = await readFile(join(process.cwd(), "public", "android-chrome-512x512.png"));
	return `data:image/png;base64,${logo.toString("base64")}`;
}

/** 공통 틀(OgFrame) 오른쪽 영역에 art를 넣어 1200×630 PNG를 만든다. */
export async function renderOgImage(art: ReactNode) {
	return new ImageResponse(<OgFrame>{art}</OgFrame>, { ...OG_SIZE, fonts: await loadFonts() });
}
