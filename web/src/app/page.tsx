import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import { ArrowRight, Clock, Terminal, Trophy } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { db } from "@/db";
import { contests, problems, submissions, users } from "@/db/schema";

async function getStats() {
	const [problemCount, userCount, submissionCount] = await Promise.all([
		db.select({ count: count() }).from(problems).where(eq(problems.isPublic, true)),
		db.select({ count: count() }).from(users),
		db.select({ count: count() }).from(submissions),
	]);
	return {
		problems: problemCount[0].count,
		users: userCount[0].count,
		submissions: submissionCount[0].count,
	};
}

async function getActiveContests() {
	const now = new Date();
	const activeContests = await db
		.select()
		.from(contests)
		.where(and(lte(contests.startTime, now), gte(contests.endTime, now)))
		.orderBy(desc(contests.startTime))
		.limit(3);
	return activeContests;
}

async function getUpcomingContests() {
	const now = new Date();
	const upcoming = await db
		.select()
		.from(contests)
		.where(gte(contests.startTime, now))
		.orderBy(contests.startTime)
		.limit(3);
	return upcoming;
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("ko-KR", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function formatTimeLeft(end: Date) {
	const diff = end.getTime() - Date.now();
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
	return `${minutes}분 남음`;
}

export default async function HomePage() {
	const [session, stats, activeContests, upcomingContests] = await Promise.all([
		auth(),
		getStats(),
		getActiveContests(),
		getUpcomingContests(),
	]);

	return (
		<div className="flex flex-col">
			{/* Hero */}
			<section className="border-b">
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
					<div className="flex flex-col gap-6">
						<h1 className="text-3xl font-bold tracking-tight sm:text-5xl font-mulmaru">
							<span className=" text-primary">ANA</span> Online Judge
						</h1>
						<p className="text-lg text-muted-foreground max-w-xl">교내 프로그래밍 대회 플랫폼</p>
						<div className="flex items-center gap-3 flex-wrap">
							<Link href="/problems">
								<Button size="lg">
									문제 풀기
									<ArrowRight className="ml-2 h-4 w-4" />
								</Button>
							</Link>
							{!session && (
								<Link href="/login">
									<Button variant="outline" size="lg">
										로그인
									</Button>
								</Link>
							)}
							{session && (
								<Link href="/submissions">
									<Button variant="outline" size="lg">
										내 제출
									</Button>
								</Link>
							)}
						</div>
					</div>
				</div>
			</section>

			{/* Active Contests */}
			{activeContests.length > 0 && (
				<section className="border-b bg-primary/5">
					<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
						<div className="flex items-center gap-2 mb-4">
							<div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
							<h2 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground">
								진행중인 대회
							</h2>
						</div>
						<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{activeContests.map((contest) => (
								<Link
									key={contest.id}
									href={`/contests/${contest.id}`}
									className="group flex items-start justify-between gap-4 rounded-lg border bg-card p-4 transition-colors hover:border-primary/50"
								>
									<div className="min-w-0">
										<div className="font-medium truncate group-hover:text-primary transition-colors">
											{contest.title}
										</div>
										<div className="text-sm text-muted-foreground mt-1 flex items-center gap-1">
											<Clock className="h-3 w-3" />
											{formatTimeLeft(contest.endTime)}
										</div>
									</div>
									<ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1 group-hover:text-primary transition-colors" />
								</Link>
							))}
						</div>
					</div>
				</section>
			)}

			{/* Main Content */}
			<section>
				<div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
					<div className="grid gap-8 lg:grid-cols-3">
						{/* Quick Nav */}
						<div className="lg:col-span-2 grid gap-4 sm:grid-cols-2">
							<Link
								href="/problems"
								className="group flex items-start gap-4 rounded-lg border p-5 transition-colors hover:border-primary/50"
							>
								<div className="rounded-md bg-primary/10 p-2">
									<Terminal className="h-5 w-5 text-primary" />
								</div>
								<div>
									<div className="font-semibold group-hover:text-primary transition-colors">
										문제
									</div>
									<div className="text-sm text-muted-foreground mt-1">
										{stats.problems}개의 문제를 풀어보세요
									</div>
								</div>
							</Link>
							<Link
								href="/contests"
								className="group flex items-start gap-4 rounded-lg border p-5 transition-colors hover:border-primary/50"
							>
								<div className="rounded-md bg-primary/10 p-2">
									<Trophy className="h-5 w-5 text-primary" />
								</div>
								<div>
									<div className="font-semibold group-hover:text-primary transition-colors">
										대회
									</div>
									<div className="text-sm text-muted-foreground mt-1">
										프로그래밍 대회에 참가하세요
									</div>
								</div>
							</Link>
							<Link
								href="/anigma"
								className="group flex items-start gap-4 rounded-lg border border-accent/30 p-5 transition-colors hover:border-accent/60 sm:col-span-2"
							>
								<div className="rounded-md bg-accent/10 p-2">
									<span className="text-accent text-lg font-bold leading-none block w-5 h-5 text-center">
										?
									</span>
								</div>
								<div>
									<div className="font-semibold group-hover:text-accent transition-colors">
										ANIGMA
									</div>
									<div className="text-sm text-muted-foreground mt-1">
										차별화된 입력을 찾고, 코드를 분석하는 새로운 유형의 문제
									</div>
								</div>
							</Link>
						</div>

						{/* Sidebar */}
						<div className="space-y-6">
							{/* Stats */}
							<div className="rounded-lg border p-5">
								<h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
									현황
								</h3>
								<div className="space-y-3">
									<div className="flex justify-between items-baseline">
										<span className="text-sm text-muted-foreground">공개 문제</span>
										<span className="font-semibold tabular-nums">{stats.problems}</span>
									</div>
									<div className="flex justify-between items-baseline">
										<span className="text-sm text-muted-foreground">등록 사용자</span>
										<span className="font-semibold tabular-nums">{stats.users}</span>
									</div>
									<div className="flex justify-between items-baseline">
										<span className="text-sm text-muted-foreground">총 제출</span>
										<span className="font-semibold tabular-nums">
											{stats.submissions.toLocaleString()}
										</span>
									</div>
								</div>
							</div>

							{/* Upcoming contests */}
							{upcomingContests.length > 0 && (
								<div className="rounded-lg border p-5">
									<h3 className="font-semibold text-sm uppercase tracking-wider text-muted-foreground mb-4">
										예정된 대회
									</h3>
									<div className="space-y-3">
										{upcomingContests.map((contest) => (
											<Link
												key={contest.id}
												href={`/contests/${contest.id}`}
												className="block group"
											>
												<div className="text-sm font-medium group-hover:text-primary transition-colors truncate">
													{contest.title}
												</div>
												<div className="text-xs text-muted-foreground mt-0.5">
													{formatDate(contest.startTime)}
												</div>
											</Link>
										))}
									</div>
								</div>
							)}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
}
