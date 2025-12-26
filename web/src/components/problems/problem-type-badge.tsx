import { Badge } from "@/components/ui/badge";
import type { ProblemType } from "@/db/schema";

interface ProblemTypeBadgeProps {
	type: ProblemType;
}

export function ProblemTypeBadge({ type }: ProblemTypeBadgeProps) {
	if (type === "icpc") {
		return null; // 기본 ICPC 문제는 표시하지 않음
	}

	if (type === "special_judge") {
		return (
			<Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-300">
				스페셜 저지
			</Badge>
		);
	}

	if (type === "anigma") {
		return (
			<Badge variant="outline" className="bg-purple-500/10 text-purple-700 border-purple-300">
				ANIGMA
			</Badge>
		);
	}

	return null;
}
