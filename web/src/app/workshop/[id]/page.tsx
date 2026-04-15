import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { WorkshopProblemNav } from "./nav";

export default async function WorkshopProblemDashboardPage({
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

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">
					ID: {problem.id} · {problem.problemType} · {problem.timeLimit}ms · {problem.memoryLimit}MB
					· seed: {problem.seed}
				</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<div className="text-sm text-muted-foreground">
				개요 페이지 (후속 Phase에서 채워짐). 현재는 드래프트가 자동 생성되고 testlib.h가 리소스에
				주입됩니다.
			</div>
		</div>
	);
}
