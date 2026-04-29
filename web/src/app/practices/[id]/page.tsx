import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPracticeById, getPracticeScoreboard } from "@/actions/practices";
import type { GetScoreboardReturn } from "@/actions/scoreboard";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ContestTime } from "@/components/contests/contest-time";
import { Scoreboard } from "@/components/contests/scoreboard";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getPracticeStatus } from "@/lib/practice-utils";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const practice = await getPracticeById(Number.parseInt(id, 10));
	if (!practice) return { title: "연습을 찾을 수 없습니다" };
	return { title: practice.title, description: practice.description ?? undefined };
}

function StatusBadge({ status }: { status: ReturnType<typeof getPracticeStatus> }) {
	if (status === "upcoming") return <Badge variant="secondary">예정</Badge>;
	if (status === "running") return <Badge variant="default">진행중</Badge>;
	return <Badge variant="outline">종료</Badge>;
}

export default async function PracticeDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const practiceId = Number.parseInt(id, 10);
	const practice = await getPracticeById(practiceId);
	if (!practice) notFound();

	const session = await auth();
	const userId = session?.user?.id ? Number.parseInt(session.user.id, 10) : null;
	const currentUserId = userId;
	const isAdmin = session?.user?.role === "admin";
	const isOwner = userId !== null && practice.createdBy === userId;
	const status = getPracticeStatus(practice);

	const [problemStatuses, sbData] = await Promise.all([
		userId !== null
			? getUserProblemStatuses(
					practice.problems.map((p) => p.problem.id),
					userId
				)
			: Promise.resolve(new Map<number, { solved: boolean; score: number | null }>()),
		getPracticeScoreboard(practiceId),
	]);

	const adaptedScoreboard: GetScoreboardReturn = {
		contest: {
			id: practice.id,
			title: practice.title,
			description: practice.description,
			startTime: practice.startTime,
			endTime: practice.endTime,
			freezeMinutes: 0,
			isFrozen: false,
			visibility: "public",
			scoreboardType: "basic",
			penaltyMinutes: practice.penaltyMinutes,
			sourceId: null,
			createdAt: practice.createdAt,
			updatedAt: practice.updatedAt,
		},
		scoreboard: sbData.scoreboard,
		isFrozen: false,
	};

	return (
		<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-4 py-8">
			<PageBreadcrumb items={[{ label: "연습", href: "/practices" }, { label: practice.title }]} />
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between gap-3">
						<div className="flex items-center gap-3 min-w-0">
							<CardTitle className="text-2xl truncate">{practice.title}</CardTitle>
							<StatusBadge status={status} />
						</div>
						{(isOwner || isAdmin) && (
							<Button variant="ghost" size="icon" asChild>
								<Link href={`/practices/${practiceId}/edit`} aria-label="편집">
									<Pencil className="h-4 w-4" />
								</Link>
							</Button>
						)}
					</div>
					{practice.description && <CardDescription>{practice.description}</CardDescription>}
					<div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground pt-2">
						<span>
							시작: <ContestTime date={practice.startTime} />
						</span>
						<span>
							종료: <ContestTime date={practice.endTime} />
						</span>
					</div>
				</CardHeader>
				<CardContent>
					<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
						<aside className="space-y-2">
							<h2 className="text-sm font-semibold text-muted-foreground">문제</h2>
							{practice.problems.length === 0 ? (
								<div className="rounded-md border py-6 text-center text-sm text-muted-foreground">
									등록된 문제가 없습니다.
								</div>
							) : (
								<ol className="rounded-md border divide-y">
									{practice.problems.map((pp) => {
										const ps = problemStatuses.get(pp.problem.id);
										return (
											<li key={pp.id} className="flex items-center gap-2 px-2 py-2">
												<span className="font-mono text-sm font-bold w-6 text-center text-muted-foreground">
													{pp.label}
												</span>
												<div className="flex-1 min-w-0">
													<ProblemTitleCell
														href={`/problems/${pp.problem.id}`}
														title={pp.problem.title}
														problemType={pp.problem.problemType}
														judgeAvailable={pp.problem.judgeAvailable}
														languageRestricted={pp.problem.languageRestricted}
														hasSubtasks={pp.problem.hasSubtasks}
														isSolved={ps?.solved ?? false}
														score={ps?.score}
														tier={pp.problem.tier}
													/>
												</div>
											</li>
										);
									})}
								</ol>
							)}
						</aside>
						<section className="min-w-0">
							<h2 className="text-sm font-semibold text-muted-foreground mb-2">스코어보드</h2>
							<Scoreboard
								data={adaptedScoreboard}
								currentUserId={currentUserId}
								isAdmin={isAdmin}
							/>
						</section>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
