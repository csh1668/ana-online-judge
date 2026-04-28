import { getGroupReviewBundle } from "@/actions/workshop/groups";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { ReviewCard } from "./review-card";

export default async function GroupReviewTab({ params }: { params: Promise<{ gid: string }> }) {
	const { gid } = await params;
	const groupId = Number.parseInt(gid, 10);
	const items = await getGroupReviewBundle(groupId);

	return (
		<div className="space-y-6">
			<div>
				<h2 className="text-lg font-semibold mb-2">요약</h2>
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[60px]">#</TableHead>
							<TableHead>제목</TableHead>
							<TableHead className="w-[140px]">작성자</TableHead>
							<TableHead className="w-[120px]">타입</TableHead>
							<TableHead className="w-[140px]">출판 상태</TableHead>
							<TableHead className="w-[80px] text-right">점프</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{items.map((item, idx) => (
							<TableRow key={item.problemId}>
								<TableCell className="text-muted-foreground text-sm">{idx + 1}</TableCell>
								<TableCell className="font-medium">{item.title}</TableCell>
								<TableCell className="text-sm">{item.creator.name}</TableCell>
								<TableCell className="text-muted-foreground text-sm">{item.problemType}</TableCell>
								<TableCell className="text-sm">
									{item.publishedProblemId !== null ? (
										<span className="text-blue-600">출판됨 #{item.publishedProblemId}</span>
									) : (
										<span className="text-muted-foreground">미출판</span>
									)}
								</TableCell>
								<TableCell className="text-right">
									<a
										href={`#problem-${item.problemId}`}
										className="text-sm text-blue-600 underline-offset-4 hover:underline"
									>
										↓
									</a>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{items.length === 0 ? (
				<p className="text-muted-foreground text-sm">아직 그룹 안에 문제가 없습니다.</p>
			) : (
				<div className="space-y-6">
					{items.map((item) => (
						<ReviewCard key={item.problemId} item={item} />
					))}
				</div>
			)}
		</div>
	);
}
