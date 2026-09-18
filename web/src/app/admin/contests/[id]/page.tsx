import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { RefreshScoreboardButton } from "@/components/admin/refresh-scoreboard-button";
import { ContestForm } from "@/components/contests/contest-form";
import { ContestStatusBadge } from "@/components/contests/contest-status-badge";
import { ContestTime } from "@/components/contests/contest-time";
import { DeleteContestButton } from "@/components/contests/delete-contest-button";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContestStatus } from "@/lib/contest-utils";
import { ContestSourcesSection } from "./contest-sources-section";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const contest = await getContestById(Number.parseInt(id, 10));

	if (!contest) {
		return {
			title: "대회를 찾을 수 없습니다",
		};
	}

	return {
		title: `${contest.title} - 대회 관리`,
	};
}

export default async function AdminContestDetailPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const contestId = Number.parseInt(id, 10);
	const contest = await getContestById(contestId);

	if (!contest) {
		notFound();
	}

	const status = getContestStatus(contest);

	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "대회", href: "/admin/contests" },
				{ label: contest.title },
			]}
		>
			{/* Contest Info */}
			<Card>
				<PageHeader title={contest.title} meta={<ContestStatusBadge status={status} />} />
				<CardContent>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<p className="text-sm text-muted-foreground">시작 시간</p>
							<p className="font-medium">
								<ContestTime date={contest.startTime} />
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">종료 시간</p>
							<p className="font-medium">
								<ContestTime date={contest.endTime} />
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">공개 범위</p>
							<p className="font-medium">{contest.visibility === "public" ? "공개" : "비공개"}</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">프리즈 시간</p>
							<p className="font-medium">
								{contest.freezeMinutes ? `종료 ${contest.freezeMinutes}분 전` : "프리즈 없음"}
							</p>
						</div>
						<div>
							<p className="text-sm text-muted-foreground">종료 후 스코어보드</p>
							<p className="font-medium">
								{contest.postContestVisibility === "frozen" ? "프리즈 유지" : "공개"}
							</p>
						</div>
					</div>

					<div className="mt-6 flex flex-wrap gap-2">
						<Link href={`/admin/contests/${contestId}/problems`}>
							<Button variant="outline">문제 관리</Button>
						</Link>
						<Link href={`/admin/contests/${contestId}/participants`}>
							<Button variant="outline">참가자 관리</Button>
						</Link>
						<Link href={`/admin/contests/${contestId}/operators`}>
							<Button variant="outline">운영진 관리</Button>
						</Link>
						<Link href={`/contests/${contestId}/scoreboard`}>
							<Button variant="outline">스코어보드 보기</Button>
						</Link>
						<Link href={`/contests/${contestId}/scoreboard?award=true`}>
							<Button variant="outline">스코어보드 보기 (시상 모드)</Button>
						</Link>
						<RefreshScoreboardButton contestId={contestId} />
					</div>
				</CardContent>
			</Card>

			{/* Edit Form */}
			<Card>
				<CardHeader>
					<CardTitle>대회 정보 수정</CardTitle>
				</CardHeader>
				<CardContent>
					<ContestForm contest={contest} />
				</CardContent>
			</Card>

			<ContestSourcesSection contestId={contestId} initialSourceId={contest.sourceId ?? null} />

			{/* Danger Zone */}
			<Card className="border-destructive/50">
				<CardHeader>
					<CardTitle className="text-destructive">위험 구역</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="flex items-center justify-between">
						<div className="space-y-1">
							<p className="font-medium">대회 삭제</p>
							<p className="text-sm text-muted-foreground">
								대회를 삭제하면 관련된 모든 데이터(문제, 참가자, 제출 기록 등)가 영구적으로
								삭제됩니다.
							</p>
						</div>
						<DeleteContestButton contestId={contestId} />
					</div>
				</CardContent>
			</Card>
		</PageShell>
	);
}
