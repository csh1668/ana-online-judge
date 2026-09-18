import { Badge } from "@/components/ui/badge";
import type { ContestStatus } from "@/lib/contest-utils";

const LABEL: Record<ContestStatus, string> = {
	upcoming: "예정",
	running: "진행중",
	finished: "종료",
};

const VARIANT: Record<ContestStatus, "secondary" | "default" | "outline"> = {
	upcoming: "secondary",
	running: "default",
	finished: "outline",
};

/** 대회·연습 공용 상태 뱃지. 로컬 getStatusBadge 재선언 금지. */
export function ContestStatusBadge({
	status,
	className,
}: {
	status: ContestStatus;
	className?: string;
}) {
	return (
		<Badge variant={VARIANT[status]} className={className}>
			{LABEL[status]}
		</Badge>
	);
}
