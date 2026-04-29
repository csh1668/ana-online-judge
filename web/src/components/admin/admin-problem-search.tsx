"use client";

import { Loader2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { searchProblemsForAdminAction } from "@/actions/admin/problems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Suggestion = { id: number; title: string };

export function AdminProblemSearch({ className }: { className?: string }) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const selected = searchParams.get("problemId");
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [items, setItems] = useState<Suggestion[]>([]);
	const [loading, setLoading] = useState(false);
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
				const rows = await searchProblemsForAdminAction(query);
				setItems(rows);
			} finally {
				setLoading(false);
			}
		}, 200);
		return () => clearTimeout(t);
	}, [query]);

	const select = (id: number) => {
		const params = new URLSearchParams(searchParams.toString());
		params.set("problemId", String(id));
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
		setOpen(false);
		setQuery("");
	};

	const clear = () => {
		const params = new URLSearchParams(searchParams.toString());
		params.delete("problemId");
		params.set("page", "1");
		startTransition(() => router.replace(`?${params.toString()}`));
	};

	return (
		<div className={cn("relative", className)}>
			{selected ? (
				<div className="flex items-center gap-1 rounded-md border bg-accent/50 px-2 py-1 text-sm">
					<span>문제 #{selected}</span>
					<Button variant="ghost" size="icon" className="h-5 w-5" onClick={clear} type="button">
						<X className="h-3.5 w-3.5" />
					</Button>
				</div>
			) : (
				<Input
					placeholder="문제 ID 또는 제목"
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onFocus={() => setOpen(true)}
					onBlur={() => {
						blurTimer.current = setTimeout(() => setOpen(false), 150);
					}}
					className="w-[220px]"
				/>
			)}
			{open && !selected && query.trim() && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-auto rounded-md border bg-popover shadow-md">
					{loading ? (
						<div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
							<Loader2 className="h-3.5 w-3.5 animate-spin" /> 검색 중...
						</div>
					) : items.length === 0 ? (
						<div className="px-3 py-2 text-sm text-muted-foreground">결과 없음</div>
					) : (
						items.map((it) => (
							<button
								key={it.id}
								type="button"
								onMouseDown={(e) => {
									e.preventDefault();
									if (blurTimer.current) clearTimeout(blurTimer.current);
									select(it.id);
								}}
								className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
							>
								<span className="font-mono text-muted-foreground">#{it.id}</span>
								<span className="truncate">{it.title}</span>
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}
