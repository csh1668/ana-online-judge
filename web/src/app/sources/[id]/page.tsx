import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblems } from "@/actions/problems";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ContestListTable } from "@/components/contests/contest-list-table";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ProblemListTable } from "@/components/problems/problem-list-table";
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

	const session = await auth();
	const userId = session?.user?.id ? Number.parseInt(session.user.id, 10) : undefined;

	const [breadcrumb, children, contestsInSubtree, directProblems] = await Promise.all([
		getBreadcrumb(sourceId),
		listChildren(sourceId),
		listContestsInSubtree(sourceId),
		getProblems({
			page: 1,
			limit: 100,
			sourceId,
			sourceIdMode: "direct",
			userId,
		}),
	]);

	const childCounts = await Promise.all(children.map((c) => countProblemsInSubtree(c.id)));
	const userProblemStatuses = userId
		? await getUserProblemStatuses(
				directProblems.problems.map((p) => p.id),
				userId
			)
		: new Map<number, { solved: boolean; score: number | null }>();
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
						<ContestListTable contests={contestsInSubtree} />
					</CardContent>
				</Card>
			)}

			{directProblems.problems.length > 0 && (
				<Card>
					<CardHeader className="pb-4">
						<CardTitle className="text-lg">문제 ({directProblems.total})</CardTitle>
					</CardHeader>
					<CardContent>
						<ProblemListTable
							problems={directProblems.problems}
							userProblemStatuses={userProblemStatuses}
						/>
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
