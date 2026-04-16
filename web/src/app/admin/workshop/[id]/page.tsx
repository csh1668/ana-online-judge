import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getWorkshopProblemAdminDetail, getWorkshopReadiness } from "@/actions/admin/workshop";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublishPanel } from "./publish-panel";

export const metadata: Metadata = {
	title: "창작마당 상세",
};

function formatDate(date: Date | null | undefined) {
	if (!date) return "-";
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
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

	const { problem, latestSnapshot } = detail;

	return (
		<div className="space-y-6">
			<PageBreadcrumb
				items={[
					{ label: "관리자", href: "/admin" },
					{ label: "창작마당", href: "/admin/workshop" },
					{ label: problem.title },
				]}
			/>

			<div>
				<h1 className="text-3xl font-bold">{problem.title}</h1>
				<p className="text-muted-foreground mt-2">
					#{problem.id} · 생성자: {problem.ownerName} ({problem.ownerUsername})
				</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2">
				<Card>
					<CardHeader>
						<CardTitle>문제 메타</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2 text-sm">
						<div>
							<span className="text-muted-foreground">타입:</span> {problem.problemType}
						</div>
						<div>
							<span className="text-muted-foreground">시간제한:</span> {problem.timeLimit}ms
						</div>
						<div>
							<span className="text-muted-foreground">메모리제한:</span> {problem.memoryLimit}
							MB
						</div>
						<div>
							<span className="text-muted-foreground">생성일:</span> {formatDate(problem.createdAt)}
						</div>
						<div>
							<span className="text-muted-foreground">수정일:</span> {formatDate(problem.updatedAt)}
						</div>
						<div className="pt-2">
							{problem.publishedProblemId ? (
								<Link
									href={`/admin/problems/${problem.publishedProblemId}`}
									className="inline-flex items-center gap-1 underline"
								>
									<Badge variant="default">problem #{problem.publishedProblemId}로 출판됨</Badge>
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
						publishedProblemId={problem.publishedProblemId}
					/>
				</CardContent>
			</Card>
		</div>
	);
}
