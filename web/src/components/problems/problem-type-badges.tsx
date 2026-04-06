import { Badge } from "@/components/ui/badge";
import type { ProblemType } from "@/db/schema";

interface ProblemTypeBadgeProps {
	type: ProblemType;
	judgeAvailable?: boolean;
}

export function ProblemTypeBadges({ type, judgeAvailable = true }: ProblemTypeBadgeProps) {
	return (
		<div className="flex items-center gap-2">
			{type === "special_judge" && (
				<Badge variant="outline" className="bg-secondary text-foreground">
					스페셜 저지
				</Badge>
			)}
			{type === "anigma" && (
				<Badge variant="outline" className="bg-secondary text-foreground">
					ANIGMA
				</Badge>
			)}
			{!judgeAvailable && (
				<Badge
					variant="outline"
					className="bg-[var(--verdict-tle-bg)] text-[var(--verdict-tle)] border-[var(--verdict-tle)]"
				>
					채점 준비중
				</Badge>
			)}
		</div>
	);
}
