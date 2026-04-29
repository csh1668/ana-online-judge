import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAdminUsers } from "@/actions/admin";
import {
	AdminFilterSelect,
	AdminListToolbar,
	AdminSearchInput,
	AdminSortableHeader,
} from "@/components/admin";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { CsvUserUpload } from "../settings/csv-user-upload";
import { DeleteUserButton } from "./delete-user-button";
import { QuotaStepper } from "./quota-stepper";
import { ResetPasswordButton } from "./reset-password-button";
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
	searchParams: Promise<{
		page?: string;
		q?: string;
		role?: "user" | "admin";
		accountType?: "oauth" | "local";
		sort?: "id" | "createdAt" | "rating" | "submissionCount";
		order?: "asc" | "desc";
	}>;
}) {
	const params = await searchParams;
	const page = parseInt(params.page || "1", 10);
	const { users, total } = await getAdminUsers({
		page,
		limit: 20,
		search: params.q,
		role: params.role,
		accountType: params.accountType,
		sort: params.sort,
		order: params.order,
	});
	const totalPages = Math.ceil(total / 20);

	const buildPageHref = (target: number) => {
		const sp = new URLSearchParams();
		sp.set("page", String(target));
		if (params.q) sp.set("q", params.q);
		if (params.role) sp.set("role", params.role);
		if (params.accountType) sp.set("accountType", params.accountType);
		if (params.sort) sp.set("sort", params.sort);
		if (params.order) sp.set("order", params.order);
		return `/admin/users?${sp.toString()}`;
	};

	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "사용자" }]} />
			<div>
				<h1 className="text-3xl font-bold">사용자 관리</h1>
				<p className="text-muted-foreground mt-2">총 {total}명의 사용자</p>
			</div>

			<Card>
				<CardHeader>
					<CardTitle>계정 일괄 생성</CardTitle>
					<CardDescription>CSV 파일을 업로드하여 여러 계정을 한 번에 생성합니다.</CardDescription>
				</CardHeader>
				<CardContent>
					<CsvUserUpload />
				</CardContent>
			</Card>

			<Suspense>
				<AdminListToolbar>
					<AdminSearchInput paramKey="q" placeholder="아이디·이름·이메일" className="w-[260px]" />
					<AdminFilterSelect
						paramKey="role"
						placeholder="권한"
						options={[
							{ value: "admin", label: "관리자" },
							{ value: "user", label: "일반" },
						]}
					/>
					<AdminFilterSelect
						paramKey="accountType"
						placeholder="계정 유형"
						options={[
							{ value: "local", label: "로컬" },
							{ value: "oauth", label: "OAuth" },
						]}
					/>
				</AdminListToolbar>
			</Suspense>

			<Card>
				<CardContent className="p-0">
					{users.length === 0 ? (
						<div className="text-center py-12 text-muted-foreground">
							조건에 맞는 사용자가 없습니다.
						</div>
					) : (
						<>
							<Table>
								<TableHeader>
									<TableRow>
										<Suspense>
											<AdminSortableHeader sortKey="id" className="w-[60px]">
												#
											</AdminSortableHeader>
										</Suspense>
										<TableHead>아이디</TableHead>
										<TableHead>이름</TableHead>
										<TableHead>이메일</TableHead>
										<Suspense>
											<AdminSortableHeader sortKey="rating" className="w-[100px]">
												레이팅
											</AdminSortableHeader>
										</Suspense>
										<Suspense>
											<AdminSortableHeader sortKey="submissionCount" className="w-[80px]">
												제출
											</AdminSortableHeader>
										</Suspense>
										<TableHead className="w-[120px]">권한</TableHead>
										<TableHead className="w-[180px]">플레이그라운드 한도</TableHead>
										<TableHead className="w-[180px]">창작마당 한도</TableHead>
										<Suspense>
											<AdminSortableHeader sortKey="createdAt" className="w-[120px]">
												가입일
											</AdminSortableHeader>
										</Suspense>
										<TableHead className="w-[120px] text-center">작업</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{users.map((user) => (
										<TableRow key={user.id}>
											<TableCell className="font-mono">{user.id}</TableCell>
											<TableCell className="font-medium">
												<Link
													href={`/profile/${user.username}`}
													className="text-primary hover:underline"
												>
													{user.username}
												</Link>
											</TableCell>
											<TableCell>{user.name}</TableCell>
											<TableCell className="text-muted-foreground">{user.email || "-"}</TableCell>
											<TableCell>{user.rating}</TableCell>
											<TableCell className="font-mono text-sm">{user.submissionCount}</TableCell>
											<TableCell>
												<RoleSelect userId={user.id} currentRole={user.role} />
											</TableCell>
											<TableCell>
												<QuotaStepper
													userId={user.id}
													kind="playground"
													quota={user.playgroundQuota}
													usage={user.playgroundUsage}
													isAdmin={user.role === "admin"}
												/>
											</TableCell>
											<TableCell>
												<QuotaStepper
													userId={user.id}
													kind="workshop"
													quota={user.workshopQuota}
													usage={user.workshopUsage}
													isAdmin={user.role === "admin"}
												/>
											</TableCell>
											<TableCell className="text-muted-foreground">
												{formatDate(user.createdAt)}
											</TableCell>
											<TableCell className="text-center">
												<div className="flex items-center justify-center gap-1">
													<ResetPasswordButton
														userId={user.id}
														username={user.username}
														hasPassword={user.hasPassword}
													/>
													<DeleteUserButton userId={user.id} username={user.username} />
												</div>
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>

							{totalPages > 1 && (
								<div className="flex items-center justify-center gap-2 p-4 border-t">
									{page > 1 && (
										<Link
											href={buildPageHref(page - 1)}
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
											href={buildPageHref(page + 1)}
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
