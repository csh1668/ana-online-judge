import { ArrowRight, Clock, Code2, Lightbulb, Terminal, Trophy } from "lucide-react";
import Link from "next/link";
import { getActiveContestsForHome, getHomeStats, getUpcomingContestsForHome } from "@/actions/home";
import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format-date";

function formatTimeLeft(end: Date) {
	const diff = end.getTime() - Date.now();
	const hours = Math.floor(diff / (1000 * 60 * 60));
	const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
	if (hours > 0) return `${hours}시간 ${minutes}분 남음`;
	return `${minutes}분 남음`;
}

const QUICK_LINKS = [
	{ href: "/problems", icon: Terminal, title: "문제", desc: "다양한 문제를 풀어보세요" },
	{ href: "/contests", icon: Trophy, title: "대회", desc: "프로그래밍 대회에 참가하세요" },
	{
		href: "/playground",
		icon: Code2,
		title: "플레이그라운드",
		desc: "코드를 작성하고 실행해보세요",
	},
	{
		href: "/workshop",
		icon: Lightbulb,
		title: "창작마당",
		desc: "문제를 직접 만들고 업로드하세요",
	},
] as const;

export default async function HomePage() {
	const [session, stats, activeContests, upcomingContests] = await Promise.all([
		auth(),
		getHomeStats(),
		getActiveContestsForHome(),
		getUpcomingContestsForHome(),
	]);

	const statItems = [
		{ label: "공개 문제", value: stats.problems },
		{ label: "등록 사용자", value: stats.users },
		{ label: "총 제출", value: stats.submissions },
	];

	return (
		<div className="flex flex-col">
			{/* Hero */}
			<section className="border-b border-border">
				<div className="page-container py-12 sm:py-16">
					<div className="flex flex-col gap-6">
						<h1 className="font-mulmaru text-3xl font-bold tracking-tight sm:text-5xl">
							<span className="text-[#02CDB7]">A</span>
							<span className="text-[#455D8D]">N</span>
							<span className="text-[#EA4C5A]">A</span>
							<span className="text-primary">{` Online Judge`}</span>
						</h1>
						<p className="max-w-xl text-lg text-muted-foreground">
							프로그래밍 문제를 풀거나 만들어보세요
						</p>
						<div className="flex flex-wrap items-center gap-3">
							<Button size="lg" asChild>
								<Link href="/problems">
									문제 목록
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
							<Button variant="outline" size="lg" asChild>
								<Link href={session ? "/submissions?me=true" : "/login"}>
									{session ? "내 제출" : "로그인"}
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

			<section>
				<div className="page-container space-y-6 py-8 sm:py-10">
					{/* 진행중인 대회 */}
					{activeContests.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<span className="size-2 rounded-full bg-(--verdict-accepted) animate-pulse" />
									진행중인 대회
								</CardTitle>
							</CardHeader>
							<CardContent>
								<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
									{activeContests.map((contest) => (
										<Link
											key={contest.id}
											href={`/contests/${contest.id}`}
											className="group flex items-start justify-between gap-4 rounded-[2px] border border-border p-4 transition-shadow hover:shadow-md"
										>
											<div className="min-w-0">
												<div className="truncate font-medium transition-colors group-hover:text-accent">
													{contest.title}
												</div>
												<div className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
													<Clock className="h-3 w-3" />
													{formatTimeLeft(contest.endTime)}
												</div>
											</div>
											<ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent" />
										</Link>
									))}
								</div>
							</CardContent>
						</Card>
					)}

					{/* 현황 띠 */}
					<Card variant="accent" className="py-0">
						<dl className="grid grid-cols-3 divide-x divide-border" aria-label="사이트 현황">
							{statItems.map((item) => (
								<div key={item.label} className="px-5 py-5 sm:py-6">
									<dt className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
										{item.label}
									</dt>
									<dd className="mt-1 font-mulmaru text-3xl font-extrabold tabular-nums sm:text-5xl">
										{item.value.toLocaleString()}
									</dd>
								</div>
							))}
						</dl>
					</Card>

					{/* 바로가기 */}
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						{QUICK_LINKS.map((q) => (
							<Link key={q.href} href={q.href} className="group block">
								<Card className="h-full transition-shadow hover:shadow-lg">
									<CardContent className="flex items-start gap-4">
										<div className="flex size-10 shrink-0 items-center justify-center rounded-[2px] bg-secondary text-primary">
											<q.icon className="h-5 w-5" />
										</div>
										<div className="min-w-0">
											<div className="font-semibold transition-colors group-hover:text-accent">
												{q.title}
											</div>
											<div className="mt-1 text-sm text-muted-foreground">{q.desc}</div>
										</div>
									</CardContent>
								</Card>
							</Link>
						))}
					</div>

					{/* 예정된 대회 */}
					{upcomingContests.length > 0 && (
						<Card>
							<CardHeader>
								<CardTitle>예정된 대회</CardTitle>
							</CardHeader>
							<CardContent>
								<ul className="divide-y divide-border">
									{upcomingContests.map((contest) => (
										<li key={contest.id}>
											<Link
												href={`/contests/${contest.id}`}
												className="group flex items-center justify-between gap-4 py-3"
											>
												<span className="truncate font-medium transition-colors group-hover:text-accent">
													{contest.title}
												</span>
												<span className="shrink-0 font-mono text-xs text-muted-foreground">
													{formatDateTime(contest.startTime)}
												</span>
											</Link>
										</li>
									))}
								</ul>
							</CardContent>
						</Card>
					)}
				</div>
			</section>
		</div>
	);
}
