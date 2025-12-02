import type { Metadata } from "next";
import { ProblemForm } from "../problem-form";

export const metadata: Metadata = {
	title: "새 문제 만들기",
};

export default function NewProblemPage() {
	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">새 문제 만들기</h1>
				<p className="text-muted-foreground mt-2">새로운 문제를 추가합니다.</p>
			</div>

			<ProblemForm />
		</div>
	);
}
