import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit } from "@/actions/admin";
import { ProblemForm } from "../problem-form";

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
			<div>
				<h1 className="text-3xl font-bold">문제 수정</h1>
				<p className="text-muted-foreground mt-2">
					#{problem.id} {problem.title}
				</p>
			</div>

			<ProblemForm problem={problem} />
		</div>
	);
}




