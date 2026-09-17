import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkshopProblemAdminDetail, getWorkshopReadiness } from "@/actions/admin/workshop";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format-date";
import { CasGcPanel } from "./cas-gc-panel";
import { PublishPanel } from "./publish-panel";

export const metadata: Metadata = {
	title: "창작마당 상세",
};

export const dynamic = "force-dynamic";

function formatDate(date: Date | null | undefined) {
	if (!date) return "-";
	return formatDateTime(date);
}

export default async function AdminWorkshopDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const workshopProblemId = Number.parseInt(id, 10);
	if (!Number.isFinite(workshopProblemId)) {
		notFound();
	}

	const [detail, readiness] = await Promise.all([
		getWorkshopProblemAdminDetail(workshopProblemId),
		getWorkshopReadiness(workshopProblemId),
	]);

	if (!detail) {
		notFound();
	}

	// `detail.problem` carries identity columns + a display-resolved header
	// (title/type/limits resolved from latest snapshot → creator draft → fallback).
	const { problem: meta, latestSnapshot } = detail;

	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "창작마당", href: "/admin/workshop" },
				{ label: meta.title },
			]}
		>
			<Card>
				<PageHeader
					title={meta.title}
					description={`#${meta.id} · 생성자: ${meta.ownerName} (${meta.ownerUsername})`}
				/>
			</Card>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>문제 메타</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<div>
							<span className="text-muted-foreground">타입:</span> {meta.problemType}
						</div>
						<div>
							<span className="text-muted-foreground">시간제한:</span> {meta.timeLimit}ms
						</div>
						<div>
							<span className="text-muted-foreground">메모리제한:</span> {meta.memoryLimit}
							MB
						</div>
						<div>
							<span className="text-muted-foreground">생성일:</span> {formatDate(meta.createdAt)}
						</div>
						<div>
							<span className="text-muted-foreground">수정일:</span> {formatDate(meta.updatedAt)}
						</div>
						<div className="pt-2">
							{meta.publishedProblemId ? (
								<Link
									href={`/admin/problems/${meta.publishedProblemId}`}
									className="inline-flex items-center gap-1 underline"
								>
									<Badge variant="default">problem #{meta.publishedProblemId}로 출판됨</Badge>
									<ExternalLink className="h-3 w-3" />
								</Link>
							) : (
								<Badge variant="secondary">미출판</Badge>
							)}
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>최근 스냅샷</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						{latestSnapshot ? (
							<>
								<div>
									<span className="text-muted-foreground">라벨:</span>{" "}
									<span className="font-medium">{latestSnapshot.label}</span>
								</div>
								{latestSnapshot.message && (
									<div>
										<span className="text-muted-foreground">설명:</span> {latestSnapshot.message}
									</div>
								)}
								<div>
									<span className="text-muted-foreground">생성:</span>{" "}
									{formatDate(latestSnapshot.createdAt)}
								</div>
								<div>
									<span className="text-muted-foreground">id:</span> #{latestSnapshot.id}
								</div>
							</>
						) : (
							<p className="text-muted-foreground">커밋된 스냅샷이 없습니다.</p>
						)}
					</CardContent>
				</Card>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>출판</CardTitle>
				</CardHeader>
				<CardContent>
					<PublishPanel
						workshopProblemId={workshopProblemId}
						readiness={readiness}
						publishedProblemId={meta.publishedProblemId}
						publishedSnapshotId={meta.publishedSnapshotId}
					/>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>CAS 가비지 컬렉션</CardTitle>
				</CardHeader>
				<CardContent>
					<CasGcPanel workshopProblemId={workshopProblemId} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
