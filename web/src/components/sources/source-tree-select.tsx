"use client";

import { ChevronDown, ChevronRight, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { getBreadcrumbAction, listChildrenAction, searchSourcesAction } from "@/actions/sources";
import {
	publicGetBreadcrumb,
	publicListChildren,
	publicSearchSources,
} from "@/actions/sources/public";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export interface SourceNode {
	id: number;
	parentId: number | null;
	slug: string;
	name: string;
	year: number | null;
}

interface BaseProps {
	excludeSubtreeOf?: number;
	className?: string;
	placeholder?: string;
	fetchChildren: (parentId: number | null) => Promise<SourceNode[]>;
	fetchAncestors: (id: number) => Promise<SourceNode[]>;
	search: (query: string) => Promise<SourceNode[]>;
}

interface SingleProps extends BaseProps {
	mode: "single";
	value: number | null;
	onChange: (id: number | null) => void;
}

interface MultiProps extends BaseProps {
	mode: "multi";
	value: number[];
	onChange: (ids: number[]) => void;
}

export type SourceTreeSelectProps = SingleProps | MultiProps;

export function SourceTreeSelect(props: SourceTreeSelectProps) {
	const [open, setOpen] = useState(false);
	const [roots, setRoots] = useState<SourceNode[] | null>(null);
	const [childrenMap, setChildrenMap] = useState<Record<number, SourceNode[] | undefined>>({});
	const [expanded, setExpanded] = useState<Set<number>>(new Set());
	const [query, setQuery] = useState("");
	const [searchResults, setSearchResults] = useState<SourceNode[] | null>(null);

	const selectedIds = useMemo(
		() => (props.mode === "single" ? (props.value !== null ? [props.value] : []) : props.value),
		[props]
	);

	const loadRoots = useCallback(async () => {
		const rows = await props.fetchChildren(null);
		setRoots(rows);
	}, [props.fetchChildren]);

	const loadChildren = useCallback(
		async (parentId: number) => {
			const rows = await props.fetchChildren(parentId);
			setChildrenMap((m) => ({ ...m, [parentId]: rows }));
		},
		[props.fetchChildren]
	);

	// 초기 로드 + 선택값 ancestor 자동 expand
	// biome-ignore lint/correctness/useExhaustiveDependencies: popover 오픈 시 1회만 실행되어야 함 (선택값/fetcher 변화로 재실행 금지)
	useEffect(() => {
		if (!open) return;
		if (!roots) loadRoots();
		(async () => {
			for (const id of selectedIds) {
				const chain = await props.fetchAncestors(id);
				setExpanded((prev) => {
					const next = new Set(prev);
					for (const seg of chain) next.add(seg.id);
					return next;
				});
				for (const seg of chain) {
					await loadChildren(seg.id);
				}
			}
		})();
	}, [open]);

	// 디바운스 검색
	useEffect(() => {
		const t = setTimeout(async () => {
			if (!query) {
				setSearchResults(null);
				return;
			}
			const rows = await props.search(query);
			setSearchResults(rows);
		}, 200);
		return () => clearTimeout(t);
	}, [query, props.search]);

	const toggleExpand = async (id: number) => {
		const isOpen = expanded.has(id);
		const next = new Set(expanded);
		if (isOpen) next.delete(id);
		else {
			next.add(id);
			if (!childrenMap[id]) await loadChildren(id);
		}
		setExpanded(next);
	};

	const handlePick = (id: number) => {
		if (props.mode === "single") {
			props.onChange(id);
			setOpen(false);
		} else {
			const set = new Set(props.value);
			if (set.has(id)) set.delete(id);
			else set.add(id);
			props.onChange([...set]);
		}
	};

	const renderNode = (node: SourceNode) => {
		if (props.excludeSubtreeOf === node.id) return null;
		const isOpen = expanded.has(node.id);
		const children = childrenMap[node.id];
		const isSelected = selectedIds.includes(node.id);
		return (
			<div key={node.id}>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => toggleExpand(node.id)}
						className="text-muted-foreground hover:text-foreground"
						aria-label={isOpen ? "접기" : "펼치기"}
					>
						{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
					</button>
					<button
						type="button"
						onClick={() => handlePick(node.id)}
						className={cn(
							"flex-1 text-left px-2 py-1 rounded text-sm hover:bg-accent",
							isSelected && "bg-accent font-medium"
						)}
					>
						{node.name}
						{node.year !== null && (
							<span className="ml-1 text-xs text-muted-foreground">({node.year})</span>
						)}
					</button>
				</div>
				{isOpen && children && <div className="ml-4 border-l pl-2">{children.map(renderNode)}</div>}
			</div>
		);
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button variant="outline" className={cn("justify-between", props.className)}>
					<span>
						{props.mode === "single"
							? props.value !== null
								? `#${props.value}`
								: (props.placeholder ?? "출처 선택")
							: `${props.value.length}개 선택`}
					</span>
					<ChevronDown className="h-4 w-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-80 p-0">
				<div className="flex items-center gap-2 border-b p-2">
					<Search className="h-4 w-4 text-muted-foreground" />
					<Input
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="이름 검색"
						className="h-8 border-0 focus-visible:ring-0"
					/>
					{query && (
						<button type="button" onClick={() => setQuery("")}>
							<X className="h-4 w-4 text-muted-foreground" />
						</button>
					)}
				</div>
				<ScrollArea className="max-h-80 p-2">
					{searchResults ? (
						searchResults.length === 0 ? (
							<p className="px-2 py-4 text-sm text-muted-foreground">결과 없음</p>
						) : (
							searchResults.map((node) => (
								<button
									key={node.id}
									type="button"
									onClick={() => handlePick(node.id)}
									className="block w-full text-left px-2 py-1 rounded text-sm hover:bg-accent"
								>
									{node.name}
								</button>
							))
						)
					) : (
						(roots ?? []).map(renderNode)
					)}
				</ScrollArea>
				{props.mode === "multi" && props.value.length > 0 && (
					<div className="border-t p-2 flex flex-wrap gap-1">
						{props.value.map((id) => (
							<button
								key={id}
								type="button"
								onClick={() => props.onChange(props.value.filter((v) => v !== id))}
								className="inline-flex items-center gap-1 text-xs bg-accent rounded px-2 py-0.5"
							>
								#{id} <X className="h-3 w-3" />
							</button>
						))}
					</div>
				)}
			</PopoverContent>
		</Popover>
	);
}

// 공용 fetcher 팩토리 — admin 과 public 모두 동일한 fetcher prop shape 을 만든다.

async function ancestorsToNodes(chain: Awaited<ReturnType<typeof publicGetBreadcrumb>>) {
	return chain.map((c) => ({
		id: c.id,
		parentId: c.parentId,
		slug: c.slug,
		name: c.name,
		year: null as number | null,
	}));
}

export function useAdminSourceTreeSelectFetchers() {
	return {
		fetchChildren: listChildrenAction,
		fetchAncestors: async (id: number) => ancestorsToNodes(await getBreadcrumbAction(id)),
		search: searchSourcesAction,
	} satisfies Pick<SourceTreeSelectProps, "fetchChildren" | "fetchAncestors" | "search">;
}

export function usePublicSourceTreeSelectFetchers() {
	return {
		fetchChildren: publicListChildren,
		fetchAncestors: async (id: number) => ancestorsToNodes(await publicGetBreadcrumb(id)),
		search: publicSearchSources,
	} satisfies Pick<SourceTreeSelectProps, "fetchChildren" | "fetchAncestors" | "search">;
}
