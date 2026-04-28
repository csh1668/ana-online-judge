import Link from "next/link";
import { listAllGroupsForAdmin } from "@/actions/workshop/groups";
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
import { CreateGroupModal } from "./create-group-modal";

export default async function AdminGroupsPage() {
	const groups = await listAllGroupsForAdmin();
	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-4">
			<PageBreadcrumb
				items={[
					{ label: "관리자", href: "/admin" },
					{ label: "창작마당", href: "/admin/workshop" },
					{ label: "그룹" },
				]}
			/>
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0">
					<CardTitle className="text-2xl">그룹 관리</CardTitle>
					<CreateGroupModal />
				</CardHeader>
				<CardContent>
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>그룹명</TableHead>
								<TableHead className="w-[120px] text-right">멤버수</TableHead>
								<TableHead className="w-[120px] text-right">문제수</TableHead>
								<TableHead className="w-[180px]">생성일</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{groups.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="text-center text-muted-foreground py-8">
										아직 만들어진 그룹이 없습니다.
									</TableCell>
								</TableRow>
							) : (
								groups.map((g) => (
									<TableRow key={g.id}>
										<TableCell className="font-medium">
											<Link
												href={`/workshop/groups/${g.id}`}
												className="underline-offset-4 hover:underline"
											>
												{g.name}
											</Link>
										</TableCell>
										<TableCell className="text-right text-sm">{g.memberCount}</TableCell>
										<TableCell className="text-right text-sm">{g.problemCount}</TableCell>
										<TableCell className="text-xs text-muted-foreground">
											{new Date(g.createdAt).toLocaleString("ko-KR")}
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
