import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { ProblemTypeBadges } from "@/components/problems/problem-type-badges";
import { TierBadge } from "@/components/tier/tier-badge";
import { Badge } from "@/components/ui/badge";
import type { ProblemType } from "@/db/schema";

interface ProblemTitleCellProps {
	href?: string;
	title: string;
	problemType: ProblemType;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	hasSubtasks?: boolean;
	isPublic?: boolean;
	isSolved?: boolean;
	score?: number | null;
	tier?: number; // 새 prop: 정수 티어. undefined면 Unrated(0)로 취급
}

export function ProblemTitleCell({
	href,
	title,
	problemType,
	judgeAvailable,
	languageRestricted,
	hasSubtasks = false,
	isPublic = true,
	isSolved = false,
	score = null,
	tier = 0,
}: ProblemTitleCellProps) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<TierBadge tier={tier} kind="problem" size="sm" />
			{href ? (
				<Link
					href={href}
					className="font-medium hover:text-primary transition-colors truncate min-w-0"
					title={title}
				>
					<MarkdownRenderer content={title} inline />
				</Link>
			) : (
				<span className="font-medium truncate min-w-0" title={title}>
					<MarkdownRenderer content={title} inline />
				</span>
			)}
			<div className="flex items-center gap-2 shrink-0">
				<ProblemTypeBadges
					type={problemType}
					judgeAvailable={judgeAvailable}
					languageRestricted={languageRestricted}
					hasSubtasks={hasSubtasks}
				/>
				{!isPublic && (
					<Badge variant="secondary" className="text-xs">
						비공개
					</Badge>
				)}
				{isSolved && (
					<div className="flex items-center gap-1">
						<CheckCircle2 className="h-4 w-4 text-green-600" />
						{problemType === "anigma" && score !== null && (
							<span className="text-sm text-muted-foreground">{score}점</span>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
