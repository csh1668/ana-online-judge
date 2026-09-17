import { notFound } from "next/navigation";
import { getProblemSet } from "@/actions/problem-sets";
import { getProblems } from "@/actions/problems";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { PageShell } from "@/components/layout/page-shell";
import { ProblemSetDetailHeader } from "@/components/problem-sets/problem-set-detail-header";
import { ProblemListTable } from "@/components/problems/problem-list-table";
import { Card, CardContent } from "@/components/ui/card";

export default async function ProblemSetDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const numId = Number.parseInt(id, 10);
	if (Number.isNaN(numId)) notFound();

	const session = await auth();
	const viewerId = session?.user?.id ? Number.parseInt(session.user.id, 10) : undefined;
	const role = (session?.user as { role?: "user" | "admin" } | undefined)?.role;
	const isLoggedIn = !!viewerId;

	const detail = await getProblemSet(numId);
	if (!detail) notFound();

	const canEdit = !!viewerId && (viewerId === detail.creator.id || role === "admin");

	const orderedIds = detail.items.map((it) => it.problem.id);
	const [{ problems: problemRows }, userProblemStatuses] = await Promise.all([
		orderedIds.length > 0
			? getProblems({
					ids: orderedIds,
					userId: viewerId,
					includeUnavailable: true,
					limit: orderedIds.length,
				})
			: Promise.resolve({ problems: [], total: 0 }),
		viewerId
			? getUserProblemStatuses(orderedIds, viewerId)
			: Promise.resolve(new Map<number, { solved: boolean; score: number | null }>()),
	]);

	// problem-set 순서대로 정렬
	const orderIndex = new Map(orderedIds.map((pid, idx) => [pid, idx]));
	const orderedProblems = [...problemRows].sort(
		(a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0)
	);

	return (
		<PageShell
			breadcrumb={[{ label: "문제집", href: "/problemsets" }, { label: detail.set.title }]}
		>
			<Card>
				<ProblemSetDetailHeader detail={detail} canEdit={canEdit} isLoggedIn={isLoggedIn} />
				<CardContent>
					<ProblemListTable
						problems={orderedProblems}
						userProblemStatuses={userProblemStatuses}
						emptyLabel="문제가 없습니다."
					/>
				</CardContent>
			</Card>
		</PageShell>
	);
}
