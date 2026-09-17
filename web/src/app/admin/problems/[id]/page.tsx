import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit } from "@/actions/admin";
import { getProblemTestcaseCount } from "@/actions/problems";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card } from "@/components/ui/card";
import { ProblemForm } from "../problem-form";
import { ProblemSourcesSection } from "./problem-sources-section";
import { ProblemStaffSection } from "./problem-staff-section";
import { ProblemTabs } from "./problem-tabs";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const problem = await getProblemForEdit(parseInt(id, 10));

	if (!problem) {
		return { title: "문제를 찾을 수 없음" };
	}

	return {
		title: `${problem.displayTitle} 수정`,
	};
}

export default async function EditProblemPage({ params }: Props) {
	const { id } = await params;
	const problemId = parseInt(id, 10);
	const [problem, testcaseCount] = await Promise.all([
		getProblemForEdit(problemId),
		getProblemTestcaseCount(problemId),
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
				{ label: problem.displayTitle },
			]}
		>
			<Card>
				<PageHeader title="문제 수정" description={`#${problem.id} ${problem.displayTitle}`} />
			</Card>

			<ProblemTabs problemId={problem.id} />

			<ProblemForm problem={problem} testcaseCount={testcaseCount} />

			<ProblemSourcesSection problemId={problem.id} />

			<ProblemStaffSection problemId={problem.id} />
		</PageShell>
	);
}
