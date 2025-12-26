import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { ContestProblemManager } from "@/components/contests/contest-problem-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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
		title: `${contest.title} - 문제 관리`,
	};
}

export default async function ContestProblemsPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const contestId = Number.parseInt(id, 10);
	const contest = await getContestById(contestId);

	if (!contest) {
		notFound();
	}

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">{contest.title} - 문제 관리</CardTitle>
				</CardHeader>
				<CardContent>
					<ContestProblemManager contestId={contestId} problems={contest.problems} />
				</CardContent>
			</Card>
		</div>
	);
}
