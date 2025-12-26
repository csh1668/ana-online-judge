import { Plus, Upload } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProblemForEdit, getTestcases } from "@/actions/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProblemTabs } from "../problem-tabs";
import { BulkUploadForm } from "./bulk-upload-form";
import { TestcaseForm } from "./testcase-form";
import { TestcaseRow } from "./testcase-row";

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
		title: `${problem.title} - 테스트케이스 관리`,
	};
}

export default async function TestcasesPage({ params }: Props) {
	const { id } = await params;
	const problemId = Number.parseInt(id, 10);
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

			<Card>
				<CardHeader>
					<CardTitle>테스트케이스 추가</CardTitle>
					<CardDescription>입출력 파일을 업로드하여 테스트케이스를 추가합니다.</CardDescription>
				</CardHeader>
				<CardContent>
					<Tabs defaultValue="bulk" className="w-full">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="bulk">
								<Upload className="mr-2 h-4 w-4" />
								일괄 업로드 (권장)
							</TabsTrigger>
							<TabsTrigger value="single">
								<Plus className="mr-2 h-4 w-4" />
								개별 추가
							</TabsTrigger>
						</TabsList>
						<TabsContent value="bulk" className="mt-4">
							<BulkUploadForm problemId={problemId} />
						</TabsContent>
						<TabsContent value="single" className="mt-4">
							<TestcaseForm problemId={problemId} />
						</TabsContent>
					</Tabs>
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
									<TableHead>입출력 경로</TableHead>
									<TableHead className="w-[80px]">점수</TableHead>
									<TableHead className="w-[80px]">숨김</TableHead>
									<TableHead className="w-[150px]">작업</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{testcasesList.map((tc, index) => (
									<TestcaseRow key={tc.id} testcase={tc} index={index} problemId={problemId} />
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
