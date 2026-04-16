import { notFound, redirect } from "next/navigation";
import { listWorkshopInvocations } from "@/actions/workshop/invocations";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopSolutions } from "@/actions/workshop/solutions";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { WorkshopProblemNav } from "../nav";
import { InvocationsClient } from "./invocations-client";

export default async function WorkshopInvocationsPage({
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

	const [{ solutions }, { testcases }, invocations] = await Promise.all([
		listWorkshopSolutions(problem.id),
		listWorkshopTestcases(problem.id),
		listWorkshopInvocations(problem.id),
	]);

	const hasMain = solutions.some((s) => s.isMain);
	const missingOutputCount = testcases.filter((t) => t.outputPath === null).length;

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">인보케이션</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<InvocationsClient
				problemId={problem.id}
				solutions={solutions.map((s) => ({
					id: s.id,
					name: s.name,
					language: s.language,
					expectedVerdict: s.expectedVerdict,
					isMain: s.isMain,
				}))}
				testcases={testcases.map((t) => ({
					id: t.id,
					index: t.index,
					hasOutput: t.outputPath !== null,
				}))}
				invocations={invocations.map((i) => ({
					id: i.id,
					status: i.status,
					selectedSolutionsJson: i.selectedSolutionsJson,
					selectedTestcasesJson: i.selectedTestcasesJson,
					resultsJson: i.resultsJson,
					createdAt: i.createdAt.toISOString(),
					completedAt: i.completedAt ? i.completedAt.toISOString() : null,
				}))}
				hasMain={hasMain}
				missingOutputCount={missingOutputCount}
			/>
		</div>
	);
}
