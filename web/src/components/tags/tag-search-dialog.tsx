"use client";

import { useEffect, useState } from "react";
import { searchTagsAction } from "@/actions/tags";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { TagWithPath } from "@/lib/services/algorithm-tags";
import { TagPath } from "./tag-path";

interface TagSearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedTagIds: number[];
	onSelect: (tag: TagWithPath) => void;
	maxReached: boolean;
}

export function TagSearchDialog({
	open,
	onOpenChange,
	selectedTagIds,
	onSelect,
	maxReached,
}: TagSearchDialogProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<TagWithPath[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) {
			setQuery("");
			setResults([]);
		}
	}, [open]);

	useEffect(() => {
		if (!open) return;
		if (!query.trim()) {
			setResults([]);
			return;
		}
		const handle = setTimeout(async () => {
			setLoading(true);
			try {
				const r = await searchTagsAction(query);
				setResults(r);
			} finally {
				setLoading(false);
			}
		}, 300);
		return () => clearTimeout(handle);
	}, [query, open]);

	const selectedSet = new Set(selectedTagIds);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>알고리즘 태그 추가</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder="태그 이름 검색..."
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						autoFocus
					/>
					{maxReached && (
						<p className="text-xs text-amber-600">최대 10개까지 선택할 수 있습니다.</p>
					)}
					<div className="max-h-72 overflow-y-auto space-y-1">
						{loading && <p className="text-sm text-muted-foreground">검색 중...</p>}
						{!loading && query.trim() && results.length === 0 && (
							<p className="text-sm text-muted-foreground">검색 결과 없음</p>
						)}
						{results.map((tag) => {
							const already = selectedSet.has(tag.id);
							const disabled = already || maxReached;
							return (
								<Button
									key={tag.id}
									variant="ghost"
									size="sm"
									className="w-full justify-start h-auto py-2"
									disabled={disabled}
									onClick={() => onSelect(tag)}
								>
									<TagPath path={tag.path} />
									{already && <span className="ml-2 text-xs">(추가됨)</span>}
								</Button>
							);
						})}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
