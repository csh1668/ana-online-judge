import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { WorkshopProblemNav } from "../nav";
import { StatementForm } from "./statement-form";

export default async function WorkshopStatementPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">
					ID: {problem.id} · {problem.problemType} · {problem.timeLimit}ms · {problem.memoryLimit}MB
				</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<StatementForm
				problemId={problem.id}
				initialTitle={problem.title}
				initialDescription={problem.description}
			/>
		</div>
	);
}
