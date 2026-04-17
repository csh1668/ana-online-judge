import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { countProblemsInSubtree, listRootSources } from "@/lib/services/sources";

export const metadata: Metadata = {
	title: "출처",
	description: "문제 출처 트리 탐색",
};

export default async function SourcesRootPage() {
	const roots = await listRootSources();
	const counts = await Promise.all(roots.map((r) => countProblemsInSubtree(r.id)));

	return (
		<div className="py-8 space-y-6">
			<header>
				<h1 className="text-2xl font-bold">출처</h1>
				<p className="text-sm text-muted-foreground mt-1">
					대회·기관·연도 등 다단계로 정리된 문제 출처 트리.
				</p>
			</header>
			{roots.length === 0 ? (
				<p className="text-muted-foreground">등록된 출처가 없습니다.</p>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
					{roots.map((root, i) => (
						<Card key={root.id}>
							<CardHeader>
								<CardTitle className="flex items-center justify-between">
									<Link href={`/sources/${root.id}`} className="hover:underline">
										{root.name}
									</Link>
									<Badge variant="secondary">{counts[i]}</Badge>
								</CardTitle>
							</CardHeader>
							{root.year !== null && (
								<CardContent className="text-sm text-muted-foreground">{root.year}</CardContent>
							)}
						</Card>
					))}
				</div>
			)}
		</div>
	);
}
