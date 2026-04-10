import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit } from "@/actions/admin";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { ProblemForm } from "../problem-form";
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
		title: `${problem.title} 수정`,
	};
}

export default async function EditProblemPage({ params }: Props) {
	const { id } = await params;
	const problem = await getProblemForEdit(parseInt(id, 10));

	if (!problem) {
		notFound();
	}

	return (
		<div className="space-y-6">
			<PageBreadcrumb
				items={[
					{ label: "관리자", href: "/admin" },
					{ label: "문제", href: "/admin/problems" },
					{ label: problem.title },
				]}
			/>
			<div>
				<h1 className="text-3xl font-bold">문제 수정</h1>
				<p className="text-muted-foreground mt-2">
					#{problem.id} {problem.title}
				</p>
			</div>

			<ProblemTabs problemId={problem.id} />

			<ProblemForm problem={problem} />

			<ProblemStaffSection problemId={problem.id} />
		</div>
	);
}
