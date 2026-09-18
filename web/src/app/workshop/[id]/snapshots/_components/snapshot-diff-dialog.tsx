"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { getWorkshopSnapshotDiff } from "@/actions/workshop/snapshots";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ListDiff, SnapshotDiff } from "@/lib/services/workshop-snapshot-diff";

type SnapshotOption = {
	id: number;
	label: string;
};

const HEADER_FIELD_LABELS: Record<string, string> = {
	title: "제목",
	problemType: "문제 유형",
	timeLimit: "시간 제한",
	memoryLimit: "메모리 제한",
	seed: "시드",
	checkerLanguage: "체커 언어",
	checkerHash: "체커",
	validatorLanguage: "검증기 언어",
	validatorHash: "검증기",
	generatorScript: "생성 스크립트",
	description: "본문",
};

function ListDiffSection({ title, diff }: { title: string; diff: ListDiff }) {
	const empty = diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
	return (
		<div>
			<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">{title}</p>
			{empty ? (
				<p className="mt-1 text-sm text-muted-foreground">변경 없음</p>
			) : (
				<div className="mt-1 space-y-1 text-sm">
					{diff.added.length > 0 && (
						<p>
							<span className="text-muted-foreground">추가</span> {diff.added.join(", ")}
						</p>
					)}
					{diff.removed.length > 0 && (
						<p>
							<span className="text-muted-foreground">삭제</span> {diff.removed.join(", ")}
						</p>
					)}
					{diff.changed.length > 0 && (
						<p>
							<span className="text-muted-foreground">변경</span> {diff.changed.join(", ")}
						</p>
					)}
				</div>
			)}
		</div>
	);
}

export function SnapshotDiffDialog({
	problemId,
	snapshots,
}: {
	problemId: number;
	snapshots: SnapshotOption[];
}) {
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [fromId, setFromId] = useState<string>("");
	const [toId, setToId] = useState<string>("");
	const [diff, setDiff] = useState<SnapshotDiff | null>(null);

	const handleCompare = () => {
		const from = Number.parseInt(fromId, 10);
		const to = Number.parseInt(toId, 10);
		if (!Number.isFinite(from) || !Number.isFinite(to)) {
			toast.error("비교할 스냅샷 두 개를 선택해주세요");
			return;
		}
		if (from === to) {
			toast.error("서로 다른 스냅샷을 선택해주세요");
			return;
		}
		setDiff(null);
		startTransition(async () => {
			try {
				const result = await getWorkshopSnapshotDiff(problemId, from, to);
				setDiff(result);
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "비교 실패");
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button variant="outline" disabled={snapshots.length < 2}>
					비교
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>스냅샷 비교</DialogTitle>
					<DialogDescription>
						두 스냅샷을 선택해 변경된 헤더 필드와 항목 목록을 비교합니다.
					</DialogDescription>
				</DialogHeader>
				<div className="grid grid-cols-2 gap-3">
					<div>
						<Label htmlFor="diff-from">기준</Label>
						<Select value={fromId} onValueChange={setFromId} disabled={isPending}>
							<SelectTrigger id="diff-from">
								<SelectValue placeholder="스냅샷 선택" />
							</SelectTrigger>
							<SelectContent>
								{snapshots.map((s) => (
									<SelectItem key={s.id} value={String(s.id)}>
										#{s.id} {s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					<div>
						<Label htmlFor="diff-to">대상</Label>
						<Select value={toId} onValueChange={setToId} disabled={isPending}>
							<SelectTrigger id="diff-to">
								<SelectValue placeholder="스냅샷 선택" />
							</SelectTrigger>
							<SelectContent>
								{snapshots.map((s) => (
									<SelectItem key={s.id} value={String(s.id)}>
										#{s.id} {s.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>
				<Button onClick={handleCompare} disabled={isPending}>
					{isPending ? "비교 중…" : "비교"}
				</Button>

				{diff && (
					<div className="space-y-4">
						<div>
							<p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
								헤더
							</p>
							{diff.header.length === 0 ? (
								<p className="mt-1 text-sm text-muted-foreground">변경 없음</p>
							) : (
								<Table className="mt-1 min-w-[640px]">
									<TableHeader>
										<TableRow>
											<TableHead className="w-[120px]">필드</TableHead>
											<TableHead className="w-[200px]">이전</TableHead>
											<TableHead>이후</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{diff.header.map((c) => (
											<TableRow key={c.field}>
												<TableCell className="text-sm">
													{HEADER_FIELD_LABELS[c.field] ?? c.field}
												</TableCell>
												{c.field === "description" ? (
													<TableCell className="text-sm text-muted-foreground" colSpan={2}>
														본문 변경됨
													</TableCell>
												) : (
													<>
														<TableCell className="text-sm text-muted-foreground">
															<div className="block truncate" title={c.from}>
																{c.from || "—"}
															</div>
														</TableCell>
														<TableCell className="text-sm">
															<div className="block truncate" title={c.to}>
																{c.to || "—"}
															</div>
														</TableCell>
													</>
												)}
											</TableRow>
										))}
									</TableBody>
								</Table>
							)}
						</div>
						<ListDiffSection title="테스트케이스" diff={diff.testcases} />
						<ListDiffSection title="솔루션" diff={diff.solutions} />
						<ListDiffSection title="생성기" diff={diff.generators} />
						<ListDiffSection title="리소스" diff={diff.resources} />
						<ListDiffSection title="지문 이미지" diff={diff.images} />
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
