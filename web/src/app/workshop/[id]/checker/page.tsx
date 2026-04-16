import { notFound, redirect } from "next/navigation";
import { getWorkshopCheckerState } from "@/actions/workshop/checker";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { WORKSHOP_CHECKER_PRESETS } from "@/lib/workshop/bundled";
import { WorkshopProblemNav } from "../nav";
import { CheckerClient } from "./checker-client";

export default async function WorkshopCheckerPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	let checker: Awaited<ReturnType<typeof getWorkshopCheckerState>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
		checker = await getWorkshopCheckerState(data.problem.id);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">체커 설정</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<CheckerClient
				problemId={problem.id}
				initialLanguage={checker.language}
				initialSource={checker.source}
				presets={WORKSHOP_CHECKER_PRESETS.map((p) => ({
					id: p.id,
					label: p.label,
					description: p.description,
				}))}
			/>
		</div>
	);
}
