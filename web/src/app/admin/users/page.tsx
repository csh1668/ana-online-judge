import type { Metadata } from "next";
import Link from "next/link";
import { getAdminUsers } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = {
	title: "사용자 관리",
};

function formatDate(date: Date) {
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(date);
}

export default async function AdminUsersPage({
	searchParams,
}: {
	searchParams: Promise<{ page?: string }>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const { users, total } = await getAdminUsers({ page, limit: 20 });
	const totalPages = Math.ceil(total / 20);

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">사용자 관리</h1>
				<p className="text-muted-foreground mt-2">총 {total}명의 사용자</p>
			</div>

			<Card>
				<CardContent className="p-0">
					{users.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">등록된 사용자가 없습니다.</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead className="w-[60px]">#</TableHead>
										<TableHead>이름</TableHead>
										<TableHead>이메일</TableHead>
										<TableHead className="w-[100px]">레이팅</TableHead>
										<TableHead className="w-[120px]">권한</TableHead>
										<TableHead className="w-[120px]">가입일</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{users.map((user) => (
										<TableRow key={user.id}>
											<TableCell className="font-mono">{user.id}</TableCell>
											<TableCell className="font-medium">{user.name}</TableCell>
											<TableCell className="text-muted-foreground">{user.email}</TableCell>
											<TableCell>{user.rating}</TableCell>
											<TableCell>
												<RoleSelect userId={user.id} currentRole={user.role} />
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDate(user.createdAt)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>

							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 p-4 border-t">
									{page > 1 && (
										<Link
											href={`/admin/users?page=${page - 1}`}
											className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
										>
											이전
										</Link>
									)}
									<span className="text-sm text-muted-foreground">
										{page} / {totalPages}
									</span>
									{page < totalPages && (
										<Link
											href={`/admin/users?page=${page + 1}`}
											className="px-4 py-2 text-sm border rounded-md hover:bg-accent transition-colors"
										>
											다음
										</Link>
									)}
								</div>
							)}
						</>
					)}
				</CardContent>
			</Card>
		</div>
	);
}




