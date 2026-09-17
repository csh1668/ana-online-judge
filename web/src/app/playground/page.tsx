import Link from "next/link";
import { getPlaygroundSessions, getPlaygroundUsage, getUserQuotas } from "@/actions/playground";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { CreateSessionButton } from "@/components/playground/create-session-button";
import { DeleteSessionButton } from "@/components/playground/delete-session-button";
import { Button } from "@/components/ui/button";
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
import { formatRelative } from "@/lib/format-date";

export const metadata = {
	title: "플레이그라운드",
};

export default async function PlaygroundPage() {
	const session = await auth();
	const userId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	if (userId === null) {
		return (
			<PageShell breadcrumb={[{ label: "플레이그라운드" }]}>
				<Card>
					<PageHeader
						title="플레이그라운드"
						description="플레이그라운드는 브라우저에서 바로 코드를 작성하고 실행해볼 수 있는 온라인 IDE입니다."
					/>
					<CardContent>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-4 text-sm">
							<div>
								<p className="font-medium">로그인이 필요합니다</p>
								<p className="text-muted-foreground mt-1">
									플레이그라운드를 사용하려면 먼저 로그인이 필요합니다.
								</p>
							</div>
							<Button asChild className="shrink-0">
								<Link href="/login">로그인</Link>
							</Button>
						</div>
					</CardContent>
				</Card>
			</PageShell>
		);
	}

	const [sessions, quotas, usage] = await Promise.all([
		getPlaygroundSessions(),
		getUserQuotas(userId),
		getPlaygroundUsage(userId),
	]);
	const isAdmin = quotas.role === "admin";
	const quota = quotas.playgroundQuota;
	const full = !isAdmin && usage >= quota;

	return (
		<PageShell breadcrumb={[{ label: "플레이그라운드" }]}>
			<Card>
				<PageHeader
					title="내 플레이그라운드"
					description={isAdmin ? `${usage}개 사용 중 · 무제한` : `${usage}/${quota}개 사용 중`}
					actions={<CreateSessionButton disabled={full} />}
				/>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>이름</TableHead>
								<TableHead className="w-[180px]">마지막 수정</TableHead>
								<TableHead className="w-[80px] text-right">작업</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{sessions.length === 0 ? (
								<TableRow>
									<TableCell colSpan={3} className="whitespace-normal">
										<EmptyState className="py-8">
											생성된 세션이 없습니다. "새 세션 만들기"로 시작하세요.
										</EmptyState>
									</TableCell>
								</TableRow>
							) : (
								sessions.map((s) => (
									<TableRow key={s.id}>
										<TableCell className="font-medium">
											<Link
												href={`/playground/${s.id}`}
												className="underline-offset-4 hover:underline"
											>
												{s.name}
											</Link>
										</TableCell>
										<TableCell className="text-muted-foreground text-sm">
											{s.updatedAt ? formatRelative(s.updatedAt) : "방금 전"}
										</TableCell>
										<TableCell className="text-right">
											<DeleteSessionButton sessionId={s.id} name={s.name} />
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</PageShell>
	);
}
