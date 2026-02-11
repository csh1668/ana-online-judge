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
				<Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300">
					스페셜 저지
				</Badge>
			)}
			{type === "anigma" && (
				<Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-300">
					ANIGMA
				</Badge>
			)}
			{!judgeAvailable && (
				<Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-300">
					채점 준비중
				</Badge>
			)}
		</div>
	);
}
