"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateWorkshopProblemLimits } from "@/actions/workshop/problems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DRAFT_VERSION_CONFLICT_MESSAGE } from "@/lib/workshop/draft-version";

export function WorkshopLimitsEditor({
	problemId,
	initialTimeLimit,
	initialMemoryLimit,
	initialVersion,
}: {
	problemId: number;
	initialTimeLimit: number;
	initialMemoryLimit: number;
	initialVersion: number;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [timeLimit, setTimeLimit] = useState(initialTimeLimit);
	const [memoryLimit, setMemoryLimit] = useState(initialMemoryLimit);
	const [version, setVersion] = useState(initialVersion);

	// Sibling forms on the same dashboard (problem-type editor) share this
	// draft row — a router.refresh() triggered by either one re-renders both
	// with a fresh `initialVersion`; re-sync so this form doesn't save against
	// a version the sibling already bumped.
	useEffect(() => setVersion(initialVersion), [initialVersion]);

	const dirty = timeLimit !== initialTimeLimit || memoryLimit !== initialMemoryLimit;
	const valid =
		Number.isInteger(timeLimit) &&
		timeLimit >= 100 &&
		timeLimit <= 10000 &&
		Number.isInteger(memoryLimit) &&
		memoryLimit >= 16 &&
		memoryLimit <= 2048;

	function onSave() {
		startTransition(async () => {
			try {
				const updated = await updateWorkshopProblemLimits(problemId, {
					timeLimit,
					memoryLimit,
					expectedVersion: version,
				});
				setVersion(updated.version);
				toast.success("제한이 저장되었습니다");
				router.refresh();
			} catch (err) {
				const message = err instanceof Error ? err.message : "저장에 실패했습니다";
				if (message.includes(DRAFT_VERSION_CONFLICT_MESSAGE)) {
					toast.error(message, {
						action: { label: "새로고침", onClick: () => router.refresh() },
					});
				} else {
					toast.error(message);
				}
			}
		});
	}

	function onReset() {
		setTimeLimit(initialTimeLimit);
		setMemoryLimit(initialMemoryLimit);
	}

	return (
		<div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
			<div className="space-y-1">
				<Label htmlFor="ws-time-limit" className="text-xs">
					시간 제한 (ms)
				</Label>
				<Input
					id="ws-time-limit"
					type="number"
					min={100}
					max={10000}
					step={100}
					className="h-8 w-28"
					value={timeLimit}
					onChange={(e) => {
						const v = e.currentTarget.valueAsNumber;
						if (Number.isFinite(v)) setTimeLimit(v);
					}}
					disabled={pending}
				/>
			</div>
			<div className="space-y-1">
				<Label htmlFor="ws-memory-limit" className="text-xs">
					메모리 제한 (MB)
				</Label>
				<Input
					id="ws-memory-limit"
					type="number"
					min={16}
					max={2048}
					step={16}
					className="h-8 w-28"
					value={memoryLimit}
					onChange={(e) => {
						const v = e.currentTarget.valueAsNumber;
						if (Number.isFinite(v)) setMemoryLimit(v);
					}}
					disabled={pending}
				/>
			</div>
			<div className="ml-auto flex items-center gap-2">
				{dirty && (
					<Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>
						되돌리기
					</Button>
				)}
				<Button size="sm" onClick={onSave} disabled={!dirty || !valid || pending}>
					{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
				</Button>
			</div>
		</div>
	);
}
