import { ArrowRight, Code2, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const features = [
	{
		icon: Code2,
		title: "다양한 프로그래밍 언어",
		description: "C, C++, Python, Java 등 다양한 언어로 문제를 풀 수 있습니다.",
	},
	{
		icon: Zap,
		title: "실시간 채점",
		description: "제출 즉시 자동으로 채점되며, 실시간으로 결과를 확인할 수 있습니다.",
	},
	{
		icon: Trophy,
		title: "대회 기능",
		description: "교내 프로그래밍 대회를 위한 스코어보드와 순위 시스템을 제공합니다.",
	},
	{
		icon: Users,
		title: "커뮤니티",
		description: "다른 참가자들과 함께 문제를 풀고 실력을 향상시킬 수 있습니다.",
	},
];

export default async function HomePage() {
	const session = await auth();

	return (
		<div className="flex flex-col">
			{/* Hero Section */}
			<section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-primary/5 to-background">
				<div className="absolute inset-0 bg-grid-pattern opacity-5" />
				<div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
					<div className="text-center">
						<h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
							<span className="text-primary">ANA</span> Online Judge
						</h1>
						<p className="mt-6 text-lg leading-8 text-muted-foreground max-w-2xl mx-auto">
							교내 프로그래밍 대회를 위한 현대적이고 안정적인 온라인 저지 시스템입니다. 다양한
							문제를 풀고 실력을 향상시키세요.
						</p>
						<div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
							<Button size="lg" asChild>
								<Link href="/problems">
									문제 풀기
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button size="lg" variant="secondary" asChild>
								<Link href="/anigma">
									ANIGMA 알아보기
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							{!session && (
								<Button variant="outline" size="lg" asChild>
									<Link href="/register">회원가입</Link>
								</Button>
							)}
							{session && (
								<Button variant="outline" size="lg" asChild>
									<Link href="/contests">대회 목록</Link>
								</Button>
							)}
						</div>
					</div>
				</div>
			</section>

			{/* Stats Section */}
			<section className="border-y bg-muted/30">
				<div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
					<div className="grid grid-cols-2 gap-8 md:grid-cols-4">
						<div className="text-center">
							<div className="text-3xl font-bold text-primary">100+</div>
							<div className="mt-1 text-sm text-muted-foreground">문제</div>
						</div>
						<div className="text-center">
							<div className="text-3xl font-bold text-primary">500+</div>
							<div className="mt-1 text-sm text-muted-foreground">사용자</div>
						</div>
						<div className="text-center">
							<div className="text-3xl font-bold text-primary">10,000+</div>
							<div className="mt-1 text-sm text-muted-foreground">제출</div>
						</div>
						<div className="text-center">
							<div className="text-3xl font-bold text-primary">4</div>
							<div className="mt-1 text-sm text-muted-foreground">지원 언어</div>
						</div>
					</div>
				</div>
			</section>

			{/* Features Section */}
			<section className="py-24">
				<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
					<div className="text-center">
						<h2 className="text-3xl font-bold tracking-tight">주요 기능</h2>
						<p className="mt-4 text-lg text-muted-foreground">
							AOJ가 제공하는 다양한 기능을 확인해보세요.
						</p>
					</div>
					<div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
						{features.map((feature) => (
							<Card
								key={feature.title}
								className="border-2 hover:border-primary/50 transition-colors"
							>
								<CardHeader>
									<feature.icon className="h-10 w-10 text-primary" />
									<CardTitle className="mt-4">{feature.title}</CardTitle>
								</CardHeader>
								<CardContent>
									<CardDescription className="text-base">{feature.description}</CardDescription>
								</CardContent>
							</Card>
						))}
					</div>
				</div>
			</section>

			{/* CTA Section */}
			<section className="bg-primary text-primary-foreground">
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
					<div className="text-center">
						<h2 className="text-3xl font-bold tracking-tight">지금 바로 시작하세요</h2>
						<p className="mt-4 text-lg opacity-90">
							{session
								? "다양한 문제를 풀며 실력을 향상시키세요."
								: "무료로 가입하고 프로그래밍 실력을 향상시키세요."}
						</p>
						<div className="mt-8">
							<Button size="lg" variant="secondary" asChild>
								{session ? (
									<Link href="/problems">
										문제 풀러 가기
										<ArrowRight className="ml-2 h-4 w-4" />
									</Link>
								) : (
									<Link href="/register">
										무료로 시작하기
										<ArrowRight className="ml-2 h-4 w-4" />
									</Link>
								)}
							</Button>
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
