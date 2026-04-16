import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { getPlaygroundSessions, requirePlaygroundAccess } from "@/actions/playground";
import { auth } from "@/auth";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { CreateSessionButton } from "@/components/playground/create-session-button";
import { DeleteSessionButton } from "@/components/playground/delete-session-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export const metadata = {
	title: "플레이그라운드",
};

export default async function PlaygroundPage() {
	const session = await auth();
	const userId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	let hasAccess = false;
	if (userId !== null) {
		try {
			await requirePlaygroundAccess(userId);
			hasAccess = true;
		} catch (_e) {
			hasAccess = false;
		}
	}

	if (!hasAccess || userId === null) {
		const isLoggedIn = userId !== null;
		return (
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<PageBreadcrumb items={[{ label: "플레이그라운드" }]} />
				<Card>
					<CardHeader>
						<CardTitle className="text-2xl">플레이그라운드</CardTitle>
					</CardHeader>
					<CardContent className="space-y-6">
						<p className="text-muted-foreground">
							플레이그라운드는 브라우저에서 바로 코드를 작성하고 실행해볼 수 있는 온라인 IDE입니다.
							문제 풀이를 위한 임시 작업 공간이나 알고리즘 실험에 활용할 수 있습니다.
						</p>
						<p className="text-muted-foreground">
							플레이그라운드 이용에는 권한이 필요합니다. 관리자에게 요청하세요.
						</p>
						<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-4 text-sm">
							<div>
								<p className="font-medium">
									{isLoggedIn ? "접근 권한이 없습니다" : "로그인이 필요합니다"}
								</p>
								<p className="text-muted-foreground mt-1">
									{isLoggedIn
										? "플레이그라운드는 권한이 부여된 사용자만 사용할 수 있습니다. 사용을 원하시면 관리자에게 문의하세요."
										: "플레이그라운드를 사용하려면 먼저 로그인이 필요합니다."}
								</p>
							</div>
							{!isLoggedIn && (
								<Button asChild className="shrink-0">
									<Link href="/login">로그인</Link>
								</Button>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	const sessions = await getPlaygroundSessions(userId);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<PageBreadcrumb items={[{ label: "플레이그라운드" }]} />
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6">
					<CardTitle className="text-2xl">내 플레이그라운드</CardTitle>
					<CreateSessionButton userId={userId} />
				</CardHeader>
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
									<TableCell colSpan={3} className="text-center text-muted-foreground py-12">
										생성된 세션이 없습니다. "새 세션 만들기"로 시작하세요.
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
											{s.updatedAt
												? formatDistanceToNow(new Date(s.updatedAt), {
														addSuffix: true,
														locale: ko,
													})
												: "방금 전"}
										</TableCell>
										<TableCell className="text-right">
											<DeleteSessionButton sessionId={s.id} userId={userId} name={s.name} />
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</CardContent>
			</Card>
		</div>
	);
}
