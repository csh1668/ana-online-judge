import { CheckCircle2, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { getProblemRanking, getProblemStats } from "@/actions/problem-stats";
import { getProblemById } from "@/actions/problems";
import { getSubmissions, getUserProblemStatuses } from "@/actions/submissions";
import { ProblemDetailClient } from "@/app/problems/[id]/problem-detail-client";
import { auth } from "@/auth";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProblemTypeBadges } from "@/components/problems/problem-type-badges";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getContestStatus } from "@/lib/contest-utils";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string; label: string }>;
}): Promise<Metadata> {
	const { id, label } = await params;
	const contest = await getContestById(Number.parseInt(id, 10));

	if (!contest) {
		return {
			title: "대회를 찾을 수 없습니다",
		};
	}

	const contestProblem = contest.problems.find((cp) => cp.label === label);

	if (!contestProblem) {
		return {
			title: "문제를 찾을 수 없습니다",
		};
	}

	return {
		title: `${label}. ${contestProblem.problem.title} - ${contest.title}`,
	};
}

export default async function ContestProblemPage({
	params,
}: {
	params: Promise<{ id: string; label: string }>;
}) {
	const { id, label } = await params;
	const contestId = Number.parseInt(id, 10);
	const contest = await getContestById(contestId);

	if (!contest) {
		notFound();
	}

	const contestProblem = contest.problems.find((cp) => cp.label === label);

	if (!contestProblem) {
		notFound();
	}

	const status = getContestStatus(contest);

	// 대회가 시작 전(upcoming)이면 접근 불가
	if (status === "upcoming") {
		notFound();
	}

	const problem = await getProblemById(contestProblem.problem.id, contestId);

	if (!problem) {
		notFound();
	}

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	// 대회 진행 중 비관리자는 본인 데이터만 조회
	const hideOthers = status === "running" && !isAdmin;

	// Parallel data fetch (contest-scoped)
	const [stats, mySubmissionsResult, allSubmissionsResult, rankingsResult, userStatus] =
		await Promise.all([
			getProblemStats(problem.id, contestId),
			currentUserId
				? getSubmissions({
						problemId: problem.id,
						contestId,
						userId: currentUserId,
						limit: 20,
						sort: "createdAt",
						order: "desc",
					})
				: Promise.resolve({ submissions: [], total: 0 }),
			getSubmissions({
				problemId: problem.id,
				contestId,
				limit: 20,
				sort: "createdAt",
				order: "desc",
				...(hideOthers && currentUserId ? { userId: currentUserId } : {}),
			}),
			hideOthers
				? Promise.resolve({ rankings: [], total: 0 })
				: getProblemRanking(problem.id, {
						sortBy: "executionTime",
						page: 1,
						limit: 20,
						contestId,
					}),
			currentUserId
				? getUserProblemStatuses([problem.id], currentUserId, contestId)
				: Promise.resolve(new Map()),
		]);

	const userProblemStatus = userStatus.get(problem.id);
	const isSolved = userProblemStatus?.solved ?? false;
	const score = userProblemStatus?.score ?? null;

	const problemHeader = (
		<div>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-3">
						<CardTitle className="text-2xl">
							{label}. <MarkdownRenderer content={problem.title} inline />
						</CardTitle>
						<ProblemTypeBadges
							type={problem.problemType}
							judgeAvailable={problem.judgeAvailable}
							languageRestricted={problem.allowedLanguages !== null}
						/>
						{isSolved && (
							<div className="flex items-center gap-1">
								<CheckCircle2 className="h-5 w-5 text-green-600" />
								{problem.problemType === "anigma" && score !== null && (
									<span className="text-sm font-medium text-green-600">{score}점</span>
								)}
							</div>
						)}
					</div>
				</div>
			</div>
			{problem.problemType === "anigma" && problem.referenceCodePath && (
				<>
					<Separator className="my-4" />
					<div className="flex items-center justify-between p-4 border rounded-md bg-muted/10">
						<div>
							<p className="text-sm font-medium">문제 제공 코드 (Reference Code)</p>
							<p className="text-xs text-muted-foreground mt-1">
								ANIGMA 문제를 해결하기 위한 참조 코드를 다운로드하세요.
							</p>
						</div>
						<Button variant="outline" size="sm" asChild>
							<Link href={`/api/problems/${problem.id}/reference-code`}>
								<Download className="mr-2 h-4 w-4" />
								다운로드
							</Link>
						</Button>
					</div>
				</>
			)}
		</div>
	);

	return (
		<div className="py-8">
			<ProblemDetailClient
				problem={{
					id: problem.id,
					title: problem.title,
					content: problem.content,
					timeLimit: problem.timeLimit,
					memoryLimit: problem.memoryLimit,
					problemType: problem.problemType,
					judgeAvailable: problem.judgeAvailable,
					allowedLanguages: problem.allowedLanguages,
					isPublic: problem.isPublic,
				}}
				authors={problem.authors}
				reviewers={problem.reviewers}
				sources={problem.sources}
				stats={stats}
				mySubmissions={mySubmissionsResult.submissions}
				allSubmissions={allSubmissionsResult}
				rankings={rankingsResult}
				currentUserId={currentUserId}
				isAdmin={isAdmin}
				contestId={contestId}
				breadcrumbItems={[
					{ label: "대회", href: "/contests" },
					{ label: contest.title, href: `/contests/${contestId}` },
					{ label: `${label}. ${problem.title}` },
				]}
			>
				{problemHeader}
			</ProblemDetailClient>
		</div>
	);
}
