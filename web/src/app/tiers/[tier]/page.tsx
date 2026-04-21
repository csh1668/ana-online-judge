import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ProblemListTable } from "@/components/problems/problem-list-table";
import { TierBadge } from "@/components/tier/tier-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
	listProblemsByTier,
	PROBLEM_BY_TIER_SORT_KEYS,
	type ProblemByTierSort,
} from "@/lib/services/problem-tier";
import { tierLabel } from "@/lib/tier";

interface Props {
	params: Promise<{ tier: string }>;
	searchParams: Promise<{
		sort?: string;
		order?: string;
		page?: string;
	}>;
}

function parseTier(raw: string): number | null {
	const n = parseInt(raw, 10);
	if (Number.isNaN(n)) return null;
	if (n < -1 || n > 30) return null;
	return n;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { tier } = await params;
	const t = parseTier(tier);
	if (t === null) return { title: "난이도 없음" };
	return { title: `${tierLabel(t, "problem")} — 난이도 분류` };
}

export default async function TierDetailPage({ params, searchParams }: Props) {
	const { tier } = await params;
	const tierNum = parseTier(tier);
	if (tierNum === null) notFound();

	const sp = await searchParams;
	const sort = (PROBLEM_BY_TIER_SORT_KEYS as readonly string[]).includes(sp.sort ?? "")
		? (sp.sort as ProblemByTierSort)
		: "solverCount";
	const order: "asc" | "desc" = sp.order === "asc" ? "asc" : "desc";
	const page = Math.max(1, parseInt(sp.page ?? "1", 10));
	const limit = 100;

	const session = await auth();
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	const { problems, total } = await listProblemsByTier(tierNum, { sort, order, page, limit });

	const userStatuses = currentUserId
		? await getUserProblemStatuses(
				problems.map((p) => p.id),
				currentUserId
			)
		: new Map<number, { solved: boolean; score: number | null }>();

	const totalPages = Math.max(1, Math.ceil(total / limit));

	function buildHref(p: number) {
		const next = new URLSearchParams();
		if (sort !== "solverCount") next.set("sort", sort);
		if (order !== "desc") next.set("order", order);
		if (p !== 1) next.set("page", String(p));
		const qs = next.toString();
		return qs ? `/tiers/${tierNum}?${qs}` : `/tiers/${tierNum}`;
	}

	const label = tierLabel(tierNum, "problem");
	const breadcrumbItems = [{ label: "난이도 분류", href: "/tiers" }, { label }];

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={breadcrumbItems} />
			<Card>
				<CardHeader className="pb-6">
					<CardTitle className="flex items-center gap-2 text-2xl">
						<TierBadge tier={tierNum} kind="problem" size="lg" showTooltip={false} />
						<span>{label}</span>
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div>
						<h2 className="text-lg font-semibold mb-2">문제 ({total})</h2>
						<ProblemListTable
							problems={problems}
							userProblemStatuses={userStatuses}
							sortable
							emptyLabel="이 난이도의 문제가 없습니다."
						/>
						{problems.length > 0 && (
							<PaginationLinks currentPage={page} totalPages={totalPages} buildHref={buildHref} />
						)}
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
