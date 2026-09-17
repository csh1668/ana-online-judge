import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPracticeById, getPracticeScoreboard } from "@/actions/practices";
import type { GetScoreboardReturn } from "@/actions/scoreboard";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ContestStatusBadge } from "@/components/contests/contest-status-badge";
import { ContestTime } from "@/components/contests/contest-time";
import { Scoreboard } from "@/components/contests/scoreboard";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
			visibility: "public",
			scoreboardType: "basic",
			postContestVisibility: "public",
			penaltyMinutes: practice.penaltyMinutes,
			sourceId: null,
			createdAt: practice.createdAt,
			updatedAt: practice.updatedAt,
		},
		scoreboard: sbData.scoreboard,
		isFrozen: false,
	};

	return (
		<PageShell breadcrumb={[{ label: "연습", href: "/practices" }, { label: practice.title }]}>
			<Card>
				<PageHeader
					title={practice.title}
					meta={<ContestStatusBadge status={status} />}
					description={
						<>
							{practice.description && <span className="block">{practice.description}</span>}
							<span className="block">
								시작: <ContestTime date={practice.startTime} /> · 종료:{" "}
								<ContestTime date={practice.endTime} />
							</span>
						</>
					}
					actions={
						isOwner || isAdmin ? (
							<Button variant="ghost" size="icon" asChild>
								<Link href={`/practices/${practiceId}/edit`} aria-label="편집">
									<Pencil className="h-4 w-4" />
								</Link>
							</Button>
						) : undefined
					}
				/>
				<CardContent>
					<div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
						<aside className="space-y-2">
							<h3 className="text-sm font-semibold">문제</h3>
							{practice.problems.length === 0 ? (
								<div className="rounded-[2px] border border-border py-6 text-center text-sm text-muted-foreground">
									등록된 문제가 없습니다.
								</div>
							) : (
								<ol className="rounded-[2px] border border-border divide-y">
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
														useFullJudge={pp.problem.useFullJudge}
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
							<h3 className="text-sm font-semibold mb-2">스코어보드</h3>
							<Scoreboard
								data={adaptedScoreboard}
								currentUserId={currentUserId}
								isAdmin={isAdmin}
							/>
						</section>
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
