"use client";

import { Loader2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchUsersPublic } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Suggestion = { id: number; username: string; name: string };

function parseIds(raw: string | null): number[] {
	if (!raw) return [];
	return raw
		.split(",")
		.map((s) => Number.parseInt(s, 10))
		.filter((n) => Number.isFinite(n));
}

export function AdminUserMultiSearch({ className }: { className?: string }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const selectedIds = parseIds(searchParams.get("userIds"));
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<Suggestion[]>([]);
	const [loading, setLoading] = useState(false);
	const [labelCache, setLabelCache] = useState<Record<number, string>>({});
	const [, startTransition] = useTransition();
	const blurTimer = useRef<NodeJS.Timeout | null>(null);

	useEffect(() => {
		if (!query.trim()) {
			setItems([]);
			return;
		}
		setLoading(true);
		const t = setTimeout(async () => {
			try {
				const rows = await searchUsersPublic(query);
				setItems(rows);
			} finally {
				setLoading(false);
			}
		}, 200);
		return () => clearTimeout(t);
	}, [query]);

	const updateUrl = (ids: number[]) => {
		const params = new URLSearchParams(searchParams.toString());
		if (ids.length === 0) params.delete("userIds");
		else params.set("userIds", ids.join(","));
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
	};

	const add = (s: Suggestion) => {
		setLabelCache((c) => ({ ...c, [s.id]: s.username }));
		const next = Array.from(new Set([...selectedIds, s.id]));
		updateUrl(next);
		setQuery("");
	};

	const remove = (id: number) => {
		updateUrl(selectedIds.filter((x) => x !== id));
	};

	return (
		<div className={cn("flex flex-wrap items-center gap-1.5", className)}>
			{selectedIds.map((id) => (
				<div
					key={id}
					className="flex items-center gap-1 rounded-md border bg-accent/50 px-2 py-1 text-sm"
					title={labelCache[id] ?? `user #${id}`}
				>
					<span>{labelCache[id] ?? `#${id}`}</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="h-5 w-5"
						onClick={() => remove(id)}
					>
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			))}
			<div className="relative">
				<Input
					placeholder="사용자 추가"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						blurTimer.current = setTimeout(() => setOpen(false), 150);
					}}
					className="w-[180px]"
				/>
				{open && query.trim() && (
					<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-md">
						{loading ? (
							<div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
								<Loader2 className="h-3.5 w-3.5 animate-spin" /> 검색 중...
							</div>
						) : items.length === 0 ? (
							<div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
						) : (
							items.map((u) => (
								<button
									key={u.id}
									type="button"
									onMouseDown={(e) => {
										e.preventDefault();
										if (blurTimer.current) clearTimeout(blurTimer.current);
										add(u);
									}}
									className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
								>
									<span className="font-medium">{u.username}</span>
									<span className="text-muted-foreground text-xs">{u.name}</span>
								</button>
							))
						)}
					</div>
				)}
			</div>
		</div>
	);
}
