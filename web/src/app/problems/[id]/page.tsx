import { Clock, HardDrive } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemById } from "@/actions/problems";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ProblemSubmitSection } from "./submit-section";

interface Props {
	params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { id } = await params;
	const problem = await getProblemById(parseInt(id, 10));

	if (!problem) {
		return { title: "문제를 찾을 수 없음" };
	}

	return {
		title: problem.title,
		description: `문제 ${problem.id}: ${problem.title}`,
	};
}

export default async function ProblemDetailPage({ params }: Props) {
	const { id } = await params;
	const problem = await getProblemById(parseInt(id, 10));

	if (!problem) {
		notFound();
	}

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="grid gap-6 lg:grid-cols-1">
				{/* Problem Content */}
				<div className="space-y-6">
					<Card>
						<CardHeader>
							<div className="flex items-start justify-between gap-4">
								<div>
									<div className="flex items-center gap-2 text-muted-foreground mb-2">
										<span className="font-mono">#{problem.id}</span>
									</div>
									<CardTitle className="text-2xl">{problem.title}</CardTitle>
								</div>
							</div>
							<div className="flex items-center gap-4 text-sm text-muted-foreground mt-4">
								<div className="flex items-center gap-1">
									<Clock className="h-4 w-4" />
									<span>{problem.timeLimit}ms</span>
								</div>
								<div className="flex items-center gap-1">
									<HardDrive className="h-4 w-4" />
									<span>{problem.memoryLimit}MB</span>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6">
							<MarkdownRenderer content={problem.content} />
							<Separator />
							<ProblemSubmitSection problemId={problem.id} />
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
