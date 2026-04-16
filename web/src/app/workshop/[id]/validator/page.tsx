import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { getWorkshopValidatorState } from "@/actions/workshop/validator";
import { WorkshopProblemNav } from "../nav";
import { ValidatorClient } from "./validator-client";

export default async function WorkshopValidatorPage({
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

	const [validator, { testcases }] = await Promise.all([
		getWorkshopValidatorState(problem.id),
		listWorkshopTestcases(problem.id),
	]);

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">밸리데이터 설정</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<ValidatorClient
				problemId={problem.id}
				initialLanguage={validator.language}
				initialSource={validator.source ?? ""}
				hasValidator={validator.source !== null}
				testcases={testcases.map((t) => ({
					id: t.id,
					index: t.index,
					validationStatus: t.validationStatus,
				}))}
			/>
		</div>
	);
}
