import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContestById, getContestOperators } from "@/actions/contests";
import { AddOperatorDialog } from "@/components/contests/add-operator-dialog";
import { RemoveOperatorButton } from "@/components/contests/remove-operator-button";
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
import { UserNameDisplay } from "@/components/user-name-display";
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
		title: `${contest.title} - 운영진 관리`,
	};
}

export default async function ContestOperatorsPage({
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

	const operators = await getContestOperators(contestId);

	return (
		<PageShell
			width="fluid"
			breadcrumb={[
				{ label: "관리자", href: "/admin" },
				{ label: "대회", href: "/admin/contests" },
				{ label: contest.title, href: `/admin/contests/${contestId}` },
				{ label: "운영진" },
			]}
		>
			<Card>
				<PageHeader
					title={`${contest.title} - 운영진 관리 (${operators.length}명)`}
					actions={
						<AddOperatorDialog
							contestId={contestId}
							excludeIds={operators.map((op) => op.userId)}
						/>
					}
				/>
				<CardContent>
					{operators.length === 0 ? (
						<EmptyState>운영진가 없습니다.</EmptyState>
					) : (
						<Table className="min-w-[780px]">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead className="w-[160px]">아이디</TableHead>
									<TableHead>이름</TableHead>
									<TableHead className="w-[180px]">추가 시간</TableHead>
									<TableHead className="w-[120px] text-right">작업</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{operators.map((op) => (
									<TableRow key={op.userId}>
										<TableCell className="font-mono text-muted-foreground">{op.userId}</TableCell>
										<TableCell className="font-medium">
											<div className="block truncate" title={op.user.username}>
												{op.user.username}
											</div>
										</TableCell>
										<TableCell>
											<div className="block truncate" title={op.user.name}>
												<UserNameDisplay user={op.user} />
											</div>
										</TableCell>
										<TableCell className="text-muted-foreground">
											{formatDateTime(op.createdAt)}
										</TableCell>
										<TableCell className="text-right">
											<RemoveOperatorButton
												contestId={contestId}
												userId={op.userId}
												username={op.user.username}
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
