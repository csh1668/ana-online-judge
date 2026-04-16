import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { listWorkshopGenerators } from "@/actions/workshop/generators";
import { listWorkshopInvocations } from "@/actions/workshop/invocations";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { listWorkshopResources } from "@/actions/workshop/resources";
import { getStaleDraftInfo, listWorkshopSnapshots } from "@/actions/workshop/snapshots";
import { listWorkshopSolutions } from "@/actions/workshop/solutions";
import { listWorkshopTestcases } from "@/actions/workshop/testcases";
import { getWorkshopValidatorState } from "@/actions/workshop/validator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Verdict } from "@/db/schema";
import {
	matchesExpectedVerdict,
	isPending as verdictIsPending,
	type WorkshopExpectedVerdict,
} from "@/lib/workshop/expected-verdict";
import { WorkshopLimitsEditor } from "./_components/limits-editor";
import { PublishedBanner } from "./_components/published-banner";
import { StaleDraftWarning } from "./_components/stale-draft-warning";
import { WorkshopProblemNav } from "./nav";

export default async function WorkshopProblemDashboardPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId)) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	const [
		{ testcases },
		{ resources },
		{ generators },
		validator,
		{ solutions },
		invocations,
		{ snapshots },
		stale,
	] = await Promise.all([
		listWorkshopTestcases(problem.id),
		listWorkshopResources(problem.id),
		listWorkshopGenerators(problem.id),
		getWorkshopValidatorState(problem.id),
		listWorkshopSolutions(problem.id),
		listWorkshopInvocations(problem.id),
		listWorkshopSnapshots(problem.id),
		getStaleDraftInfo(problem.id),
	]);
	const latestSnapshot = snapshots[0] ?? null;

	const latestInvocation = invocations[0] ?? null;
	const invocationSummary = (() => {
		if (!latestInvocation) return null;
		const sols =
			(latestInvocation.selectedSolutionsJson as {
				id: number;
				expectedVerdict: WorkshopExpectedVerdict;
			}[]) ?? [];
		const tcs = (latestInvocation.selectedTestcasesJson as { id: number }[]) ?? [];
		const cells =
			(latestInvocation.resultsJson as {
				solutionId: number;
				testcaseId: number;
				verdict: string;
			}[]) ?? [];
		const total = sols.length * tcs.length;
		const expectedBySolution = new Map(sols.map((s) => [s.id, s.expectedVerdict]));
		let matches = 0;
		let finished = 0;
		for (const cell of cells) {
			const expected = expectedBySolution.get(cell.solutionId);
			const v = cell.verdict as Verdict;
			if (!verdictIsPending(v)) {
				finished += 1;
				if (expected && matchesExpectedVerdict(expected, v)) matches += 1;
			}
		}
		return { total, finished, matches, status: latestInvocation.status };
	})();
	const hasMainSolution = solutions.some((s) => s.isMain);

	const validTestcaseCount = testcases.filter((t) => t.validationStatus === "valid").length;
	const invalidTestcaseCount = testcases.filter((t) => t.validationStatus === "invalid").length;
	const pendingTestcaseCount = testcases.filter((t) => t.validationStatus === "pending").length;
	const withOutputCount = testcases.filter((t) => t.outputPath !== null).length;

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4 space-y-3">
				<div>
					<h1 className="text-2xl font-bold">{problem.title}</h1>
					<p className="text-xs text-muted-foreground mt-1">
						ID: {problem.id} · {problem.problemType} · seed: {problem.seed}
					</p>
				</div>
				<WorkshopLimitsEditor
					problemId={problem.id}
					initialTimeLimit={problem.timeLimit}
					initialMemoryLimit={problem.memoryLimit}
				/>
			</div>
			{problem.publishedProblemId !== null && (
				<PublishedBanner publishedProblemId={problem.publishedProblemId} />
			)}
			<WorkshopProblemNav problemId={problem.id} />
			<StaleDraftWarning problemId={problem.id} stale={stale} />
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
				<Link href={`/workshop/${problem.id}/statement`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>지문</CardTitle>
							<CardDescription>Markdown + KaTeX</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm text-muted-foreground">
								{problem.description
									? `${problem.description.length.toLocaleString()}자 작성됨`
									: "아직 작성되지 않음"}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/testcases`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>테스트케이스</CardTitle>
							<CardDescription>수동 입력/출력</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								총 <span className="font-semibold">{testcases.length}</span>개
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								출력 있음 {withOutputCount} · 검증 완료 {validTestcaseCount}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/resources`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>리소스</CardTitle>
							<CardDescription>공용 헤더/모듈</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								총 <span className="font-semibold">{resources.length}</span>개
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								{resources.find((r) => r.name === "testlib.h")
									? "testlib.h 포함됨"
									: "testlib.h 없음"}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/generators`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>제너레이터</CardTitle>
							<CardDescription>테스트 생성 프로그램</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								총 <span className="font-semibold">{generators.length}</span>개
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								스크립트는 테스트 탭에서 편집/실행
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/checker`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>체커</CardTitle>
							<CardDescription>{problem.checkerLanguage ?? "미설정"}</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">{problem.checkerPath ? "설정 완료" : "미설정"}</p>
							<p className="text-xs text-muted-foreground mt-1 truncate">
								{problem.checkerPath ?? "—"}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/validator`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>밸리데이터</CardTitle>
							<CardDescription>{validator.language ?? "미설정"}</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								유효 <span className="font-semibold text-green-600">{validTestcaseCount}</span> ·
								무효 <span className="font-semibold text-destructive">{invalidTestcaseCount}</span>{" "}
								· 대기 <span className="font-semibold">{pendingTestcaseCount}</span>
							</p>
							<p className="text-xs text-muted-foreground mt-1">
								{validator.source ? "밸리데이터 저장됨" : "밸리데이터 미등록"}
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/solutions`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>솔루션</CardTitle>
							<CardDescription>
								{hasMainSolution ? "메인 솔루션 있음" : "메인 솔루션 없음"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-sm">
								총 <span className="font-semibold">{solutions.length}</span>개
							</p>
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/invocations`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>인보케이션</CardTitle>
							<CardDescription>
								{hasMainSolution ? "메인 솔루션 있음" : "메인 솔루션 없음"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{invocationSummary ? (
								<>
									<p className="text-sm">
										<span className="font-semibold">{invocationSummary.matches}</span>/
										{invocationSummary.total} 예상 일치
									</p>
									<p className="text-xs text-muted-foreground mt-1">
										상태: {invocationSummary.status} · 진행 {invocationSummary.finished}/
										{invocationSummary.total}
									</p>
								</>
							) : (
								<p className="text-sm text-muted-foreground">실행 내역 없음</p>
							)}
						</CardContent>
					</Card>
				</Link>
				<Link href={`/workshop/${problem.id}/snapshots`} className="block">
					<Card className="hover:bg-accent/40 transition-colors">
						<CardHeader>
							<CardTitle>최근 스냅샷</CardTitle>
							<CardDescription>커밋 / 롤백</CardDescription>
						</CardHeader>
						<CardContent>
							{latestSnapshot ? (
								<>
									<p className="text-sm font-medium truncate">{latestSnapshot.label}</p>
									<p className="text-xs text-muted-foreground mt-1">
										{new Date(latestSnapshot.createdAt).toLocaleDateString("ko-KR")} · by{" "}
										{latestSnapshot.createdByName}
									</p>
								</>
							) : (
								<p className="text-sm text-muted-foreground">아직 커밋되지 않음</p>
							)}
						</CardContent>
					</Card>
				</Link>
			</div>
		</div>
	);
}
