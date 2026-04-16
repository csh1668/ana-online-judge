import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getStaleDraftInfo, listWorkshopSnapshots } from "@/actions/workshop/snapshots";
import { StaleDraftWarning } from "../_components/stale-draft-warning";
import { WorkshopProblemNav } from "../nav";
import { SnapshotsClient } from "./snapshots-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
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

	const [{ snapshots }, stale] = await Promise.all([
		listWorkshopSnapshots(problem.id),
		getStaleDraftInfo(problem.id),
	]);

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">스냅샷 (커밋 / 롤백)</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<StaleDraftWarning problemId={problem.id} stale={stale} />
			<SnapshotsClient
				problemId={problem.id}
				baseSnapshotId={draft.baseSnapshotId}
				initialSnapshots={snapshots}
			/>
		</div>
	);
}
