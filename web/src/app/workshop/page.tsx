import Link from "next/link";
import { Suspense } from "react";
import { listMyWorkshopProblems } from "@/actions/workshop/problems";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
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

	const session = await auth();
	const isLoggedIn = !!session?.user?.id;

	let problems: Awaited<ReturnType<typeof listMyWorkshopProblems>> | null = null;
	let accessError: "login" | "permission" | null = isLoggedIn ? null : "login";
	if (isLoggedIn) {
		try {
			problems = await listMyWorkshopProblems();
		} catch (err) {
			if (err instanceof Error && err.message.includes("권한")) {
				accessError = "permission";
			} else {
				throw err;
			}
		}
	}

	if (accessError || problems === null) {
		return (
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<PageBreadcrumb items={[{ label: "창작마당" }]} />
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">창작마당</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<p className="text-muted-foreground">
							창작마당은 직접 알고리즘 문제를 만들고 출제할 수 있는 공간입니다. 지문, 테스트케이스,
							체커, 솔루션을 한 곳에서 관리하고 검증한 뒤, 관리자의 승인을 얻어서 사이트에 출판할 수
							있습니다.
						</p>
						<p className="text-muted-foreground">
							창작마당 이용에는 권한이 필요합니다. 관리자에게 요청하세요.
						</p>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-4 text-sm">
							<div>
								<p className="font-medium">
									{accessError === "login" ? "로그인이 필요합니다" : "접근 권한이 없습니다"}
								</p>
								<p className="text-muted-foreground mt-1">
									{accessError === "login"
										? "창작마당을 이용하려면 먼저 로그인이 필요합니다."
										: "창작마당은 권한이 부여된 사용자만 사용할 수 있습니다. 출제를 원하시면 관리자에게 문의하세요."}
								</p>
							</div>
							{accessError === "login" && (
								<Button asChild className="shrink-0">
									<Link href="/login">로그인</Link>
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const filtered = query ? problems.filter((p) => p.title.toLowerCase().includes(query)) : problems;

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "창작마당" }]} />
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
