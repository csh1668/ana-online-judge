import type { Metadata } from "next";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/700.css";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import { getRunningContestPracticeCounts } from "@/actions/layout";
import { auth } from "@/auth";
import { ImpersonationBanner } from "@/components/auth/impersonation-banner";
import { ChromeShell } from "@/components/layout/chrome-shell";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ServerTimeFloater } from "@/components/layout/server-time-floater";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "@/components/ui/toaster";

// Pretendard는 CSS로 로드 (--font-pretendard 변수 자동 생성됨)
// Geist Mono는 @fontsource/geist-mono CSS로 로드

export const metadata: Metadata = {
	// og:image 등 메타데이터 URL을 절대 경로로 만들기 위한 기준
	metadataBase: new URL("https://aoj.anacnu.kr"),
	title: {
		default: "ANA Online Judge",
		template: "%s | AOJ",
	},
	description: "교내 프로그래밍 대회를 위한 온라인 저지 시스템",
	// og:image는 app/opengraph-image.tsx가 자동으로 채움
	openGraph: {
		type: "website",
		siteName: "ANA Online Judge",
		locale: "ko_KR",
		url: "./",
	},
	twitter: {
		card: "summary_large_image",
	},
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const session = await auth();
	const activeCounts = await getRunningContestPracticeCounts();

	return (
		<html lang="ko" suppressHydrationWarning>
			<body className="font-sans antialiased min-h-screen flex flex-col">
				<SessionProvider session={session}>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						enableSystem
						disableTransitionOnChange
					>
						<ImpersonationBanner />
						<ChromeShell
							header={<Header activeCounts={activeCounts} />}
							footer={<Footer />}
							floater={<ServerTimeFloater />}
						>
							{children}
						</ChromeShell>
						<Toaster />
						<SonnerToaster richColors />
					</ThemeProvider>
				</SessionProvider>
			</body>
		</html>
	);
}
