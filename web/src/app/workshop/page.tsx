import Link from "next/link";
import { Suspense } from "react";
import { listMyGroups } from "@/actions/workshop/groups";
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
import { getUserQuotas, getWorkshopUsage } from "@/lib/services/quota";
import { listAllGroups } from "@/lib/services/workshop-groups";
import { NewProblemDropdown } from "./_components/new-problem-dropdown";
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
	const userId = session?.user?.id ? parseInt(session.user.id, 10) : null;
	const isAdmin = session?.user?.role === "admin";

	if (userId === null) {
		return (
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<PageBreadcrumb items={[{ label: "창작마당" }]} />
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">창작마당</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<p className="text-muted-foreground">
							창작마당은 직접 알고리즘 문제를 만들고 출제할 수 있는 공간입니다.
						</p>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-4 text-sm">
							<div>
								<p className="font-medium">로그인이 필요합니다</p>
								<p className="text-muted-foreground mt-1">
									창작마당을 이용하려면 먼저 로그인이 필요합니다.
								</p>
							</div>
							<Button asChild className="shrink-0">
								<Link href="/login">로그인</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const allMyProblems = await listMyWorkshopProblems();
	const personalProblems = allMyProblems.filter((p) => p.groupId === null);
	const groups = isAdmin ? await listAllGroups() : await listMyGroups();

	const quotas = await getUserQuotas(userId);
	const personalUsage = isAdmin ? personalProblems.length : await getWorkshopUsage(userId);
	const quota = quotas.workshopQuota;
	const personalFull = !isAdmin && personalUsage >= quota;

	const filteredPersonal = query
		? personalProblems.filter((p) => p.title.toLowerCase().includes(query))
		: personalProblems;
	const filteredGroups = query
		? groups.filter((g) => g.name.toLowerCase().includes(query))
		: groups;

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
			<PageBreadcrumb items={[{ label: "창작마당" }]} />

			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
					<div className="space-y-1">
						<CardTitle className="text-2xl">창작마당</CardTitle>
						<p className="text-sm text-muted-foreground">
							{isAdmin
								? `개인 ${personalProblems.length}개 · 그룹 ${groups.length}개 · 무제한`
								: `개인 ${personalUsage}/${quota}개 · 그룹 ${groups.length}개`}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<Suspense>
							<WorkshopSearch />
						</Suspense>
						<NewProblemDropdown
							groups={groups.map((g) => ({ id: g.id, name: g.name }))}
							personalDisabled={personalFull}
							personalDisabledReason={
								personalFull ? `개인 한도 초과 (${personalUsage}/${quota})` : undefined
							}
						/>
					</div>
				</CardHeader>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">
						내 개인 문제 {!isAdmin && `(${personalUsage}/${quota})`}
					</CardTitle>
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
							{filteredPersonal.length === 0 ? (
								<TableRow>
									<TableCell colSpan={6} className="text-center text-muted-foreground py-8">
										{query ? `"${query}" 검색 결과가 없습니다.` : "아직 만든 개인 문제가 없습니다."}
									</TableCell>
								</TableRow>
							) : (
								filteredPersonal.map((p) => (
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

			<Card>
				<CardHeader>
					<CardTitle className="text-lg">{isAdmin ? "모든 그룹" : "내 그룹"}</CardTitle>
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>그룹명</TableHead>
								<TableHead className="w-[120px]">역할</TableHead>
								<TableHead className="w-[100px] text-right">멤버수</TableHead>
								<TableHead className="w-[100px] text-right">문제수</TableHead>
								<TableHead className="w-[160px]">생성일</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{filteredGroups.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center text-muted-foreground py-8">
										{query
											? `"${query}" 검색 결과가 없습니다.`
											: isAdmin
												? "아직 만들어진 그룹이 없습니다."
												: "가입한 그룹이 없습니다."}
									</TableCell>
								</TableRow>
							) : (
								filteredGroups.map((g) => (
									<TableRow key={g.id}>
										<TableCell className="font-medium">
											<Link
												href={`/workshop/groups/${g.id}`}
												className="underline-offset-4 hover:underline"
											>
												{g.name}
											</Link>
										</TableCell>
										<TableCell className="text-sm">
											{g.myRole ?? <span className="text-muted-foreground">—</span>}
										</TableCell>
										<TableCell className="text-right text-sm">{g.memberCount}</TableCell>
										<TableCell className="text-right text-sm">{g.problemCount}</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{new Date(g.createdAt).toLocaleString("ko-KR")}
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
