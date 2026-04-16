import { ExternalLink, Info } from "lucide-react";
import Link from "next/link";

export function PublishedBanner({ publishedProblemId }: { publishedProblemId: number }) {
	return (
		<div className="rounded-md border border-blue-200 bg-blue-50 p-4 flex items-start gap-3 text-sm text-blue-900">
			<Info className="h-5 w-5 flex-shrink-0 mt-0.5" />
			<div className="space-y-1">
				<p className="font-medium">이 문제는 이미 출판되었습니다.</p>
				<p>현재 편집 사항은 자동으로 반영되지 않습니다. 재출판이 필요하면 admin에게 문의하세요.</p>
				<Link
					href={`/problems/${publishedProblemId}`}
					className="inline-flex items-center gap-1 underline font-medium"
				>
					problem #{publishedProblemId} 보기 <ExternalLink className="h-3 w-3" />
				</Link>
			</div>
		</div>
	);
}
