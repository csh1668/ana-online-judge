import Link from "next/link";
import { listGroupProblems } from "@/actions/workshop/groups";
import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";

export default async function GroupProblemsTab({ params }: { params: Promise<{ gid: string }> }) {
	const { gid } = await params;
	const groupId = Number.parseInt(gid, 10);
	const problems = await listGroupProblems(groupId);

	return (
		<div className="space-y-3">
			<div className="flex justify-end">
				<Button asChild>
					<Link href={`/workshop/new?group=${groupId}`}>이 그룹에서 새 문제 만들기</Link>
				</Button>
			</div>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>제목</TableHead>
						<TableHead className="w-[140px]">작성자</TableHead>
						<TableHead className="w-[140px]">타입</TableHead>
						<TableHead className="w-[180px]">시간/메모리</TableHead>
						<TableHead className="w-[140px]">출판 상태</TableHead>
						<TableHead className="w-[160px]">수정일</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{problems.length === 0 ? (
						<TableRow>
							<TableCell colSpan={6} className="text-center text-muted-foreground py-8">
								아직 그룹 안에 문제가 없습니다.
							</TableCell>
						</TableRow>
					) : (
						problems.map((p) => (
							<TableRow key={p.id}>
								<TableCell className="font-medium">
									<Link href={`/workshop/${p.id}`} className="underline-offset-4 hover:underline">
										{p.title}
									</Link>
								</TableCell>
								<TableCell className="text-sm">{p.creatorName}</TableCell>
								<TableCell className="text-muted-foreground text-sm">{p.problemType}</TableCell>
								<TableCell className="text-muted-foreground text-sm">
									{p.timeLimit}ms · {p.memoryLimit}MB
								</TableCell>
								<TableCell className="text-sm">
									{p.publishedProblemId !== null ? (
										<span className="text-blue-600">출판됨 #{p.publishedProblemId}</span>
									) : (
										<span className="text-muted-foreground">미출판</span>
									)}
								</TableCell>
								<TableCell className="text-xs text-muted-foreground">
									{new Date(p.updatedAt).toLocaleString("ko-KR")}
								</TableCell>
							</TableRow>
						))
					)}
				</TableBody>
			</Table>
		</div>
	);
}
