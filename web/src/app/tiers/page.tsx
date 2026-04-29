import type { Metadata } from "next";
import Link from "next/link";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { TierBadge } from "@/components/tier/tier-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { countPublicProblemsByTier } from "@/lib/services/problem-tier";
import { tierLabel } from "@/lib/tier";

export const metadata: Metadata = {
	title: "난이도 분류",
};

// not_ratable(-1), unrated(0), Bronze V(1) ~ Ruby I(30)
const TIER_ORDER: number[] = [-1, 0, ...Array.from({ length: 30 }, (_, i) => i + 1)];

export default async function TiersPage() {
	const counts = await countPublicProblemsByTier();

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "난이도 분류" }]} />
			<Card>
				<CardHeader className="pb-6">
					<CardTitle className="text-2xl">난이도 분류</CardTitle>
					<p className="text-xs text-muted-foreground pt-2">
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
					</p>
				</CardHeader>
				<CardContent>
					<div className="rounded-md border">
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
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
