import { Clock, Download, HardDrive } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblemById } from "@/actions/problems";
import { auth } from "@/auth";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProblemTypeBadge } from "@/components/problems/problem-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

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
								<div className="flex-1">
									<div className="flex items-center gap-2 text-muted-foreground mb-2">
										<span className="font-mono">#{problem.id}</span>
									</div>
									<div className="flex items-center gap-3">
										<CardTitle className="text-2xl">{problem.title}</CardTitle>
										<ProblemTypeBadge type={problem.problemType} />
										{isAdmin && !problem.isPublic && (
											<Badge variant="secondary" className="text-xs">
												비공개
											</Badge>
										)}
									</div>
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
							{problem.problemType === "anigma" && problem.referenceCodePath && (
								<>
									<Separator />
									<div className="flex items-center justify-between p-4 border rounded-md bg-muted/10">
										<div>
											<p className="text-sm font-medium">문제 제공 코드 (Reference Code)</p>
											<p className="text-xs text-muted-foreground mt-1">
												ANIGMA 문제를 해결하기 위한 참조 코드를 다운로드하세요.
											</p>
										</div>
										<Button variant="outline" size="sm" asChild>
											<Link href={`/api/problems/${problem.id}/reference-code`}>
												<Download className="mr-2 h-4 w-4" />
												다운로드
											</Link>
										</Button>
									</div>
								</>
							)}
							<Separator />
							<ProblemSubmitSection
								problemId={problem.id}
								problemType={problem.problemType}
								allowedLanguages={problem.allowedLanguages}
							/>
						</CardContent>
					</Card>
				</div>
			</div>
		</div>
	);
}
