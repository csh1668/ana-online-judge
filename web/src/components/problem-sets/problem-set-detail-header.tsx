import { Pencil } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { DeleteProblemSetButton } from "@/components/problem-sets/delete-problem-set-button";
import { LikeButton } from "@/components/problem-sets/like-button";
import { Button } from "@/components/ui/button";
import type { ProblemSetDetail } from "@/lib/services/problem-sets";

export function ProblemSetDetailHeader({
	detail,
	canEdit,
	isLoggedIn,
}: {
	detail: ProblemSetDetail;
	canEdit: boolean;
	isLoggedIn: boolean;
}) {
	const { set, creator, likedByViewer } = detail;
	return (
		<PageHeader
			title={set.title}
			description={
				<>
					<span className="block">by {creator.name}</span>
					{set.description && <MarkdownRenderer content={set.description} />}
				</>
			}
			actions={
				<>
					<LikeButton
						problemSetId={set.id}
						initialLiked={likedByViewer}
						initialCount={set.likeCount}
						disabled={!isLoggedIn}
					/>
					{canEdit && (
						<>
							<Button asChild variant="outline" size="sm">
								<Link href={`/problemsets/${set.id}/edit`}>
									<Pencil className="size-4" /> 편집
								</Link>
							</Button>
							<DeleteProblemSetButton problemSetId={set.id} />
						</>
					)}
				</>
			}
		/>
	);
}
