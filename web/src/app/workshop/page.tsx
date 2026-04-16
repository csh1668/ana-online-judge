import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { listMyWorkshopProblems } from "@/actions/workshop/problems";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { DeleteWorkshopProblemButton } from "./delete-button";
import { WorkshopSearch } from "./workshop-search";

export default async function WorkshopListPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string }>;
}) {
	const { q } = await searchParams;
	const query = (q ?? "").trim().toLowerCase();

	let problems: Awaited<ReturnType<typeof listMyWorkshopProblems>>;
	try {
		problems = await listMyWorkshopProblems();
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		if (err instanceof Error && err.message.includes("권한")) {
			return (
				<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
					<h1 className="text-2xl font-bold mb-4">창작마당</h1>
					<p className="text-muted-foreground">
						창작마당 접근 권한이 없습니다. 관리자에게 문의하세요.
					</p>
				</div>
			);
		}
		throw err;
	}

	const filtered = query ? problems.filter((p) => p.title.toLowerCase().includes(query)) : problems;

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
					<CardTitle className="text-2xl">창작마당</CardTitle>
					<div className="flex items-center gap-2">
						<Suspense>
							<WorkshopSearch />
						</Suspense>
						<Button asChild>
							<Link href="/workshop/new">새 문제 만들기</Link>
						</Button>
					</div>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>제목</TableHead>
								<TableHead className="w-[140px]">타입</TableHead>
								<TableHead className="w-[180px]">시간/메모리</TableHead>
								<TableHead className="w-[140px]">출판 상태</TableHead>
								<TableHead className="w-[160px]">수정일</TableHead>
								<TableHead className="w-[80px] text-right">작업</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filtered.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className="text-center text-muted-foreground py-12">
										{query
											? `"${query}" 검색 결과가 없습니다.`
											: '아직 만든 문제가 없습니다. "새 문제 만들기"로 시작하세요.'}
									</TableCell>
								</TableRow>
							) : (
								filtered.map((p) => (
									<TableRow key={p.id}>
										<TableCell className="font-medium">
											<Link
												href={`/workshop/${p.id}`}
												className="underline-offset-4 hover:underline"
											>
												{p.title}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">{p.problemType}</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{p.timeLimit}ms · {p.memoryLimit}MB
										</TableCell>
										<TableCell className="text-sm">
											{p.publishedProblemId !== null ? (
												<span className="text-blue-600">출판됨 #{p.publishedProblemId}</span>
											) : (
												<span className="text-muted-foreground">미출판</span>
											)}
										</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{new Date(p.updatedAt).toLocaleString("ko-KR")}
										</TableCell>
										<TableCell className="text-right">
											<DeleteWorkshopProblemButton
												problemId={p.id}
												title={p.title}
												hasPublished={p.publishedProblemId !== null}
											/>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
