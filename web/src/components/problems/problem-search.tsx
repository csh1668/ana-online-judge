"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { searchTagsAction } from "@/actions/tags/queries";
import { searchUsersPublic } from "@/actions/users";
import { Input } from "@/components/ui/input";
import { GROUP_NAMES, ROMAN, SHORT_LETTERS, tierLabel } from "@/lib/tier";
import { cn } from "@/lib/utils";

type ActiveToken =
	| { kind: "none" }
	| {
			kind: "tag" | "solver" | "id" | "tier" | "text";
			query: string;
			start: number;
			end: number;
	  };

function analyzeToken(value: string, cursor: number): ActiveToken {
	if (cursor < 0 || cursor > value.length) return { kind: "none" };
	let start = cursor;
	while (start > 0 && !/\s/.test(value[start - 1])) start--;
	let end = cursor;
	while (end < value.length && !/\s/.test(value[end])) end++;
	const token = value.slice(start, end);
	if (!token) return { kind: "none" };
	if (token.startsWith("s#")) return { kind: "solver", query: token.slice(2), start, end };
	if (token.startsWith("#")) return { kind: "tag", query: token.slice(1), start, end };
	if (token.startsWith("id:")) return { kind: "id", query: token.slice(3), start, end };
	if (token.startsWith("*")) return { kind: "tier", query: token.slice(1), start, end };
	return { kind: "text", query: token, start, end };
}

type TagSuggestionData = {
	id: number;
	name: string;
	slug: string;
	description: string | null;
};
type UserSuggestionData = { id: number; username: string; name: string };
type TierSuggestionData = { token: string; label: string };
type Suggestion =
	| { kind: "tag"; data: TagSuggestionData }
	| { kind: "solver"; data: UserSuggestionData }
	| { kind: "tier"; data: TierSuggestionData };

// `*<letter>[num]` autocomplete 후보. tier 정의는 lib/tier.ts(SHORT_LETTERS/GROUP_NAMES/ROMAN)를 그대로 재사용.
// 특수: u(Unrated, tier=0), n(Not Ratable, tier=-1) — tierLabel로 라벨 산출.
const TIER_SPECIAL_LETTERS: { letter: string; tier: number }[] = [
	{ letter: "u", tier: 0 },
	{ letter: "n", tier: -1 },
];

function groupSuggestion(groupIdx: number): TierSuggestionData {
	return {
		token: `*${SHORT_LETTERS[groupIdx].toLowerCase()}`,
		label: `${GROUP_NAMES[groupIdx]} (전체)`,
	};
}

function subSuggestion(groupIdx: number, subNum: number): TierSuggestionData {
	// subNum 5 → ROMAN[0]="V", 1 → ROMAN[4]="I"
	return {
		token: `*${SHORT_LETTERS[groupIdx].toLowerCase()}${subNum}`,
		label: `${GROUP_NAMES[groupIdx]} ${ROMAN[5 - subNum]}`,
	};
}

function getTierSuggestions(query: string): TierSuggestionData[] {
	const norm = query.toLowerCase();
	if (!norm) {
		return [
			...SHORT_LETTERS.map((_, idx) => groupSuggestion(idx)),
			...TIER_SPECIAL_LETTERS.map((s) => ({
				token: `*${s.letter}`,
				label: tierLabel(s.tier, "problem"),
			})),
		];
	}
	const letter = norm[0];
	const special = TIER_SPECIAL_LETTERS.find((s) => s.letter === letter);
	if (special && norm === special.letter) {
		return [{ token: `*${special.letter}`, label: tierLabel(special.tier, "problem") }];
	}
	const groupIdx = SHORT_LETTERS.indexOf(letter.toUpperCase() as (typeof SHORT_LETTERS)[number]);
	if (groupIdx === -1) return [];
	const rest = norm.slice(1);
	if (!rest) {
		const list: TierSuggestionData[] = [groupSuggestion(groupIdx)];
		for (let n = 5; n >= 1; n--) list.push(subSuggestion(groupIdx, n));
		return list;
	}
	const num = Number.parseInt(rest, 10);
	if (!Number.isFinite(num) || num < 1 || num > 5 || String(num) !== rest) return [];
	return [subSuggestion(groupIdx, num)];
}

const MAX_SUGGESTIONS = 10;

export function ProblemSearch() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const urlSearch = searchParams.get("search") ?? "";
	const [search, setSearch] = useState(urlSearch);
	const [cursor, setCursor] = useState(0);
	const [focused, setFocused] = useState(false);
	const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
	const [loading, setLoading] = useState(false);
	const [highlight, setHighlight] = useState(0);
	const inputRef = useRef<HTMLInputElement>(null);
	// 우리가 마지막으로 router.replace로 써넣은 URL search 값. 외부 변경 감지용.
	// 이 ref가 있어야 router.replace 후 URL이 비동기적으로 반영되는 동안
	// 사용자가 추가로 친 글자를 sync effect가 덮어쓰지 않는다.
	const lastWrittenUrlRef = useRef(urlSearch);
	const [, startTransition] = useTransition();

	// URL이 외부에서 바뀌었을 때만 (정렬/필터 클릭, 뒤로가기 등) 입력값을 URL과 동기화한다.
	// 우리 자신의 router.replace로 인한 URL 변경은 ref로 식별해서 무시 — 그래야
	// 디바운스 중간에 친 글자가 사라지는 race가 생기지 않는다.
	useEffect(() => {
		if (urlSearch === lastWrittenUrlRef.current) return;
		lastWrittenUrlRef.current = urlSearch;
		setSearch(urlSearch);
	}, [urlSearch]);

	// 입력값이 URL과 다를 때만 디바운스 후 URL을 갱신한다.
	// router.replace는 transition으로 감싸 RSC re-fetch가 입력 응답성을 막지 않게 한다.
	useEffect(() => {
		if (search === urlSearch) return;
		const timer = setTimeout(() => {
			const params = new URLSearchParams(searchParams);
			if (search) {
				params.set("search", search);
			} else {
				params.delete("search");
			}
			params.set("page", "1");
			lastWrittenUrlRef.current = search;
			startTransition(() => {
				router.replace(`?${params.toString()}`);
			});
		}, 300);
		return () => clearTimeout(timer);
	}, [search, urlSearch, searchParams, router]);

	const active = useMemo(() => analyzeToken(search, cursor), [search, cursor]);
	const activeKind = active.kind;
	const activeQuery = active.kind === "none" ? "" : active.query;

	// 자동완성 후보 fetch — 특수 토큰을 입력 중일 때만.
	useEffect(() => {
		if (!focused) {
			setSuggestions([]);
			setLoading(false);
			return;
		}
		// Tier는 정적 후보. Query가 비어있어도 그룹 목록을 보여준다.
		if (activeKind === "tier") {
			setLoading(false);
			setSuggestions(
				getTierSuggestions(activeQuery)
					.slice(0, MAX_SUGGESTIONS)
					.map((t) => ({ kind: "tier", data: t }))
			);
			return;
		}
		if (activeKind !== "tag" && activeKind !== "solver") {
			setSuggestions([]);
			setLoading(false);
			return;
		}
		const q = activeQuery.trim();
		if (!q) {
			setSuggestions([]);
			setLoading(false);
			return;
		}
		let cancelled = false;
		setLoading(true);
		const handle = setTimeout(async () => {
			try {
				if (activeKind === "tag") {
					const tags = await searchTagsAction(q);
					if (!cancelled) {
						setSuggestions(
							tags.slice(0, MAX_SUGGESTIONS).map((t) => ({
								kind: "tag",
								data: {
									id: t.id,
									name: t.name,
									slug: t.slug,
									description: t.description,
								},
							}))
						);
					}
				} else {
					const list = await searchUsersPublic(q);
					if (!cancelled) {
						setSuggestions(
							list.slice(0, MAX_SUGGESTIONS).map((u) => ({ kind: "solver", data: u }))
						);
					}
				}
			} catch {
				if (!cancelled) setSuggestions([]);
			} finally {
				if (!cancelled) setLoading(false);
			}
		}, 200);
		return () => {
			cancelled = true;
			clearTimeout(handle);
		};
	}, [focused, activeKind, activeQuery]);

	// 후보 목록 갱신 시 highlight 인덱스 리셋.
	// biome-ignore lint/correctness/useExhaustiveDependencies: suggestions 변경을 트리거로 사용
	useEffect(() => {
		setHighlight(0);
	}, [suggestions]);

	const updateCursor = useCallback(() => {
		if (inputRef.current) {
			setCursor(inputRef.current.selectionStart ?? 0);
		}
	}, []);

	const insertSuggestion = useCallback(
		(sug: Suggestion) => {
			if (active.kind !== "tag" && active.kind !== "solver" && active.kind !== "tier") return;
			let replacement: string;
			if (sug.kind === "tag") replacement = `#${sug.data.slug}`;
			else if (sug.kind === "solver") replacement = `s#${sug.data.username}`;
			else replacement = sug.data.token;
			const before = search.slice(0, active.start);
			const after = search.slice(active.end);
			const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
			const insertText = needsTrailingSpace ? `${replacement} ` : replacement;
			const next = `${before}${insertText}${after}`;
			setSearch(next);
			const newPos = active.start + insertText.length;
			requestAnimationFrame(() => {
				const el = inputRef.current;
				if (el) {
					el.focus();
					el.setSelectionRange(newPos, newPos);
					setCursor(newPos);
				}
			});
			setSuggestions([]);
		},
		[active, search]
	);

	const showAutocomplete =
		focused &&
		((activeKind === "tag" || activeKind === "solver") && activeQuery.trim().length > 0
			? true
			: activeKind === "tier");
	const showSyntaxHelp = focused && !showAutocomplete;

	return (
		<div className="relative w-full max-w-sm">
			<div className="relative">
				<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
				<Input
					ref={inputRef}
					type="search"
					placeholder="문제 검색"
					className="pl-8"
					value={search}
					onChange={(e) => {
						const value = e.target.value;
						const pos = e.target.selectionStart ?? value.length;
						// setSearch + setCursor를 한 commit에 batch — rAF로 분리되던
						// 추가 render 제거. selectionStart는 onChange 시점에 이미
						// 새 값에 맞게 갱신돼 있다.
						setSearch(value);
						setCursor(pos);
					}}
					onFocus={() => setFocused(true)}
					onBlur={() => {
						// 후보 클릭이 처리될 시간을 준다.
						setTimeout(() => setFocused(false), 150);
					}}
					onKeyDown={(e) => {
						if (showAutocomplete && suggestions.length > 0) {
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setHighlight((h) => (h + 1) % suggestions.length);
								return;
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
								return;
							}
							if (e.key === "Enter" || e.key === "Tab") {
								e.preventDefault();
								insertSuggestion(suggestions[highlight]);
								return;
							}
							if (e.key === "Escape") {
								e.preventDefault();
								setSuggestions([]);
								return;
							}
						}
					}}
					onClick={updateCursor}
					onKeyUp={updateCursor}
				/>
			</div>

			{showAutocomplete && (
				<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md">
					{loading ? (
						<div className="flex items-center px-3 py-2 text-muted-foreground text-sm">
							<Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> 불러오는 중...
						</div>
					) : suggestions.length === 0 ? (
						<div className="px-3 py-2 text-muted-foreground text-sm">결과가 없습니다.</div>
					) : (
						<div className="py-1">
							{suggestions.map((s, idx) => {
								const isHl = idx === highlight;
								const key =
									s.kind === "tag"
										? `t-${s.data.id}`
										: s.kind === "solver"
											? `u-${s.data.id}`
											: `r-${s.data.token}`;
								return (
									<button
										key={key}
										type="button"
										onMouseDown={(e) => {
											// blur로 인한 dropdown 닫힘을 막는다.
											e.preventDefault();
											insertSuggestion(s);
										}}
										onMouseEnter={() => setHighlight(idx)}
										className={cn(
											"block w-full cursor-pointer px-3 py-1.5 text-left text-sm",
											isHl ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
										)}
									>
										{s.kind === "tag" ? (
											<TagSuggestionItem tag={s.data} />
										) : s.kind === "solver" ? (
											<UserSuggestionItem user={s.data} />
										) : (
											<TierSuggestionItem tier={s.data} />
										)}
									</button>
								);
							})}
						</div>
					)}
				</div>
			)}

			{showSyntaxHelp && <SyntaxHelpPanel />}
		</div>
	);
}

function TagSuggestionItem({ tag }: { tag: TagSuggestionData }) {
	return (
		<div>
			<div className="flex items-baseline gap-2">
				<span className="font-medium">#{tag.slug}</span>
				<span className="text-muted-foreground text-xs">{tag.name}</span>
			</div>
			{tag.description && (
				<div className="mt-0.5 line-clamp-1 text-muted-foreground text-xs">{tag.description}</div>
			)}
		</div>
	);
}

function UserSuggestionItem({ user }: { user: UserSuggestionData }) {
	return (
		<div className="flex items-baseline gap-2">
			<span className="font-medium">s#{user.username}</span>
			<span className="text-muted-foreground text-xs">{user.name}</span>
		</div>
	);
}

function TierSuggestionItem({ tier }: { tier: TierSuggestionData }) {
	return (
		<div className="flex items-baseline gap-2">
			<span className="font-medium">{tier.token}</span>
			<span className="text-muted-foreground text-xs">{tier.label}</span>
		</div>
	);
}

function SyntaxHelpPanel() {
	return (
		<div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border bg-popover p-3 text-popover-foreground shadow-md">
			<p className="font-medium text-sm">검색 옵션</p>
			<ul className="space-y-1.5 text-sm">
				<li>
					<code className="rounded bg-muted px-1 py-0.5 text-xs">id:</code>
					<span className="ml-2 text-muted-foreground text-xs">문제 ID로 검색</span>
				</li>
				<li>
					<code className="rounded bg-muted px-1 py-0.5 text-xs">#</code>
					<span className="ml-2 text-muted-foreground text-xs">
						알고리즘 태그 (이름/슬러그/설명)
					</span>
				</li>
				<li>
					<code className="rounded bg-muted px-1 py-0.5 text-xs">s#</code>
					<span className="ml-2 text-muted-foreground text-xs">사용자가 푼 문제</span>
				</li>
				<li>
					<code className="rounded bg-muted px-1 py-0.5 text-xs">*</code>
					<span className="ml-2 text-muted-foreground text-xs">
						난이도 (예: <code>*g</code>=골드 전체, <code>*s5</code>=실버 5)
					</span>
				</li>
			</ul>
		</div>
	);
}
