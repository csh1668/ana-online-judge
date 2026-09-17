import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getStaleDraftInfo } from "@/actions/workshop/snapshots";
import { StaleDraftPoller } from "../_components/stale-draft-poller";
import { StatementForm } from "./statement-form";

export const dynamic = "force-dynamic";

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
	let stale: Awaited<ReturnType<typeof getStaleDraftInfo>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
		stale = await getStaleDraftInfo(data.problem.id);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem, draft } = data;

	return (
		<div className="space-y-6">
			<StaleDraftPoller problemId={problem.id} initialStale={stale} />
			<StatementForm
				problemId={problem.id}
				initialTitle={draft.title}
				initialDescription={draft.description}
				initialVersion={draft.version}
			/>
		</div>
	);
}
