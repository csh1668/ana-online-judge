import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContestById, getContestOperators } from "@/actions/contests";
import { AddOperatorDialog } from "@/components/contests/add-operator-dialog";
import { RemoveOperatorButton } from "@/components/contests/remove-operator-button";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
		<div className="page-container py-8">
			<PageBreadcrumb
				items={[
					{ label: "관리자", href: "/admin" },
					{ label: "대회", href: "/admin/contests" },
					{ label: contest.title, href: `/admin/contests/${contestId}` },
					{ label: "운영진" },
				]}
			/>
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between">
						<CardTitle className="text-2xl">
							{contest.title} - 운영진 관리 ({operators.length}명)
						</CardTitle>
						<AddOperatorDialog
							contestId={contestId}
							excludeIds={operators.map((op) => op.userId)}
						/>
					</div>
				</CardHeader>
				<CardContent>
					{operators.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">운영진가 없습니다.</div>
					) : (
						<div className="rounded-md border">
							<Table className="min-w-[800px]">
								<TableHeader>
									<TableRow>
										<TableHead className="w-[80px]">#</TableHead>
										<TableHead>아이디</TableHead>
										<TableHead>이름</TableHead>
										<TableHead className="w-[180px]">추가 시간</TableHead>
										<TableHead className="w-[120px] text-right">작업</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{operators.map((op) => (
										<TableRow key={op.userId}>
											<TableCell className="font-mono text-muted-foreground">{op.userId}</TableCell>
											<TableCell className="font-medium">{op.user.username}</TableCell>
											<TableCell>
												<UserNameDisplay user={op.user} />
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
						</div>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
