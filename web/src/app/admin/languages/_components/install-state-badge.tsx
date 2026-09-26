import { Badge } from "@/components/ui/badge";
import type { Verdict } from "@/db/schema";
import type { LanguageAdminRow } from "@/lib/services/languages";

type BadgeRow = Pick<
	LanguageAdminRow,
	"installScript" | "installState" | "needsReinstall" | "deletedAt"
>;

/** 설치 상태 → (라벨, verdict 색 계열). 색은 verdict 토큰만 재사용한다. */
function describe(row: BadgeRow): { label: string; verdict: Verdict } | null {
	if (row.installState === "installing") return { label: "설치 중", verdict: "judging" };
	if (row.installScript === null) return null;
	if (row.installState === "failed") return { label: "실패", verdict: "fail" };
	if (row.installState === "installed") {
		return row.needsReinstall
			? { label: "재설치 필요", verdict: "time_limit_exceeded" }
			: { label: "설치됨", verdict: "accepted" };
	}
	return { label: "미설치", verdict: "skipped" };
}

export function InstallStateBadge({ row }: { row: BadgeRow }) {
	const d = describe(row);
	return (
		<span className="inline-flex items-center gap-1">
			{d ? (
				<Badge variant="verdict" verdict={d.verdict}>
					{d.label}
				</Badge>
			) : (
				<Badge variant="secondary">내장</Badge>
			)}
			{row.deletedAt && <Badge variant="outline">삭제됨</Badge>}
		</span>
	);
}
