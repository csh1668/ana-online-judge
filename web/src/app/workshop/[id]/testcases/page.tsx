import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { WorkshopProblemNav } from "../nav";
import { TestcasesClient } from "./testcases-client";

export default async function WorkshopTestcasesPage({
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
	const { testcases } = await listWorkshopTestcases(problem.id);

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">테스트케이스 관리 (수동)</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<TestcasesClient
				problemId={problem.id}
				initialTestcases={testcases.map((t) => ({
					id: t.id,
					index: t.index,
					source: t.source,
					subtaskGroup: t.subtaskGroup,
					score: t.score,
					validationStatus: t.validationStatus,
					hasOutput: t.outputPath !== null,
				}))}
			/>
		</div>
	);
}
