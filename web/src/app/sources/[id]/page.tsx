import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SourceBreadcrumb } from "@/components/sources/source-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	getBreadcrumb,
	getSource,
	listChildren,
	listContestsInSubtree,
	listProblemsBySource,
} from "@/lib/services/sources";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const source = await getSource(Number.parseInt(id, 10));
	return { title: source ? `출처 ${source.name}` : "출처" };
}

export default async function SourceDetailPage({ params }: Props) {
	const { id } = await params;
	const sourceId = Number.parseInt(id, 10);
	const source = await getSource(sourceId);
	if (!source) notFound();

	const [breadcrumb, children, contestsInSubtree, direct] = await Promise.all([
		getBreadcrumb(sourceId),
		listChildren(sourceId),
		listContestsInSubtree(sourceId),
		listProblemsBySource(sourceId, { includeDescendants: false, page: 1, limit: 100 }),
	]);

	const isLeaf = children.length === 0;

	return (
		<div className="py-8 space-y-6">
			<SourceBreadcrumb segments={breadcrumb} />
			<h1 className="text-2xl font-bold">{source.name}</h1>

			{children.length > 0 && (
				<section>
					<h2 className="text-sm font-medium text-muted-foreground mb-2">하위 출처</h2>
					<div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
						{children.map((c) => (
							<Card key={c.id}>
								<CardHeader>
									<CardTitle>
										<Link href={`/sources/${c.id}`} className="hover:underline">
											{c.name}
										</Link>
									</CardTitle>
								</CardHeader>
								{c.year !== null && (
									<CardContent className="text-xs text-muted-foreground">
										<Badge variant="outline">{c.year}</Badge>
									</CardContent>
								)}
							</Card>
						))}
					</div>
				</section>
			)}

			{contestsInSubtree.length > 0 && (
				<section>
					<h2 className="text-sm font-medium text-muted-foreground mb-2">관련 대회</h2>
					<ul className="space-y-1">
						{contestsInSubtree.map((c) => (
							<li key={c.id}>
								<Link href={`/contests/${c.id}`} className="text-primary hover:underline">
									{c.title}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			{direct.problems.length > 0 && (
				<section>
					<h2 className="text-sm font-medium text-muted-foreground mb-2">문제 ({direct.total})</h2>
					<ul className="divide-y rounded border">
						{direct.problems.map((p) => (
							<li key={p.id} className="flex items-center justify-between px-3 py-2">
								<Link href={`/problems/${p.id}`} className="hover:underline">
									#{p.id} {p.title}
								</Link>
							</li>
						))}
					</ul>
				</section>
			)}

			{!isLeaf && (
				<Button asChild variant="outline">
					<Link href={`/problems?sourceId=${source.id}`}>이 출처 하위 전체 문제 보기 →</Link>
				</Button>
			)}
		</div>
	);
}
