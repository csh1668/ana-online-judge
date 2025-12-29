import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "pretendard/dist/web/variable/pretendardvariable.css";
import "./globals.css";
import { auth } from "@/auth";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { SessionProvider } from "@/components/providers/session-provider";
import { Toaster } from "@/components/ui/toaster";

// Pretendard는 CSS로 로드 (--font-pretendard 변수 자동 생성됨)

const geistMono = Geist_Mono({
	variable: "--font-mono",
	subsets: ["latin"],
});

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
	const session = await auth();
	const headersList = await headers();
	const pathname = headersList.get("x-pathname") || "";

	// 스코어보드 페이지에서는 헤더와 푸터를 숨김
	const isScoreboardPage = pathname.includes("/scoreboard") || pathname === "/test-scoreboard";

	return (
		<html lang="ko" suppressHydrationWarning>
			<body className={`${geistMono.variable} font-sans antialiased min-h-screen flex flex-col`}>
				<SessionProvider>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						enableSystem
						disableTransitionOnChange
					>
						{!isScoreboardPage && <Header user={session?.user} />}
						<main className="flex-1">{children}</main>
						{!isScoreboardPage && <Footer />}
						<Toaster />
					</ThemeProvider>
				</SessionProvider>
			</body>
		</html>
	);
}
