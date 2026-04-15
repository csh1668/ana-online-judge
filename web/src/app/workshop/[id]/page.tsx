import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopResources } from "@/actions/workshop/resources";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkshopProblemNav } from "./nav";

export default async function WorkshopProblemDashboardPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId)) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	const [{ testcases }, { resources }] = await Promise.all([
		listWorkshopTestcases(problem.id),
		listWorkshopResources(problem.id),
	]);

	const validTestcaseCount = testcases.filter((t) => t.validationStatus === "valid").length;
	const withOutputCount = testcases.filter((t) => t.outputPath !== null).length;

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">
					ID: {problem.id} · {problem.problemType} · {problem.timeLimit}ms · {problem.memoryLimit}MB
					· seed: {problem.seed}
				</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
				<Link href={`/workshop/${problem.id}/statement`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>지문</CardTitle>
							<CardDescription>Markdown + KaTeX</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								{problem.description
									? `${problem.description.length.toLocaleString()}자 작성됨`
									: "아직 작성되지 않음"}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/testcases`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>테스트케이스</CardTitle>
							<CardDescription>수동 입력/출력</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								총 <span className="font-semibold">{testcases.length}</span>개
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								출력 있음 {withOutputCount} · 검증 완료 {validTestcaseCount}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/resources`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>리소스</CardTitle>
							<CardDescription>공용 헤더/모듈</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								총 <span className="font-semibold">{resources.length}</span>개
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								{resources.find((r) => r.name === "testlib.h")
									? "testlib.h 포함됨"
									: "testlib.h 없음"}
							</p>
						</CardContent>
					</Card>
				</Link>
			</div>
			<p className="text-xs text-muted-foreground mt-6">
				제너레이터/체커/밸리데이터/솔루션/인보케이션/스냅샷 탭은 후속 Phase에서 제공됩니다.
			</p>
		</div>
	);
}
