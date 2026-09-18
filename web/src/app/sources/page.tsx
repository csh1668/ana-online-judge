import type { Metadata } from "next";
import Link from "next/link";
import { countProblemsInSubtree, listRootSources } from "@/actions/sources";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = {
	title: "문제 출처",
	description: "문제 출처 트리 탐색",
};

export default async function SourcesRootPage() {
	const roots = await listRootSources();
	const counts = await Promise.all(roots.map((r) => countProblemsInSubtree(r.id)));

	return (
		<PageShell breadcrumb={[{ label: "문제 출처" }]}>
			<Card>
				<PageHeader title="문제 출처" />
				<CardContent>
					{roots.length === 0 ? (
						<EmptyState>등록된 출처가 없습니다.</EmptyState>
					) : (
						<Table className="min-w-[640px]">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead>이름</TableHead>
									<TableHead className="w-[120px] text-right">문제 수</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{roots.map((root, i) => (
									<TableRow key={root.id}>
										<TableCell className="font-mono text-muted-foreground">{root.id}</TableCell>
										<TableCell>
											<Link
												href={`/sources/${root.id}`}
												className="block truncate font-medium hover:underline"
												title={root.name}
											>
												{root.name}
											</Link>
										</TableCell>
										<TableCell className="text-right tabular-nums text-muted-foreground">
											{counts[i]}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
