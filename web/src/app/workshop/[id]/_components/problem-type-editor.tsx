"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateWorkshopProblemType } from "@/actions/workshop/problems";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { DRAFT_VERSION_CONFLICT_MESSAGE } from "@/lib/workshop/draft-version";

export function WorkshopProblemTypeEditor({
	problemId,
	problemType: initialProblemType,
	hasChecker,
	initialVersion,
}: {
	problemId: number;
	problemType: "icpc" | "special_judge";
	hasChecker: boolean;
	initialVersion: number;
}) {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [problemType, setProblemType] = useState<"icpc" | "special_judge">(initialProblemType);
	const [version, setVersion] = useState(initialVersion);

	// Sibling forms on the same dashboard (limits editor) share this draft
	// row — a router.refresh() triggered by either one re-renders both with
	// a fresh `initialVersion`; re-sync so this form doesn't save against a
	// version the sibling already bumped.
	useEffect(() => setVersion(initialVersion), [initialVersion]);

	const dirty = problemType !== initialProblemType;
	const showCheckerHint = problemType === "special_judge" && !hasChecker;

	function onSave() {
		startTransition(async () => {
			try {
				const updated = await updateWorkshopProblemType(problemId, {
					problemType,
					expectedVersion: version,
				});
				setVersion(updated.version);
				toast.success("문제 형식이 저장되었습니다");
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
		setProblemType(initialProblemType);
	}

	return (
		<div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
			<div className="space-y-1">
				<Label htmlFor="ws-problem-type" className="text-xs">
					문제 형식
				</Label>
				<Select
					value={problemType}
					onValueChange={(v) => setProblemType(v as "icpc" | "special_judge")}
					disabled={pending}
				>
					<SelectTrigger id="ws-problem-type" className="h-8 w-64">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="icpc">ICPC (stdout 비교)</SelectItem>
						<SelectItem value="special_judge">Special Judge (커스텀 체커)</SelectItem>
					</SelectContent>
				</Select>
			</div>
			{showCheckerHint && (
				<p className="text-xs text-muted-foreground">
					스페셜 저지는 커스텀 체커가 필요합니다 — 체커 탭에서 작성하세요.
				</p>
			)}
			<div className="ml-auto flex items-center gap-2">
				{dirty && (
					<Button variant="ghost" size="sm" onClick={onReset} disabled={pending}>
						되돌리기
					</Button>
				)}
				<Button size="sm" onClick={onSave} disabled={!dirty || pending}>
					{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "저장"}
				</Button>
			</div>
		</div>
	);
}
