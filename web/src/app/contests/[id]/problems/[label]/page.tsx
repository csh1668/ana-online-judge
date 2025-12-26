import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { getContestById } from "@/actions/contests";
import { getProblemById } from "@/actions/problems";
import { ProblemSubmitSection } from "@/app/problems/[id]/submit-section";
import { Badge } from "@/components/ui/badge";
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
					<div className="prose prose-sm max-w-none dark:prose-invert">
						<ReactMarkdown>{problem.content}</ReactMarkdown>
					</div>
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
