import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	type ContestParticipantItem,
	getContestById,
	getContestParticipants,
} from "@/actions/contests";
import { AddParticipantDialog } from "@/components/contests/add-participant-dialog";
import { RemoveParticipantButton } from "@/components/contests/remove-participant-button";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format-date";

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
		title: `${contest.title} - 참가자 관리`,
	};
}

export default async function ContestParticipantsPage({
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

	const { participants, total } = await getContestParticipants(contestId);

	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "대회", href: "/admin/contests" },
				{ label: contest.title, href: `/admin/contests/${contestId}` },
				{ label: "참가자" },
			]}
		>
			<Card>
				<PageHeader
					title={`${contest.title} - 참가자 관리 (${total}명)`}
					actions={<AddParticipantDialog contestId={contestId} />}
				/>
				<CardContent>
					{participants.length === 0 ? (
						<EmptyState>참가자가 없습니다.</EmptyState>
					) : (
						<Table className="min-w-[800px]">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead>아이디</TableHead>
									<TableHead>이름</TableHead>
									<TableHead className="w-[180px]">등록 시간</TableHead>
									<TableHead className="w-[120px] text-right">작업</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{participants.map((participant: ContestParticipantItem) => (
									<TableRow key={participant.id}>
										<TableCell className="font-mono text-muted-foreground">
											{participant.userId}
										</TableCell>
										<TableCell className="font-medium">{participant.user.username}</TableCell>
										<TableCell>{participant.user.name}</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDateTime(participant.registeredAt)}
										</TableCell>
										<TableCell className="text-right">
											<RemoveParticipantButton
												contestId={contestId}
												userId={participant.userId}
												username={participant.user.username}
											/>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
