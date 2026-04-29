"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { getProblems } from "@/actions/problems";
import { ProblemTitleCell } from "@/components/problems/problem-title-cell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { ProblemType } from "@/db/schema";

type Mode = "single" | "multi";

interface PickerProblem {
	id: number;
	title: string;
	problemType: ProblemType;
	judgeAvailable: boolean;
	languageRestricted: boolean;
	hasSubtasks?: boolean;
	isPublic: boolean;
	tier: number;
}

interface Props {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	mode?: Mode;
	excludeIds?: number[];
	maxSelect?: number;
	onConfirm: (selected: PickerProblem[]) => void | Promise<void>;
	confirmLabel?: string;
	title?: string;
	description?: string;
}

const PAGE_SIZE = 15;

export function ProblemPickerDialog({
	open,
	onOpenChange,
	mode = "multi",
	excludeIds = [],
	maxSelect,
	onConfirm,
	confirmLabel,
	title = "문제 선택",
	description = "검색하여 문제를 선택하세요. 공개되어 있고 채점 가능한 문제만 표시됩니다.",
}: Props) {
	const [searchInput, setSearchInput] = useState("");
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const [problems, setProblems] = useState<PickerProblem[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(false);
	const [selected, setSelected] = useState<Map<number, PickerProblem>>(new Map());
	const [submitting, setSubmitting] = useState(false);

	useEffect(() => {
		if (!open) return;
		setSearchInput("");
		setSearch("");
		setPage(1);
		setSelected(new Map());
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const timer = setTimeout(() => {
			setSearch(searchInput);
			setPage(1);
		}, 300);
		return () => clearTimeout(timer);
	}, [searchInput, open]);

	useEffect(() => {
		if (!open) return;
		let cancelled = false;
		setLoading(true);
		(async () => {
			try {
				const result = await getProblems({
					page,
					limit: PAGE_SIZE,
					search: search || undefined,
				});
				if (cancelled) return;
				setProblems(result.problems);
				setTotal(result.total);
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [open, page, search]);

	const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
	const excludeSet = new Set(excludeIds);

	function toggle(p: PickerProblem) {
		setSelected((prev) => {
			const next = new Map(prev);
			if (next.has(p.id)) {
				next.delete(p.id);
			} else {
				if (mode === "single") {
					next.clear();
					next.set(p.id, p);
				} else {
					if (maxSelect !== undefined && next.size >= maxSelect) return prev;
					next.set(p.id, p);
				}
			}
			return next;
		});
	}

	async function handleConfirm() {
		if (selected.size === 0) return;
		setSubmitting(true);
		try {
			await onConfirm(Array.from(selected.values()));
			onOpenChange(false);
		} finally {
			setSubmitting(false);
		}
	}

	const remainingCapacity =
		maxSelect !== undefined ? Math.max(0, maxSelect - selected.size) : Number.POSITIVE_INFINITY;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="min-w-3xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					<div className="relative">
						<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							placeholder="문제 검색 (제목, id:번호, *티어, #태그)"
							className="pl-8"
							value={searchInput}
							onChange={(e) => setSearchInput(e.target.value)}
						/>
					</div>

					<div className="rounded-md border">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead className="w-[40px]" />
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead>제목</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{loading ? (
									<TableRow>
										<TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
											<Loader2 className="inline h-4 w-4 animate-spin mr-2" />
											불러오는 중...
										</TableCell>
									</TableRow>
								) : problems.length === 0 ? (
									<TableRow>
										<TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
											검색 결과가 없습니다.
										</TableCell>
									</TableRow>
								) : (
									problems.map((p) => {
										const isExcluded = excludeSet.has(p.id);
										const isSelected = selected.has(p.id);
										const disabled =
											isExcluded || (!isSelected && mode === "multi" && remainingCapacity === 0);
										return (
											<TableRow
												key={p.id}
												data-disabled={disabled}
												className={
													disabled
														? "opacity-50 cursor-not-allowed"
														: "cursor-pointer hover:bg-muted/50"
												}
												onClick={() => {
													if (disabled) return;
													toggle(p);
												}}
											>
												<TableCell className="py-2">
													<Checkbox
														checked={isSelected}
														disabled={disabled}
														onCheckedChange={() => {
															if (disabled) return;
															toggle(p);
														}}
														onClick={(e) => e.stopPropagation()}
													/>
												</TableCell>
												<TableCell className="font-mono text-muted-foreground py-2">
													{p.id}
												</TableCell>
												<TableCell className="py-2">
													<div className="flex items-center gap-2">
														<ProblemTitleCell
															title={p.title}
															problemType={p.problemType}
															judgeAvailable={p.judgeAvailable}
															languageRestricted={p.languageRestricted}
															hasSubtasks={p.hasSubtasks}
															isPublic={p.isPublic}
															tier={p.tier}
														/>
														{isExcluded && (
															<span className="text-xs text-muted-foreground">(이미 추가됨)</span>
														)}
													</div>
												</TableCell>
											</TableRow>
										);
									})
								)}
							</TableBody>
						</Table>
					</div>

					{totalPages > 1 && (
						<PaginationLinks
							currentPage={page}
							totalPages={totalPages}
							onPageChange={(p) => setPage(p)}
							disabled={loading}
						/>
					)}
				</div>

				<DialogFooter className="sm:justify-between">
					<div className="text-sm text-muted-foreground">
						선택됨: {selected.size}
						{maxSelect !== undefined ? ` / ${maxSelect}` : ""}
					</div>
					<div className="flex gap-2">
						<Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
							취소
						</Button>
						<Button onClick={handleConfirm} disabled={selected.size === 0 || submitting}>
							{submitting ? "처리 중..." : (confirmLabel ?? "추가")}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export type { PickerProblem };
