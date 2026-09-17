import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getAdminUsers } from "@/actions/admin";
import { listContestsForAssignment } from "@/actions/contest-accounts";
import {
	AdminFilterSelect,
	AdminListToolbar,
	AdminSearchInput,
	AdminSortableHeader,
} from "@/components/admin";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format-date";
import { CsvUserUpload } from "../settings/csv-user-upload";
import { BulkContestAssign } from "./bulk-contest-assign";
import { DeleteUserButton } from "./delete-user-button";
import { QuotaStepper } from "./quota-stepper";
import { ResetPasswordButton } from "./reset-password-button";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = {
	title: "사용자 관리",
};

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
	const [{ users, total }, assignableContests] = await Promise.all([
		getAdminUsers({
			page,
			limit: 20,
			search: params.q,
			role: params.role,
			accountType: params.accountType,
			sort: params.sort,
			order: params.order,
		}),
		listContestsForAssignment(),
	]);
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
		<PageShell
			width="fluid"
			breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "사용자" }]}
		>
			<Card>
				<PageHeader title="사용자 관리" description={`총 ${total}명의 사용자`} />
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>계정 일괄 생성</CardTitle>
					<CardDescription>CSV 파일을 업로드하여 여러 계정을 한 번에 생성합니다.</CardDescription>
				</CardHeader>
				<CardContent>
					<CsvUserUpload />
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>대회 계정 일괄 지정</CardTitle>
					<CardDescription>
						선택한 사용자를 특정 대회의 대회 계정으로 지정합니다. 지정된 계정은 본인 대회 외에는
						제출할 수 없고, 대회 종료 후에도 제출이 차단됩니다.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<BulkContestAssign contests={assignableContests} />
				</CardContent>
			</Card>

			<Card>
				<CardContent>
					<Suspense>
						<AdminListToolbar className="mb-4">
							<AdminSearchInput
								paramKey="q"
								placeholder="아이디·이름·이메일"
								className="w-[260px]"
							/>
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
					{users.length === 0 ? (
						<EmptyState>조건에 맞는 사용자가 없습니다.</EmptyState>
					) : (
						<>
							<Table className="min-w-[1280px]">
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

							<PaginationLinks
								currentPage={page}
								totalPages={totalPages}
								buildHref={buildPageHref}
							/>
						</>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
