import { Heart } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ListSort, ProblemSetListRow } from "@/lib/services/problem-sets";
import { cn } from "@/lib/utils";

export function ProblemSetListTable({
	items,
	isLoggedIn,
}: {
	items: ProblemSetListRow[];
	isLoggedIn: boolean;
}) {
	if (items.length === 0) {
		return <EmptyState>문제집이 없습니다.</EmptyState>;
	}
	const progressSortKey: ListSort = isLoggedIn ? "solvedRatio" : "problemCount";
	return (
		<Table className="min-w-[660px]">
			<TableHeader>
				<TableRow>
					<TableHead>
						<Suspense fallback="제목">
							<SortableHeader<ListSort>
								label="제목"
								sortKey="title"
								defaultSortKey="likes"
								defaultOrder="desc"
							/>
						</Suspense>
					</TableHead>
					<TableHead className="w-[160px]">
						<Suspense fallback="작성자">
							<SortableHeader<ListSort>
								label="작성자"
								sortKey="creator"
								defaultSortKey="likes"
								defaultOrder="desc"
							/>
						</Suspense>
					</TableHead>
					<TableHead className="w-[176px]">
						<Suspense fallback="진행률">
							<SortableHeader<ListSort>
								label="진행률"
								sortKey={progressSortKey}
								defaultSortKey="likes"
								defaultOrder="desc"
							/>
						</Suspense>
					</TableHead>
					<TableHead className="w-[80px] text-right">
						<Suspense fallback="좋아요">
							<SortableHeader<ListSort>
								label="좋아요"
								sortKey="likes"
								className="justify-end"
								defaultSortKey="likes"
								defaultOrder="desc"
							/>
						</Suspense>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map((row) => (
					<TableRow key={row.id}>
						<TableCell>
							<Link
								href={`/problemsets/${row.id}`}
								className="block truncate hover:underline font-medium"
								title={row.title}
							>
								{row.title}
							</Link>
						</TableCell>
						<TableCell className="text-sm">
							<div className="truncate" title={row.creator.name}>
								{row.creator.name}
							</div>
						</TableCell>
						<TableCell>
							<ProgressBar
								current={isLoggedIn ? (row.solvedCount ?? 0) : 0}
								total={row.totalCount}
								size="sm"
								showCount
							/>
						</TableCell>
						<TableCell className="text-right tabular-nums">
							<span className="inline-flex items-center gap-1 text-sm">
								<Heart
									className={cn(
										"size-3.5",
										row.likedByViewer ? "fill-current text-primary" : "text-muted-foreground"
									)}
								/>
								{row.likeCount}
							</span>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
