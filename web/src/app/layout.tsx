import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource/geist-mono/400.css";
import "@fontsource/geist-mono/700.css";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./globals.css";
import { Toaster as SonnerToaster } from "sonner";
import { auth } from "@/auth";
import { ImpersonationBanner } from "@/components/auth/impersonation-banner";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ServerTimeFloater } from "@/components/layout/server-time-floater";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "@/components/ui/toaster";
import { getRunningContestPracticeCounts } from "@/lib/services/active-counts";

// Pretendard는 CSS로 로드 (--font-pretendard 변수 자동 생성됨)
// Geist Mono는 @fontsource/geist-mono CSS로 로드

export const metadata: Metadata = {
	title: {
		default: "ANA Online Judge",
		template: "%s | AOJ",
	},
	description: "교내 프로그래밍 대회를 위한 온라인 저지 시스템",
};

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const headersList = await headers();
	const pathname = headersList.get("x-pathname") || "";
	const session = await auth();

	// 스코어보드 페이지에서는 헤더와 푸터를 숨김
	const isScoreboardPage = pathname.includes("/scoreboard") || pathname === "/test-scoreboard";

	const activeCounts = isScoreboardPage ? undefined : await getRunningContestPracticeCounts();

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
						{!isScoreboardPage && <Header activeCounts={activeCounts} />}
						<main className="flex-1">{children}</main>
						{!isScoreboardPage && <Footer />}
						{!isScoreboardPage && <ServerTimeFloater />}
						<Toaster />
						<SonnerToaster richColors />
					</ThemeProvider>
				</SessionProvider>
			</body>
		</html>
	);
}
