import { notFound, redirect } from "next/navigation";
import { listWorkshopGenerators } from "@/actions/workshop/generators";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { WorkshopProblemNav } from "../nav";
import { GeneratorsClient } from "./generators-client";

export default async function WorkshopGeneratorsPage({
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
	const { generators } = await listWorkshopGenerators(problem.id);

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">제너레이터 관리</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<GeneratorsClient
				problemId={problem.id}
				initial={generators.map((g) => ({
					id: g.id,
					name: g.name,
					language: g.language,
					updatedAt: g.updatedAt.toISOString(),
				}))}
			/>
		</div>
	);
}
