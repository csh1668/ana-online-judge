import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopSolutions } from "@/actions/workshop/solutions";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { WorkshopProblemNav } from "../nav";
import { SolutionsClient } from "./solutions-client";

export default async function WorkshopSolutionsPage({
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

	const [{ solutions }, { testcases }] = await Promise.all([
		listWorkshopSolutions(problem.id),
		listWorkshopTestcases(problem.id),
	]);

	const hasMain = solutions.some((s) => s.isMain);
	const testcaseCount = testcases.length;
	const missingOutputCount = testcases.filter((t) => t.outputPath === null).length;

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">솔루션 관리</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<SolutionsClient
				problemId={problem.id}
				initialSolutions={solutions.map((s) => ({
					id: s.id,
					name: s.name,
					language: s.language,
					expectedVerdict: s.expectedVerdict,
					isMain: s.isMain,
					updatedAt: s.updatedAt.toISOString(),
				}))}
				testcaseCount={testcaseCount}
				missingOutputCount={missingOutputCount}
				hasMain={hasMain}
			/>
		</div>
	);
}
