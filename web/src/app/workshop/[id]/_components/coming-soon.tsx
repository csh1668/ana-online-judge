import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { WorkshopProblemNav } from "../nav";

export async function WorkshopComingSoon({
	id,
	phase,
	title,
}: {
	id: string;
	phase: "P3" | "P4" | "P5" | "P6" | "P7";
	title: string;
}) {
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
	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">{title}</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<div className="border rounded p-8 text-center text-sm text-muted-foreground">
				{title}은(는) {phase} 단계에서 구현됩니다.
			</div>
		</div>
	);
}
