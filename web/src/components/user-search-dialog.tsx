"use client";

import { Loader2, Search, UserPlus } from "lucide-react";
import { type ReactNode, useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type UserSearchResult = { id: number; username: string; name: string };

interface UserSearchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title?: string;
	description?: string;
	/** Server action to search users by query */
	searchAction: (query: string) => Promise<UserSearchResult[]>;
	/** Called when a user is picked. Return a promise to await before closing. */
	onSelect: (user: UserSearchResult) => void | Promise<void>;
	/** Already-selected user ids — shown as disabled */
	excludeIds?: number[];
	/** Optional empty-state node */
	emptyState?: ReactNode;
	/** Close dialog after selecting (default: true) */
	closeOnSelect?: boolean;
}

export function UserSearchDialog({
	open,
	onOpenChange,
	title = "사용자 검색",
	description = "아이디 또는 이름으로 검색하세요.",
	searchAction,
	onSelect,
	excludeIds = [],
	emptyState,
	closeOnSelect = true,
}: UserSearchDialogProps) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<UserSearchResult[]>([]);
	const [searching, setSearching] = useState(false);
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	// Reset state on close
	useEffect(() => {
		if (!open) {
			setQuery("");
			setResults([]);
			setError(null);
		}
	}, [open]);

	useEffect(() => {
		const q = query.trim();
		if (q.length < 2) {
			setResults([]);
			return;
		}
		let cancelled = false;
		setSearching(true);
		setError(null);
		const handle = setTimeout(async () => {
			try {
				const r = await searchAction(q);
				if (!cancelled) setResults(r);
			} catch (e) {
				if (!cancelled) setError(e instanceof Error ? e.message : "검색 실패");
			} finally {
				if (!cancelled) setSearching(false);
			}
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(handle);
		};
	}, [query, searchAction]);

	const exclude = new Set(excludeIds);

	const handlePick = (user: UserSearchResult) => {
		startTransition(async () => {
			setError(null);
			try {
				await onSelect(user);
				if (closeOnSelect) {
					onOpenChange(false);
				}
			} catch (e) {
				setError(e instanceof Error ? e.message : "추가 실패");
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>{description}</DialogDescription>
				</DialogHeader>

				<div className="space-y-4">
					<div className="relative">
						<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
						<Input
							autoFocus
							placeholder="아이디 또는 이름으로 검색..."
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							className="pl-9"
							disabled={isPending}
						/>
					</div>

					{error && (
						<div className="bg-destructive/10 text-destructive px-3 py-2 rounded-md text-sm">
							{error}
						</div>
					)}

					{searching && (
						<div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
							<Loader2 className="mr-2 h-4 w-4 animate-spin" /> 검색 중...
						</div>
					)}

					{!searching && query.trim().length < 2 && (
						<div className="text-center py-8 text-muted-foreground text-sm">
							{emptyState ?? "최소 2자 이상 입력해주세요."}
						</div>
					)}

					{!searching && query.trim().length >= 2 && results.length === 0 && !error && (
						<div className="text-center py-8 text-muted-foreground text-sm">
							검색 결과가 없습니다.
						</div>
					)}

					{!searching && results.length > 0 && (
						<div className="max-h-[320px] overflow-y-auto rounded-md border divide-y">
							{results.map((u) => {
								const already = exclude.has(u.id);
								return (
									<div
										key={u.id}
										className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
									>
										<div>
											<div className="font-medium">{u.username}</div>
											<div className="text-sm text-muted-foreground">{u.name}</div>
										</div>
										<Button
											size="sm"
											variant={already ? "outline" : "default"}
											disabled={already || isPending}
											onClick={() => handlePick(u)}
										>
											{already ? (
												"이미 추가됨"
											) : isPending ? (
												<>
													<Loader2 className="mr-1 h-3 w-3 animate-spin" />
													추가 중
												</>
											) : (
												<>
													<UserPlus className="mr-1 h-3 w-3" /> 추가
												</>
											)}
										</Button>
									</div>
								);
							})}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
