import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { ProblemTypeBadges } from "@/components/problems/problem-type-badges";
import { Badge } from "@/components/ui/badge";
import type { ProblemType } from "@/db/schema";

interface ProblemTitleCellProps {
	href: string;
	title: string;
	problemType: ProblemType;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	isPublic?: boolean;
	isSolved?: boolean;
	score?: number | null;
}

export function ProblemTitleCell({
	href,
	title,
	problemType,
	judgeAvailable,
	languageRestricted,
	isPublic = true,
	isSolved = false,
	score = null,
}: ProblemTitleCellProps) {
	return (
		<div className="flex items-center gap-2 min-w-0">
			<Link
				href={href}
				className="font-medium hover:text-primary transition-colors truncate min-w-0"
				title={title}
			>
				{title}
			</Link>
			<div className="flex items-center gap-2 shrink-0">
				<ProblemTypeBadges
					type={problemType}
					judgeAvailable={judgeAvailable}
					languageRestricted={languageRestricted}
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
