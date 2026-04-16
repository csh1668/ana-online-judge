import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getWorkshopSnapshot } from "@/actions/workshop/snapshots";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WorkshopProblemNav } from "../../nav";

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

	const prettyState = JSON.stringify(snapshot.stateJson, null, 2);

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">
					스냅샷 #{snapshot.id} · {snapshot.label}
				</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<div className="mb-4">
				<Link
					href={`/workshop/${problem.id}/snapshots`}
					className="text-sm underline-offset-4 hover:underline"
				>
					← 스냅샷 목록으로
				</Link>
			</div>
			<div className="grid grid-cols-1 gap-4">
				<Card>
					<CardHeader>
						<CardTitle>메타데이터</CardTitle>
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
						</dl>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>상태 JSON</CardTitle>
						<p className="text-xs text-muted-foreground">
							파일은 sha256 해시로 참조됩니다. 실제 바이트는{" "}
							<code>workshop/{problem.id}/objects/&#123;sha256&#125;</code>에 있습니다.
						</p>
					</CardHeader>
					<CardContent>
						<pre className="text-xs bg-muted p-3 rounded overflow-x-auto max-h-[60vh]">
							{prettyState}
						</pre>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
