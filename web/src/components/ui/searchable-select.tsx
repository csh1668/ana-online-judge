"use client";

import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
	value: string;
	label: string;
	disabled?: boolean;
}

interface SearchableSelectProps {
	value: string;
	onValueChange: (value: string) => void;
	options: SearchableSelectOption[];
	/** 선택된 값이 없을 때 트리거에 표시할 문구. */
	placeholder?: string;
	searchPlaceholder?: string;
	emptyText?: string;
	/** 스크롤 없이 한 번에 보이는 최대 항목 수. 초과분은 스크롤로 표시. */
	maxVisible?: number;
	disabled?: boolean;
	id?: string;
	/** 트리거 버튼 className. */
	className?: string;
	align?: "start" | "center" | "end";
}

/** 항목 높이(px). 리스트 max-height 계산에 사용. */
const ITEM_HEIGHT = 32;
/** 리스트 상하 패딩 합(px). */
const LIST_PADDING = 8;

function nextEnabledIndex(options: SearchableSelectOption[], from: number, step: 1 | -1): number {
	if (options.length === 0) return -1;
	let i = from;
	for (let n = 0; n < options.length; n++) {
		i = (i + step + options.length) % options.length;
		if (!options[i].disabled) return i;
	}
	return from;
}

/**
 * 검색창이 달린 셀렉트. 항목이 많은 목록(언어 등)에 사용한다.
 *
 * 검색창은 트리거와 맞닿은 쪽(아래로 열리면 위, 위로 열리면 아래)에 놓여
 * 마우스 이동 거리를 최소화한다.
 */
export function SearchableSelect({
	value,
	onValueChange,
	options,
	placeholder = "선택",
	searchPlaceholder = "검색...",
	emptyText = "결과가 없습니다.",
	maxVisible = 8,
	disabled,
	id,
	className,
	align = "start",
}: SearchableSelectProps) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const [highlighted, setHighlighted] = useState(-1);
	const listRef = useRef<HTMLDivElement>(null);
	const listboxId = `${id ?? "searchable-select"}-listbox`;

	const selected = options.find((o) => o.value === value);

	const filtered = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (!q) return options;
		return options.filter(
			(o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
		);
	}, [options, query]);

	// 열릴 때: 검색어 초기화, 현재 선택 항목을 하이라이트.
	useEffect(() => {
		if (!open) return;
		setQuery("");
		const idx = options.findIndex((o) => o.value === value);
		setHighlighted(idx >= 0 && !options[idx].disabled ? idx : nextEnabledIndex(options, -1, 1));
	}, [open, options, value]);

	// 검색어가 바뀌면 첫 번째 활성 항목을 하이라이트.
	const handleQueryChange = (next: string) => {
		setQuery(next);
		const q = next.trim().toLowerCase();
		const list = q
			? options.filter(
					(o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
				)
			: options;
		setHighlighted(nextEnabledIndex(list, -1, 1));
	};

	// 하이라이트 항목이 보이도록 스크롤.
	useEffect(() => {
		if (!open || highlighted < 0) return;
		const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${highlighted}"]`);
		el?.scrollIntoView({ block: "nearest" });
	}, [open, highlighted]);

	const commit = useCallback(
		(option: SearchableSelectOption | undefined) => {
			if (!option || option.disabled) return;
			onValueChange(option.value);
			setOpen(false);
		},
		[onValueChange]
	);

	const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setHighlighted((h) => nextEnabledIndex(filtered, h, 1));
				break;
			case "ArrowUp":
				e.preventDefault();
				setHighlighted((h) => nextEnabledIndex(filtered, h < 0 ? 0 : h, -1));
				break;
			case "Home":
				e.preventDefault();
				setHighlighted(nextEnabledIndex(filtered, -1, 1));
				break;
			case "End":
				e.preventDefault();
				setHighlighted(nextEnabledIndex(filtered, 0, -1));
				break;
			case "Enter":
				e.preventDefault();
				commit(filtered[highlighted]);
				break;
			case "Tab":
				setOpen(false);
				break;
		}
	};

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					id={id}
					role="combobox"
					aria-expanded={open}
					aria-controls={listboxId}
					disabled={disabled}
					data-slot="searchable-select-trigger"
					data-placeholder={selected ? undefined : ""}
					className={cn(
						"border-[1.5px] border-input data-[placeholder]:text-muted-foreground/60 [&_svg:not([class*='text-'])]:text-muted-foreground bg-background flex h-9 w-fit items-center justify-between gap-2 rounded-[2px] px-3 py-2 text-sm whitespace-nowrap transition-[box-shadow,border-color] outline-none focus-visible:border-accent focus-visible:shadow-[3px_3px_0_var(--muted)] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0",
						className
					)}
				>
					<span className="line-clamp-1 text-left">{selected?.label ?? placeholder}</span>
					<ChevronDownIcon className="size-4 opacity-50" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align={align}
				className="group flex w-max min-w-(--radix-popover-trigger-width) max-w-[20rem] flex-col p-0"
			>
				{/* 검색창: DOM에서는 항상 첫 번째(자동 포커스), 위로 열릴 때만 시각적으로 맨 아래로. */}
				<div className="flex items-center gap-2 border-b border-border px-2 group-data-[side=top]:order-last group-data-[side=top]:border-t group-data-[side=top]:border-b-0">
					<SearchIcon className="size-4 shrink-0 text-muted-foreground" />
					<input
						type="text"
						role="searchbox"
						aria-controls={listboxId}
						aria-activedescendant={highlighted >= 0 ? `${listboxId}-${highlighted}` : undefined}
						autoComplete="off"
						placeholder={searchPlaceholder}
						value={query}
						onChange={(e) => handleQueryChange(e.target.value)}
						onKeyDown={handleKeyDown}
						className="h-9 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
					/>
				</div>
				<div
					ref={listRef}
					id={listboxId}
					role="listbox"
					className="overflow-y-auto p-1"
					style={{ maxHeight: maxVisible * ITEM_HEIGHT + LIST_PADDING }}
				>
					{filtered.length === 0 ? (
						<div className="px-2 py-3 text-center text-muted-foreground text-sm">{emptyText}</div>
					) : (
						filtered.map((option, index) => {
							const isSelected = option.value === value;
							return (
								// biome-ignore lint/a11y/useKeyWithClickEvents: 키보드 조작은 검색 input(aria-activedescendant)이 담당
								<div
									key={option.value}
									id={`${listboxId}-${index}`}
									role="option"
									tabIndex={-1}
									aria-selected={isSelected}
									aria-disabled={option.disabled || undefined}
									data-index={index}
									data-highlighted={index === highlighted ? "" : undefined}
									onMouseMove={() => {
										if (index !== highlighted) setHighlighted(index);
									}}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => commit(option)}
									className="relative flex h-8 w-full cursor-default select-none items-center gap-2 rounded-[2px] py-1.5 pr-8 pl-2 text-sm outline-hidden data-[highlighted]:bg-secondary data-[highlighted]:text-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50"
								>
									<span className="line-clamp-1">{option.label}</span>
									{isSelected && (
										<span className="absolute right-2 flex size-3.5 items-center justify-center">
											<CheckIcon className="size-4 text-muted-foreground" />
										</span>
									)}
								</div>
							);
						})
					)}
				</div>
			</PopoverContent>
		</Popover>
	);
}
