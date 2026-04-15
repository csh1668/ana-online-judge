import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopResources } from "@/actions/workshop/resources";
import { WorkshopProblemNav } from "../nav";
import { ResourcesClient } from "./resources-client";

export default async function WorkshopResourcesPage({
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
	const { resources } = await listWorkshopResources(problem.id);

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">리소스 관리</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<ResourcesClient
				problemId={problem.id}
				initialResources={resources.map((r) => ({
					id: r.id,
					name: r.name,
					updatedAt: r.updatedAt.toISOString(),
				}))}
			/>
		</div>
	);
}
