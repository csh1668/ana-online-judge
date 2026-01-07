import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById, isUserRegistered } from "@/actions/contests";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ContestTime } from "@/components/contests/contest-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
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

function getStatusBadge(status: string) {
	switch (status) {
		case "upcoming":
			return <Badge variant="secondary">예정</Badge>;
		case "running":
			return <Badge variant="default">진행중</Badge>;
		case "finished":
			return <Badge variant="outline">종료</Badge>;
		default:
			return null;
	}
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
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="space-y-6">
				{/* Contest Header */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="text-3xl">{contest.title}</CardTitle>
							{getStatusBadge(status)}
						</div>
						{contest.description && <CardDescription>{contest.description}</CardDescription>}
					</CardHeader>
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

						<div className="mt-6 flex gap-2">
							{!isRegistered && status !== "finished" && !isAdmin && (
								<form action={`/api/contests/${contestId}/register`} method="POST">
									<Button type="submit">대회 등록</Button>
								</form>
							)}
							{(isRegistered || isAdmin || status === "finished") && (
								<Link href={`/contests/${contestId}/scoreboard`}>
									<Button variant="outline">스코어보드</Button>
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
				{status !== "upcoming" && (
					<Card>
						<CardHeader>
							<CardTitle>문제 목록</CardTitle>
						</CardHeader>
						<CardContent>
							{contest.problems.length === 0 ? (
								<div className="text-center py-12 text-muted-foreground">
									등록된 문제가 없습니다.
								</div>
							) : (
								<div className="rounded-md border">
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead className="w-[80px]">번호</TableHead>
												<TableHead>제목</TableHead>
												<TableHead className="w-[120px]">유형</TableHead>
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
															<div className="flex items-center gap-2">
																{isRegistered ? (
																	<Link
																		href={`/contests/${contestId}/problems/${cp.label}`}
																		className="font-medium hover:text-primary transition-colors"
																	>
																		{cp.problem.title}
																	</Link>
																) : (
																	<span className="font-medium">{cp.problem.title}</span>
																)}
																{isSolved && (
																	<div className="flex items-center gap-1">
																		<CheckCircle2 className="h-4 w-4 text-green-600" />
																		{cp.problem.problemType === "anigma" && score !== null && (
																			<span className="text-sm text-muted-foreground">
																				{score}점
																			</span>
																		)}
																	</div>
																)}
															</div>
														</TableCell>
														<TableCell>
															<Badge variant="secondary">
																{cp.problem.problemType.toUpperCase()}
															</Badge>
														</TableCell>
														<TableCell className="text-right">{cp.problem.maxScore}</TableCell>
													</TableRow>
												);
											})}
										</TableBody>
									</Table>
								</div>
							)}
						</CardContent>
					</Card>
				)}
			</div>
		</div>
	);
}
