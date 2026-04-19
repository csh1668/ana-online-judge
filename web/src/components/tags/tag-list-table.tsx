import Link from "next/link";
import { SortableHeader } from "@/components/ui/sortable-header";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { TagListItem } from "@/lib/services/algorithm-tags";
import { TagPath } from "./tag-path";

interface Props {
	tags: TagListItem[];
}

export function TagListTable({ tags }: Props) {
	if (tags.length === 0) {
		return (
			<div className="text-center py-12 text-muted-foreground">조건에 맞는 태그가 없습니다.</div>
		);
	}

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>
							<SortableHeader label="태그" sortKey="name" />
						</TableHead>
						<TableHead className="w-[120px] text-right">
							<SortableHeader label="문제 개수" sortKey="problemCount" className="justify-end" />
						</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{tags.map((tag) => (
						<TableRow key={tag.id} className="hover:bg-muted/50">
							<TableCell>
								<Link
									href={`/tags/${tag.id}`}
									className="block hover:text-primary transition-colors"
								>
									<TagPath path={tag.path} />
								</Link>
							</TableCell>
							<TableCell className="text-right text-muted-foreground">{tag.problemCount}</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</div>
	);
}
