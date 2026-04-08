import { CheckCircle2, Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblemRanking, getProblemStats } from "@/actions/problem-stats";
import { getProblemById } from "@/actions/problems";
import { getSubmissions, getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProblemTypeBadges } from "@/components/problems/problem-type-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProblemDetailClient } from "./problem-detail-client";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const problem = await getProblemById(parseInt(id, 10));

	if (!problem) {
		return { title: "문제를 찾을 수 없음" };
	}

	return {
		title: problem.title,
		description: `문제 ${problem.id}: ${problem.title}`,
	};
}

export default async function ProblemDetailPage({ params }: Props) {
	const { id } = await params;
	const problemId = parseInt(id, 10);
	const problem = await getProblemById(problemId);
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	if (!problem) {
		notFound();
	}

	// Parallel data fetch
	const [stats, mySubmissionsResult, allSubmissionsResult, rankingsResult, userStatus] =
		await Promise.all([
			getProblemStats(problemId),
			currentUserId
				? getSubmissions({
						problemId,
						userId: currentUserId,
						limit: 20,
						sort: "createdAt",
						order: "desc",
					})
				: Promise.resolve({ submissions: [], total: 0 }),
			getSubmissions({
				problemId,
				limit: 20,
				sort: "createdAt",
				order: "desc",
			}),
			getProblemRanking(problemId, { sortBy: "executionTime", page: 1, limit: 20 }),
			currentUserId
				? getUserProblemStatuses([problemId], currentUserId)
				: Promise.resolve(new Map()),
		]);

	const status = userStatus.get(problemId);
	const isSolved = status?.solved ?? false;
	const score = status?.score ?? null;

	// Problem header (server-rendered, passed as slot)
	const problemHeader = (
		<div>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-2 text-muted-foreground mb-2">
						<span className="font-mono">#{problem.id}</span>
					</div>
					<div className="flex items-center gap-3">
						<CardTitle className="text-2xl">
							<MarkdownRenderer content={problem.title} inline />
						</CardTitle>
						<ProblemTypeBadges
							type={problem.problemType}
							judgeAvailable={problem.judgeAvailable}
							languageRestricted={problem.allowedLanguages !== null}
						/>
						{isAdmin && !problem.isPublic && (
							<Badge variant="secondary" className="text-xs">
								비공개
							</Badge>
						)}
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
				stats={stats}
				mySubmissions={mySubmissionsResult.submissions}
				allSubmissions={allSubmissionsResult}
				rankings={rankingsResult}
				currentUserId={currentUserId}
				isAdmin={isAdmin}
			>
				{problemHeader}
			</ProblemDetailClient>
		</div>
	);
}
