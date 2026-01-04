import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { ContestForm } from "@/components/contests/contest-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getContestStatus } from "@/lib/contest-utils";
import { ContestTime } from "@/components/contests/contest-time";

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

function getStatusBadge(status: string) {
	switch (status) {
		case "upcoming":
			return <Badge variant="secondary">예정</Badge>;
		case "running":
			return <Badge variant="default">진행중</Badge>;
		case "finished":
			return <Badge variant="outline">종료</Badge>;
		default:
			return null;
	}
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
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<div className="space-y-6">
				{/* Contest Info */}
				<Card>
					<CardHeader>
						<div className="flex items-center justify-between">
							<CardTitle className="text-2xl">{contest.title}</CardTitle>
							{getStatusBadge(status)}
						</div>
					</CardHeader>
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
								<p className="text-sm text-muted-foreground">프리즈 상태</p>
								<p className="font-medium">{contest.isFrozen ? "프리즈됨" : "공개"}</p>
							</div>
						</div>

						<div className="mt-6 flex gap-2">
							<Link href={`/admin/contests/${contestId}/problems`}>
								<Button variant="outline">문제 관리</Button>
							</Link>
							<Link href={`/admin/contests/${contestId}/participants`}>
								<Button variant="outline">참가자 관리</Button>
							</Link>
							<Link href={`/contests/${contestId}/scoreboard`}>
								<Button variant="outline">스코어보드 보기</Button>
							</Link>
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
			</div>
		</div>
	);
}
