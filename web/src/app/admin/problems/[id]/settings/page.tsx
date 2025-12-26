import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit, getTestcases } from "@/actions/admin";
import { ProblemTabs } from "../problem-tabs";
import { AnigmaFilesSection } from "./anigma-files-section";
import { CheckerUploadForm } from "./checker-upload-form";
import { ValidatorUploadForm } from "./validator-upload-form";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const problem = await getProblemForEdit(Number.parseInt(id, 10));

	if (!problem) {
		return { title: "문제를 찾을 수 없음" };
	}

	return {
		title: `${problem.title} 설정`,
	};
}

export default async function ProblemSettingsPage({ params }: Props) {
	const { id } = await params;
	const problemId = Number.parseInt(id, 10);
	const [problem, testcases] = await Promise.all([
		getProblemForEdit(problemId),
		getTestcases(problemId),
	]);

	if (!problem) {
		notFound();
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">문제 설정</h1>
				<p className="text-muted-foreground mt-2">
					#{problem.id} {problem.title}
				</p>
			</div>

			<ProblemTabs problemId={problemId} />

			{problem.problemType === "anigma" && (
				<AnigmaFilesSection
					referenceCodePath={problem.referenceCodePath}
					solutionCodePath={problem.solutionCodePath}
				/>
			)}

			<div className="grid gap-6 md:grid-cols-2">
				<CheckerUploadForm
					problemId={problem.id}
					problemType={problem.problemType}
					currentCheckerPath={problem.checkerPath}
				/>

				<ValidatorUploadForm
					problemId={problem.id}
					currentValidatorPath={problem.validatorPath}
					testcaseCount={testcases.length}
				/>
			</div>
		</div>
	);
}
