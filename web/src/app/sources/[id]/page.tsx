import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { SourceBreadcrumb } from "@/components/sources/source-breadcrumb";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import {
	countProblemsInSubtree,
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

	const childCounts = await Promise.all(children.map((c) => countProblemsInSubtree(c.id)));
	const isLeaf = children.length === 0;

	const pageBreadcrumbItems = [
		{ label: "출처", href: "/sources" },
		...breadcrumb.slice(0, -1).map((seg) => ({ label: seg.name, href: `/sources/${seg.id}` })),
		{ label: source.name },
	];

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
			<PageBreadcrumb items={pageBreadcrumbItems} />

			<Card>
				<CardHeader>
					<SourceBreadcrumb segments={breadcrumb} className="mb-2" />
					<CardTitle className="text-2xl">{source.name}</CardTitle>
					{source.year !== null && <p className="text-sm text-muted-foreground">{source.year}</p>}
				</CardHeader>
			</Card>

			{children.length > 0 && (
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="text-lg">하위 출처</CardTitle>
					</CardHeader>
					<CardContent>
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
									{children.map((c, i) => (
										<TableRow key={c.id}>
											<TableCell className="font-mono text-muted-foreground">{c.id}</TableCell>
											<TableCell>
												<Link href={`/sources/${c.id}`} className="font-medium hover:underline">
													{c.name}
												</Link>
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{c.year ?? "-"}
											</TableCell>
											<TableCell className="text-right text-muted-foreground">
												{childCounts[i]}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{contestsInSubtree.length > 0 && (
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="text-lg">관련 대회</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">#</TableHead>
										<TableHead>대회명</TableHead>
										<TableHead className="w-[180px] text-right">시작 시간</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{contestsInSubtree.map((c) => (
										<TableRow key={c.id}>
											<TableCell className="font-mono text-muted-foreground">{c.id}</TableCell>
											<TableCell>
												<Link href={`/contests/${c.id}`} className="font-medium hover:underline">
													{c.title}
												</Link>
											</TableCell>
											<TableCell className="text-right text-muted-foreground text-xs">
												{new Date(c.startTime).toLocaleString("ko-KR")}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{direct.problems.length > 0 && (
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="text-lg">문제 ({direct.total})</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">#</TableHead>
										<TableHead>제목</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{direct.problems.map((p) => (
										<TableRow key={p.id}>
											<TableCell className="font-mono text-muted-foreground">{p.id}</TableCell>
											<TableCell>
												<Link href={`/problems/${p.id}`} className="font-medium hover:underline">
													{p.title}
												</Link>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{!isLeaf && (
				<div>
					<Button asChild variant="outline">
						<Link href={`/problems?sourceId=${source.id}`}>이 출처 하위 전체 문제 보기 →</Link>
					</Button>
				</div>
			)}
		</div>
	);
}
