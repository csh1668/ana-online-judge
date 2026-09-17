import type { Metadata } from "next";
import Link from "next/link";
import { countPublicProblemsByTier } from "@/actions/tiers";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { TierBadge } from "@/components/tier/tier-badge";
import { Card, CardContent } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { tierLabel } from "@/lib/tier";

export const metadata: Metadata = {
	title: "난이도 분류",
};

// not_ratable(-1), unrated(0), Bronze V(1) ~ Ruby I(30)
const TIER_ORDER: number[] = [-1, 0, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export default async function TiersPage() {
	const counts = await countPublicProblemsByTier();

	return (
		<PageShell breadcrumb={[{ label: "난이도 분류" }]}>
			<Card>
				<PageHeader
					title="난이도 분류"
					description={
						<>
							본 페이지의 난이도 시스템과 티어 아이콘은{" "}
							<a
								href="https://solved.ac"
								target="_blank"
								rel="noopener noreferrer"
								className="hover:text-foreground transition-colors underline underline-offset-2"
							>
								solved.ac
							</a>
							의 저작권 자산이며, ANA Online Judge는 solved.ac와 무관한 별개의 서비스입니다.
						</>
					}
				/>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="w-[80px]">티어</TableHead>
								<TableHead>난이도</TableHead>
								<TableHead className="w-[120px] text-right">문제 개수</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{TIER_ORDER.map((tier) => (
								<TableRow key={tier} className="hover:bg-muted/50">
									<TableCell>
										<TierBadge tier={tier} kind="problem" size="sm" showTooltip={false} />
									</TableCell>
									<TableCell>
										<Link
											href={`/tiers/${tier}`}
											className="font-medium text-sm hover:text-primary transition-colors"
										>
											{tierLabel(tier, "problem")}
										</Link>
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{counts.get(tier) ?? 0}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</PageShell>
	);
}
