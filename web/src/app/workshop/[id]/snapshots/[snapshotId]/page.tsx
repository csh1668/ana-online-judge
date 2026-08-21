import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getWorkshopSnapshot } from "@/actions/workshop/snapshots";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type {
	SnapshotGenerator,
	SnapshotImage,
	SnapshotResource,
	SnapshotSolution,
	SnapshotState,
	SnapshotTestcase,
} from "@/lib/services/workshop-snapshots";
import { WorkshopProblemNav } from "../../nav";

export const dynamic = "force-dynamic";

/** Truncate a sha256 hex hash to first 12 characters for display. */
function short(h?: string | null): string {
	return h ? `${h.slice(0, 12)}…` : "—";
}

function ValidationStatusBadge({ status }: { status?: string | null }) {
	if (!status) return <span className="text-xs text-muted-foreground">—</span>;
	const variant =
		status === "valid" ? "default" : status === "invalid" ? "destructive" : "secondary";
	return <Badge variant={variant}>{status}</Badge>;
}

function SourceBadge({ source }: { source: string }) {
	return (
		<Badge variant="secondary" className="font-mono text-xs">
			{source}
		</Badge>
	);
}

export default async function Page({
	params,
}: {
	params: Promise<{ id: string; snapshotId: string }>;
}) {
	const { id, snapshotId: snapshotIdStr } = await params;
	const problemId = Number.parseInt(id, 10);
	const snapshotId = Number.parseInt(snapshotIdStr, 10);
	if (!Number.isFinite(problemId) || !Number.isFinite(snapshotId)) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	let snapshot: Awaited<ReturnType<typeof getWorkshopSnapshot>>;
	try {
		snapshot = await getWorkshopSnapshot(problem.id, snapshotId);
	} catch {
		notFound();
	}

	const state = snapshot.stateJson as SnapshotState;
	const { problem: p, testcases, generators, solutions, resources } = state;
	const images: SnapshotImage[] = state.images ?? [];

	const prettyState = JSON.stringify(state, null, 2);

	return (
		<div className="container mx-auto p-6 space-y-4">
			{/* Header */}
			<div className="mb-2">
				<h1 className="text-2xl font-bold">{data.draft.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">
					스냅샷 #{snapshot.id} · {snapshot.label}
				</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<div>
				<Link
					href={`/workshop/${problem.id}/snapshots`}
					className="text-sm underline-offset-4 hover:underline"
				>
					← 스냅샷 목록으로
				</Link>
			</div>

			{/* Snapshot metadata */}
			<Card>
				<CardHeader>
					<CardTitle>스냅샷 메타데이터</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-y-2 text-sm">
						<dt className="text-muted-foreground">라벨</dt>
						<dd>{snapshot.label}</dd>
						<dt className="text-muted-foreground">메시지</dt>
						<dd>{snapshot.message ?? "—"}</dd>
						<dt className="text-muted-foreground">생성일</dt>
						<dd>{new Date(snapshot.createdAt).toLocaleString("ko-KR")}</dd>
						<dt className="text-muted-foreground">생성자 ID</dt>
						<dd className="font-mono text-xs">{snapshot.createdBy}</dd>
						<dt className="text-muted-foreground">버전</dt>
						<dd className="font-mono text-xs">v{state.version}</dd>
					</dl>
				</CardContent>
			</Card>

			{/* Problem header card */}
			<Card>
				<CardHeader>
					<CardTitle>문제 헤더</CardTitle>
				</CardHeader>
				<CardContent>
					<dl className="grid grid-cols-2 gap-y-2 text-sm">
						<dt className="text-muted-foreground">제목</dt>
						<dd className="font-medium">{p.title}</dd>
						<dt className="text-muted-foreground">유형</dt>
						<dd>
							<Badge variant="secondary">{p.problemType}</Badge>
						</dd>
						<dt className="text-muted-foreground">시간 제한</dt>
						<dd>{p.timeLimit}ms</dd>
						<dt className="text-muted-foreground">메모리 제한</dt>
						<dd>{p.memoryLimit}MB</dd>
						<dt className="text-muted-foreground">시드</dt>
						<dd className="font-mono text-xs">{p.seed}</dd>
						<dt className="text-muted-foreground">본문</dt>
						<dd className="text-muted-foreground text-xs">
							{p.description.length.toLocaleString()}자
						</dd>
						<dt className="text-muted-foreground">체커</dt>
						<dd>
							{p.checkerLanguage ? (
								<span>
									{p.checkerLanguage}{" "}
									<span className="font-mono text-xs text-muted-foreground">
										{short(p.checkerHash)}
									</span>
								</span>
							) : (
								<span className="text-muted-foreground text-xs">—</span>
							)}
						</dd>
						<dt className="text-muted-foreground">밸리데이터</dt>
						<dd>
							{p.validatorLanguage ? (
								<span>
									{p.validatorLanguage}{" "}
									<span className="font-mono text-xs text-muted-foreground">
										{short(p.validatorHash)}
									</span>
								</span>
							) : (
								<span className="text-muted-foreground text-xs">—</span>
							)}
						</dd>
						<dt className="text-muted-foreground">생성기 스크립트</dt>
						<dd className="text-xs">
							{p.generatorScript ? (
								<span className="text-muted-foreground">{p.generatorScript.length}자</span>
							) : (
								<span className="text-muted-foreground">—</span>
							)}
						</dd>
					</dl>
				</CardContent>
			</Card>

			{/* Testcases table */}
			<Card>
				<CardHeader>
					<CardTitle>테스트케이스 ({testcases.length}개)</CardTitle>
				</CardHeader>
				<CardContent>
					{testcases.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">테스트케이스 없음</p>
					) : (
						<div className="overflow-x-auto">
							<Table className="min-w-[640px]">
								<TableHeader>
									<TableRow>
										<TableHead className="w-[60px]">#</TableHead>
										<TableHead className="w-[100px]">소스</TableHead>
										<TableHead className="w-20">서브태스크</TableHead>
										<TableHead className="w-[60px]">점수</TableHead>
										<TableHead className="w-[100px]">검증</TableHead>
										<TableHead className="w-[140px]">입력 해시</TableHead>
										<TableHead className="w-[140px]">출력 해시</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{testcases.map((tc: SnapshotTestcase) => (
										<TableRow key={tc.index}>
											<TableCell className="font-mono text-xs">{tc.index}</TableCell>
											<TableCell>
												<SourceBadge source={tc.source} />
											</TableCell>
											<TableCell className="text-sm">{tc.subtaskGroup}</TableCell>
											<TableCell className="text-sm">{tc.score}</TableCell>
											<TableCell>
												<ValidationStatusBadge status={tc.validationStatus} />
											</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(tc.inputHash)}
											</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(tc.outputHash)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Solutions */}
			<Card>
				<CardHeader>
					<CardTitle>솔루션 ({solutions.length}개)</CardTitle>
				</CardHeader>
				<CardContent>
					{solutions.length === 0 ? (
						<p className="text-sm text-muted-foreground py-4 text-center">솔루션 없음</p>
					) : (
						<div className="overflow-x-auto">
							<Table className="min-w-[560px]">
								<TableHeader>
									<TableRow>
										<TableHead>이름</TableHead>
										<TableHead className="w-[100px]">언어</TableHead>
										<TableHead className="w-[120px]">예상 결과</TableHead>
										<TableHead className="w-20">메인</TableHead>
										<TableHead className="w-[140px]">소스 해시</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{solutions.map((sol: SnapshotSolution) => (
										<TableRow key={sol.name}>
											<TableCell>
												<div className="block truncate font-medium" title={sol.name}>
													{sol.name}
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs">{sol.language}</TableCell>
											<TableCell className="text-sm">{sol.expectedVerdict}</TableCell>
											<TableCell>
												{sol.isMain && (
													<Badge variant="default" className="text-xs">
														메인
													</Badge>
												)}
											</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(sol.sourceHash)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Generators */}
			{generators.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>생성기 ({generators.length}개)</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table className="min-w-[480px]">
								<TableHeader>
									<TableRow>
										<TableHead>이름</TableHead>
										<TableHead className="w-[100px]">언어</TableHead>
										<TableHead className="w-[140px]">소스 해시</TableHead>
										<TableHead className="w-[140px]">컴파일 해시</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{generators.map((gen: SnapshotGenerator) => (
										<TableRow key={gen.name}>
											<TableCell>
												<div className="block truncate font-medium" title={gen.name}>
													{gen.name}
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs">{gen.language}</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(gen.sourceHash)}
											</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(gen.compiledHash)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Resources */}
			{resources.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>리소스 ({resources.length}개)</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table className="min-w-[360px]">
								<TableHeader>
									<TableRow>
										<TableHead>이름</TableHead>
										<TableHead className="w-[140px]">해시</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{resources.map((res: SnapshotResource) => (
										<TableRow key={res.name}>
											<TableCell>
												<div className="block truncate font-medium" title={res.name}>
													{res.name}
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(res.hash)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Images (v2+, only if present) */}
			{images.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>지문 이미지 ({images.length}개)</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="overflow-x-auto">
							<Table className="min-w-[360px]">
								<TableHeader>
									<TableRow>
										<TableHead>키</TableHead>
										<TableHead className="w-[140px]">해시</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{images.map((img: SnapshotImage) => (
										<TableRow key={img.key}>
											<TableCell>
												<div className="block truncate text-xs font-mono" title={img.key}>
													{img.key}
												</div>
											</TableCell>
											<TableCell className="font-mono text-xs text-muted-foreground">
												{short(img.hash)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Raw JSON (collapsible) */}
			<Card>
				<CardContent className="pt-4">
					<details>
						<summary className="cursor-pointer text-sm text-muted-foreground select-none">
							원시 JSON
						</summary>
						<pre className="mt-3 text-xs bg-muted p-3 rounded-xs overflow-x-auto max-h-[60vh]">
							{prettyState}
						</pre>
					</details>
				</CardContent>
			</Card>
		</div>
	);
}
