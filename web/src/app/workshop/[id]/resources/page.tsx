import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopResources } from "@/actions/workshop/resources";
import { ResourcesClient } from "./resources-client";

export const dynamic = "force-dynamic";

export default async function WorkshopResourcesPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	let resources: Awaited<ReturnType<typeof listWorkshopResources>>["resources"];
	try {
		data = await getWorkshopProblemWithDraft(problemId);
		({ resources } = await listWorkshopResources(data.problem.id));
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	return (
		<ResourcesClient
			problemId={problem.id}
			initialResources={resources.map((r) => ({
				id: r.id,
				name: r.name,
				updatedAt: r.updatedAt.toISOString(),
			}))}
		/>
	);
}
