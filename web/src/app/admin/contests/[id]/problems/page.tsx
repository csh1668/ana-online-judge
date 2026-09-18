import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { ContestProblemManager } from "@/components/contests/contest-problem-manager";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";

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
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "대회", href: "/admin/contests" },
				{ label: contest.title, href: `/admin/contests/${contestId}` },
				{ label: "문제" },
			]}
		>
			<Card>
				<PageHeader title={`${contest.title} - 문제 관리`} />
				<CardContent>
					<ContestProblemManager contestId={contestId} problems={contest.problems} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
