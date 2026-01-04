import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
	type ContestParticipantItem,
	getContestById,
	getContestParticipants,
} from "@/actions/contests";
import { AddParticipantDialog } from "@/components/contests/add-participant-dialog";
import { RemoveParticipantButton } from "@/components/contests/remove-participant-button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/contest-utils";

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
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-2xl">
							{contest.title} - 참가자 관리 ({total}명)
						</CardTitle>
						<AddParticipantDialog contestId={contestId} />
					</div>
				</CardHeader>
				<CardContent>
					{participants.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">참가자가 없습니다.</div>
					) : (
						<div className="rounded-md border">
							<Table>
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
												{formatDate(participant.registeredAt)}
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
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
