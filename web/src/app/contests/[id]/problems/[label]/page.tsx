import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { getProblemById } from "@/actions/problems";
import { ProblemSubmitSection } from "@/app/problems/[id]/submit-section";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

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

	const problem = await getProblemById(contestProblem.problem.id, contestId);

	if (!problem) {
		notFound();
	}

	return (
		<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-2xl">
							{label}. {problem.title}
						</CardTitle>
						<Badge variant="secondary">{problem.problemType.toUpperCase()}</Badge>
					</div>
					<div className="flex gap-4 text-sm text-muted-foreground mt-2">
						<span>시간 제한: {problem.timeLimit}ms</span>
						<span>메모리 제한: {problem.memoryLimit}MB</span>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					<MarkdownRenderer content={problem.content} />
					{problem.problemType === "anigma" && problem.referenceCodePath && (
						<>
							<Separator />
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
					<Separator />
					<ProblemSubmitSection
						problemId={problem.id}
						problemType={problem.problemType}
						allowedLanguages={problem.allowedLanguages}
						contestId={contestId}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
