"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { updateDraftToLatestSnapshot } from "@/actions/workshop/snapshots";
import { Button } from "@/components/ui/button";

type StaleInfo = {
	baseSnapshotId: number | null;
	latestSnapshotId: number;
	latestLabel: string;
};

export function StaleDraftWarning({
	problemId,
	stale,
}: {
	problemId: number;
	stale: StaleInfo | null;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	if (!stale) return null;

	const handleUpdate = () => {
		startTransition(async () => {
			try {
				await updateDraftToLatestSnapshot(problemId);
				toast.success(`최신 스냅샷("${stale.latestLabel}")으로 업데이트했습니다`);
				router.refresh();
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "업데이트 실패");
			}
		});
	};

	return (
		<div className="border border-amber-500/50 bg-amber-50 dark:bg-amber-950/20 rounded p-4 mb-6 flex items-start gap-3">
			<AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
			<div className="flex-1">
				<h3 className="font-medium">다른 멤버가 새 스냅샷을 커밋했습니다</h3>
				<p className="text-sm text-muted-foreground mt-1">
					당신의 작업은 이전 스냅샷 기반입니다. 최신 스냅샷("{stale.latestLabel}")으로 업데이트할 수
					있습니다. 업데이트 시 현재 작업은 "auto/update 전" 스냅샷으로 자동 백업됩니다.
				</p>
			</div>
			<Button onClick={handleUpdate} disabled={isPending} variant="outline">
				{isPending ? (
					<>
						<Loader2 className="h-4 w-4 mr-2 animate-spin" />
						업데이트 중…
					</>
				) : (
					"최신으로 업데이트"
				)}
			</Button>
		</div>
	);
}
