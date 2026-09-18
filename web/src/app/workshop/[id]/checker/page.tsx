import { notFound, redirect } from "next/navigation";
import { getWorkshopCheckerState } from "@/actions/workshop/checker";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { WORKSHOP_CHECKER_PRESETS } from "@/lib/workshop/bundled";
import { CheckerClient } from "./checker-client";

export const dynamic = "force-dynamic";

export default async function WorkshopCheckerPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	let checker: Awaited<ReturnType<typeof getWorkshopCheckerState>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
		checker = await getWorkshopCheckerState(data.problem.id);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem, draft } = data;

	return (
		<div className="space-y-6">
			{draft.problemType === "interactive" && (
				<p className="text-sm text-muted-foreground">
					이 문제는 인터랙티브입니다 — 여기 작성하는 코드는 출력 비교 체커가 아니라 C++ testlib 또는
					Python(aoj_checker.Interactive) interactor로 사용됩니다.
				</p>
			)}
			<CheckerClient
				problemId={problem.id}
				initialLanguage={checker.language}
				initialSource={checker.source}
				initialVersion={checker.version}
				presets={WORKSHOP_CHECKER_PRESETS.map((p) => ({
					id: p.id,
					label: p.label,
					description: p.description,
				}))}
			/>
		</div>
	);
}
