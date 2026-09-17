import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getWorkshopScript } from "@/actions/workshop/script";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScriptPanel } from "./script-panel";
import { TestcasesClient } from "./testcases-client";

export const dynamic = "force-dynamic";

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
	const { problem, draft } = data;
	const [{ testcases }, { script }] = await Promise.all([
		listWorkshopTestcases(problem.id),
		getWorkshopScript(problem.id),
	]);

	return (
		<div className="space-y-6">
			<ScriptPanel problemId={problem.id} initialScript={script} initialVersion={draft.version} />
			<Card>
				<CardHeader>
					<CardTitle>테스트케이스 목록</CardTitle>
				</CardHeader>
				<CardContent>
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
				</CardContent>
			</Card>
		</div>
	);
}
