import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit, getTestcases } from "@/actions/admin";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { ProblemTabs } from "../problem-tabs";
import { AnigmaFilesSection } from "./anigma-files-section";
import { CheckerUploadForm } from "./checker-upload-form";
import { TransformerUploadForm } from "./transformer-upload-form";
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
		title: `${problem.displayTitle} 설정`,
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
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "문제", href: "/admin/problems" },
				{ label: problem.displayTitle, href: `/admin/problems/${problem.id}` },
				{ label: "설정" },
			]}
		>
			<Card>
				<PageHeader title="문제 설정" description={`#${problem.id} ${problem.displayTitle}`} />
			</Card>

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

				{problem.problemType === "two_step" && (
					<TransformerUploadForm
						problemId={problem.id}
						currentTransformerPath={problem.transformerPath}
					/>
				)}
			</div>
		</PageShell>
	);
}
