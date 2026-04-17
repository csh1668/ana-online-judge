import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblems } from "@/actions/problems";
import { getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { ContestListTable } from "@/components/contests/contest-list-table";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ProblemListTable } from "@/components/problems/problem-list-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
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
	listDirectContests,
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

	const [breadcrumb, children, directContests, directProblems] = await Promise.all([
		getBreadcrumb(sourceId),
		listChildren(sourceId),
		listDirectContests(sourceId),
		getProblems({
			page: 1,
			limit: 100,
			sourceId,
			sourceIdMode: "direct",
			userId,
			includeUnavailable: true,
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
					<CardTitle className="text-2xl">{source.name}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{children.length > 0 && (
						<section>
							<h2 className="text-lg font-semibold mb-3">하위 출처</h2>
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
						</section>
					)}

					{directContests.length > 0 && (
						<>
							{children.length > 0 && <Separator />}
							<section>
								<h2 className="text-lg font-semibold mb-3">관련 대회</h2>
								<ContestListTable contests={directContests} />
							</section>
						</>
					)}

					{directProblems.problems.length > 0 && (
						<>
							{(children.length > 0 || directContests.length > 0) && <Separator />}
							<section>
								<h2 className="text-lg font-semibold mb-3">문제 ({directProblems.total})</h2>
								<ProblemListTable
									problems={directProblems.problems}
									userProblemStatuses={userProblemStatuses}
								/>
							</section>
						</>
					)}

					{children.length === 0 &&
						directContests.length === 0 &&
						directProblems.problems.length === 0 && (
							<p className="text-center py-8 text-muted-foreground">
								이 출처에 아직 연결된 항목이 없습니다.
							</p>
						)}
				</CardContent>
			</Card>

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
