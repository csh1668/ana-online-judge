import { notFound, redirect } from "next/navigation";
import { listWorkshopManualInbox } from "@/actions/workshop/manual-inbox";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getWorkshopScript } from "@/actions/workshop/script";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { WorkshopProblemNav } from "../nav";
import { InboxPanel } from "./inbox-panel";
import { ScriptPanel } from "./script-panel";
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
	const [{ testcases }, { script }, { files: inboxFiles }] = await Promise.all([
		listWorkshopTestcases(problem.id),
		getWorkshopScript(problem.id),
		listWorkshopManualInbox(problem.id),
	]);

	return (
		<div className="container mx-auto p-6 space-y-6">
			<div>
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">테스트케이스 관리</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<ScriptPanel problemId={problem.id} initialScript={script} />
			<InboxPanel problemId={problem.id} initial={inboxFiles} />
			<section className="border rounded p-4">
				<h2 className="text-lg font-semibold mb-3">테스트케이스 목록</h2>
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
			</section>
		</div>
	);
}
