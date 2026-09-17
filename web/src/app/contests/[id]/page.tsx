import { Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById, isUserContestOperator, isUserRegistered } from "@/actions/contests";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ContestStatusBadge } from "@/components/contests/contest-status-badge";
import { ContestTime } from "@/components/contests/contest-time";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { UserNameDisplay } from "@/components/user-name-display";
import { getContestStatus } from "@/lib/contest-utils";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const contest = await getContestById(Number.parseInt(id, 10));

	if (!contest) {
		return {
			title: "대회를 찾을 수 없습니다",
		};
	}

	return {
		title: contest.title,
		description: contest.description || undefined,
	};
}

export default async function ContestDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const contestId = Number.parseInt(id, 10);
	const contest = await getContestById(contestId);

	if (!contest) {
		notFound();
	}

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const isRegistered = session?.user?.id
		? await isUserRegistered(contestId, parseInt(session.user.id, 10))
		: false;
	const isOperator = session?.user?.id
		? await isUserContestOperator(contestId, parseInt(session.user.id, 10))
		: false;
	const isStaff = isAdmin || isOperator;

	const status = getContestStatus(contest);

	// Get user's problem statuses if logged in
	const userProblemStatuses =
		session?.user?.id && isRegistered
			? await getUserProblemStatuses(
					contest.problems.map((p) => p.problem.id),
					parseInt(session.user.id, 10),
					contestId
				)
			: new Map<number, { solved: boolean; score: number | null }>();

	return (
		<PageShell breadcrumb={[{ label: "대회", href: "/contests" }, { label: contest.title }]}>
			{/* Contest Header */}
			<Card>
				<PageHeader
					title={contest.title}
					meta={<ContestStatusBadge status={status} />}
					description={contest.description || undefined}
					actions={
						isAdmin ? (
							<Button variant="ghost" size="icon" asChild>
								<Link href={`/admin/contests/${contestId}`} aria-label="관리자 페이지">
									<Pencil className="h-4 w-4" />
								</Link>
							</Button>
						) : undefined
					}
				/>
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<p className="text-sm text-muted-foreground">시작 시간</p>
							<p className="font-medium">
								<ContestTime date={contest.startTime} />
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">종료 시간</p>
							<p className="font-medium">
								<ContestTime date={contest.endTime} />
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">패널티</p>
							<p className="font-medium">{contest.penaltyMinutes}분</p>
						</div>
						{contest.freezeMinutes && (
							<div>
								<p className="text-sm text-muted-foreground">프리즈</p>
								<p className="font-medium">종료 {contest.freezeMinutes}분 전</p>
							</div>
						)}
					</div>

					{contest.operators.length > 0 && (
						<div className="mt-6">
							<p className="text-sm text-muted-foreground">운영진</p>
							<div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
								{contest.operators.map((op) => (
									<UserNameDisplay key={op.userId} user={op.user} withLink />
								))}
							</div>
						</div>
					)}

					<div className="mt-6 flex gap-2">
						{!isRegistered && status !== "finished" && !isStaff && (
							<form action={`/api/contests/${contestId}/register`} method="POST">
								<Button type="submit">대회 등록</Button>
							</form>
						)}
						{(isRegistered || isStaff || status === "finished") && (
							<Link href={`/contests/${contestId}/scoreboard`}>
								<Button variant="outline">스코어보드</Button>
							</Link>
						)}
						{isStaff && (
							<Link href={`/contests/${contestId}/scoreboard?award=true`}>
								<Button variant="outline">스코어보드 (시상 모드)</Button>
							</Link>
						)}
						{isRegistered && (
							<Link href={`/contests/${contestId}/my-submissions`}>
								<Button variant="outline">내 제출</Button>
							</Link>
						)}
					</div>
				</CardContent>
			</Card>

			{/* Problems */}
			{(status !== "upcoming" || isStaff) && (
				<Card>
					<CardHeader>
						<CardTitle>문제 목록</CardTitle>
					</CardHeader>
					<CardContent>
						{contest.problems.length === 0 ? (
							<EmptyState>등록된 문제가 없습니다.</EmptyState>
						) : (
							<Table className="min-w-[640px]">
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">번호</TableHead>
										<TableHead>제목</TableHead>
										<TableHead className="w-[100px] text-right">배점</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{contest.problems.map((cp) => {
										const problemStatus = userProblemStatuses.get(cp.problem.id);
										const isSolved = problemStatus?.solved ?? false;
										const score = problemStatus?.score;

										return (
											<TableRow key={cp.id}>
												<TableCell className="font-mono font-bold">{cp.label}</TableCell>
												<TableCell>
													<ProblemTitleCell
														href={
															(isRegistered || isStaff) && status !== "finished"
																? `/contests/${contestId}/problems/${cp.label}`
																: `/problems/${cp.problem.id}`
														}
														title={cp.problem.title}
														problemType={cp.problem.problemType}
														judgeAvailable={cp.problem.judgeAvailable}
														languageRestricted={cp.problem.languageRestricted}
														hasSubtasks={cp.problem.hasSubtasks}
														useFullJudge={cp.problem.useFullJudge}
														isSolved={isSolved}
														score={score}
														tier={cp.problem.tier}
													/>
												</TableCell>
												<TableCell className="text-right">{cp.problem.maxScore}</TableCell>
											</TableRow>
										);
									})}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			)}
		</PageShell>
	);
}
