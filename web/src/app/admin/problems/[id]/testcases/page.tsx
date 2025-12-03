import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit, getTestcases } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ProblemTabs } from "../problem-tabs";
import { DeleteTestcaseButton } from "./delete-button";
import { TestcaseForm } from "./testcase-form";

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
		title: `${problem.title} - 테스트케이스 관리`,
	};
}

export default async function TestcasesPage({ params }: Props) {
	const { id } = await params;
	const problemId = parseInt(id, 10);
	const [problem, testcasesList] = await Promise.all([
		getProblemForEdit(problemId),
		getTestcases(problemId),
	]);

	if (!problem) {
		notFound();
	}

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">테스트케이스 관리</h1>
				<p className="text-muted-foreground mt-2">
					#{problem.id} {problem.title}
				</p>
			</div>

			<ProblemTabs problemId={problemId} />

			<div className="grid gap-6 lg:grid-cols-2">
				{/* Add Testcase Form */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Plus className="h-5 w-5" />
							테스트케이스 추가
						</CardTitle>
						<CardDescription>MinIO/S3에 업로드된 입출력 파일의 경로를 입력하세요.</CardDescription>
					</CardHeader>
					<CardContent>
						<TestcaseForm problemId={problemId} />
					</CardContent>
				</Card>

				{/* Testcases List */}
				<Card>
					<CardHeader>
						<CardTitle>테스트케이스 목록</CardTitle>
						<CardDescription>{testcasesList.length}개의 테스트케이스</CardDescription>
					</CardHeader>
					<CardContent>
						{testcasesList.length === 0 ? (
							<div className="text-center py-8 text-muted-foreground">
								등록된 테스트케이스가 없습니다.
							</div>
						) : (
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[60px]">#</TableHead>
										<TableHead>입력 경로</TableHead>
										<TableHead className="w-[80px]">점수</TableHead>
										<TableHead className="w-[80px]">숨김</TableHead>
										<TableHead className="w-[60px]"></TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{testcasesList.map((tc, index) => (
										<TableRow key={tc.id}>
											<TableCell className="font-mono">{index + 1}</TableCell>
											<TableCell className="font-mono text-xs truncate max-w-[200px]">
												{tc.inputPath}
											</TableCell>
											<TableCell>{tc.score || 0}</TableCell>
											<TableCell>
												<Badge variant={tc.isHidden ? "secondary" : "outline"}>
													{tc.isHidden ? "숨김" : "공개"}
												</Badge>
											</TableCell>
											<TableCell>
												<DeleteTestcaseButton testcaseId={tc.id} problemId={problemId} />
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						)}
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
