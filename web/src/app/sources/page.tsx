import type { Metadata } from "next";
import Link from "next/link";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { countProblemsInSubtree, listRootSources } from "@/lib/services/sources";

export const metadata: Metadata = {
	title: "출처",
	description: "문제 출처 트리 탐색",
};

export default async function SourcesRootPage() {
	const roots = await listRootSources();
	const counts = await Promise.all(roots.map((r) => countProblemsInSubtree(r.id)));

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "출처" }]} />
			<Card>
				<CardHeader className="pb-6">
					<CardTitle className="text-2xl">출처</CardTitle>
					<p className="text-sm text-muted-foreground">
						대회·기관·연도 등 다단계로 정리된 문제 출처 트리.
					</p>
				</CardHeader>
				<CardContent>
					{roots.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">등록된 출처가 없습니다.</div>
					) : (
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">#</TableHead>
										<TableHead>이름</TableHead>
										<TableHead className="w-[100px] text-right">연도</TableHead>
										<TableHead className="w-[120px] text-right">문제 수</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{roots.map((root, i) => (
										<TableRow key={root.id}>
											<TableCell className="font-mono text-muted-foreground">{root.id}</TableCell>
											<TableCell>
												<Link href={`/sources/${root.id}`} className="font-medium hover:underline">
													{root.name}
												</Link>
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{root.year ?? "-"}
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{counts[i]}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
