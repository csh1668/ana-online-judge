import { notFound, redirect } from "next/navigation";
import { listWorkshopGenerators } from "@/actions/workshop/generators";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { GeneratorsClient } from "./generators-client";

export const dynamic = "force-dynamic";

export default async function WorkshopGeneratorsPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	let generators: Awaited<ReturnType<typeof listWorkshopGenerators>>["generators"];
	try {
		data = await getWorkshopProblemWithDraft(problemId);
		({ generators } = await listWorkshopGenerators(data.problem.id));
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	return (
		<GeneratorsClient
			problemId={problem.id}
			initial={generators.map((g) => ({
				id: g.id,
				name: g.name,
				language: g.language,
				updatedAt: g.updatedAt.toISOString(),
			}))}
		/>
	);
}
