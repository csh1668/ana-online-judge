"use client";

import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { X } from "lucide-react";
import { Slider } from "radix-ui";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	listProblemVotesPaged,
	type ProblemVoteListItem,
	type ProblemVotePanelData,
	removeVoteAction,
	VOTES_PAGE_SIZE,
	voteOnProblemAction,
} from "@/actions/problem-votes";
import { TagSearchDialog } from "@/components/tags/tag-search-dialog";
import { TierBadge } from "@/components/tier/tier-badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { Textarea } from "@/components/ui/textarea";
import type { TagWithPath } from "@/lib/services/algorithm-tags";
import { tierColor, tierLabel } from "@/lib/tier";

interface TierVotePanelProps {
	problemId: number;
	currentTier: number;
	tierUpdatedAt: Date | null;
	data: ProblemVotePanelData;
}

// Slider 값(0~30) ↔ DB level(0=not_ratable, 1~30=정상)
// level=null은 난이도 매기지 못하겠음
function levelToSlider(level: number | null | undefined): number {
	return level == null ? 0 : level;
}

const MAX_TAGS_PER_VOTE = 10;

// 슬라이더 트랙용 티어 색상 그라데이션.
const TIER_TRACK_GRADIENT = (() => {
	const segments = [
		{ start: 0, end: 1, color: tierColor(-1, "problem") }, // N/R
		{ start: 1, end: 6, color: tierColor(1, "problem") }, // Bronze
		{ start: 6, end: 11, color: tierColor(6, "problem") }, // Silver
		{ start: 11, end: 16, color: tierColor(11, "problem") }, // Gold
		{ start: 16, end: 21, color: tierColor(16, "problem") }, // Platinum
		{ start: 21, end: 26, color: tierColor(21, "problem") }, // Diamond
		{ start: 26, end: 31, color: tierColor(26, "problem") }, // Ruby
	];
	const stops = segments.flatMap((s) => [
		`${s.color} ${((s.start - 0.3) / 30.5) * 100}%`,
		`${s.color} ${((s.end + 0.3) / 30.5) * 100}%`,
	]);
	return `linear-gradient(to right, ${stops.join(", ")})`;
})();

export function TierVotePanel({ problemId, currentTier, tierUpdatedAt, data }: TierVotePanelProps) {
	const [sliderValue, setSliderValue] = useState<number>(
		data.myVote ? levelToSlider(data.myVote.level) : currentTier
	);
	const [unsureLevel, setUnsureLevel] = useState<boolean>(
		data.myVote != null && data.myVote.level === null
	);
	const [comment, setComment] = useState<string>(data.myVote?.comment ?? "");
	const [pending, startTransition] = useTransition();

	// 페이지네이션 상태: 1페이지는 서버 props(data.votes)를 그대로 사용해서
	// revalidatePath 직후에도 최신 데이터가 반영되도록 한다.
	// 그 외 페이지는 서버 액션으로 lazy fetch 후 fetchedPage에 캐시.
	const [votesPage, setVotesPage] = useState<number>(1);
	const [fetchedPage, setFetchedPage] = useState<{
		page: number;
		votes: ProblemVoteListItem[];
	} | null>(null);
	const [pagePending, startPageTransition] = useTransition();

	const [tagChips, setTagChips] = useState<TagWithPath[]>([]);
	const [tagDialogOpen, setTagDialogOpen] = useState(false);

	useEffect(() => {
		if (data.myVoteTags.length === 0) {
			setTagChips([]);
			return;
		}
		(async () => {
			const { getTagsByIdsAction } = await import("@/actions/tags");
			const byId = new Map<number, TagWithPath>();
			for (const t of data.confirmedTags) byId.set(t.id, t);
			const missing = data.myVoteTags.filter((id) => !byId.has(id));
			if (missing.length > 0) {
				const fetched = await getTagsByIdsAction(missing);
				for (const t of fetched) byId.set(t.id, t);
			}
			setTagChips(data.myVoteTags.map((id) => byId.get(id)).filter((t): t is TagWithPath => !!t));
		})();
	}, [data.myVoteTags, data.confirmedTags]);

	function handleAddTag(tag: TagWithPath) {
		if (tagChips.some((t) => t.id === tag.id)) return;
		if (tagChips.length >= MAX_TAGS_PER_VOTE) return;
		setTagChips([...tagChips, tag]);
	}

	function handleRemoveTag(tagId: number) {
		setTagChips(tagChips.filter((t) => t.id !== tagId));
	}

	const totalVotes = data.totalVotes;
	const pagedVotes = fetchedPage && fetchedPage.page === votesPage ? fetchedPage.votes : data.votes;
	const totalVotePages = Math.max(1, Math.ceil(totalVotes / VOTES_PAGE_SIZE));

	function handlePageChange(nextPage: number) {
		if (nextPage === votesPage) return;
		if (nextPage === 1) {
			setFetchedPage(null);
			setVotesPage(1);
			return;
		}
		startPageTransition(async () => {
			try {
				const res = await listProblemVotesPaged(problemId, nextPage);
				setFetchedPage({ page: nextPage, votes: res.votes });
				setVotesPage(nextPage);
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "의견 목록을 불러올 수 없습니다");
			}
		});
	}

	const hasVoted = data.myVote != null;
	const canVote = data.canVote.ok;

	// 미리보기 (슬라이더 0 → -1=not_ratable, 1~30 → 그대로; 단 unsureLevel이면 별도 표시)
	const previewTier = sliderValue === 0 ? -1 : sliderValue;
	const previewLabel = unsureLevel ? "" : tierLabel(previewTier, "problem");

	const disabledReason = (() => {
		if (!data.isLoggedIn) return "로그인 후 AC 받으면 투표할 수 있습니다.";
		if (data.canVote.ok) return null;
		switch (data.canVote.reason) {
			case "not_solved":
				return "이 문제를 푼 사용자만 투표할 수 있습니다.";
			case "in_active_contest":
				return "진행 중인 대회의 문제입니다. 대회 종료 후 투표할 수 있습니다.";
			case "problem_not_found":
				return "문제를 찾을 수 없습니다.";
		}
	})();

	function handleSubmit() {
		if (!canVote) return;
		startTransition(async () => {
			try {
				await voteOnProblemAction({
					problemId,
					level: unsureLevel ? null : sliderValue,
					comment: comment.trim() || null,
					tagIds: tagChips.map((t) => t.id),
				});
				toast.success("투표했습니다");
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "투표 실패");
			}
		});
	}

	function handleRemove() {
		startTransition(async () => {
			try {
				await removeVoteAction(problemId);
				setSliderValue(currentTier);
				setUnsureLevel(false);
				setComment("");
				setTagChips([]);
				toast.success("투표를 철회했습니다");
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "철회 실패");
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>난이도 투표</CardTitle>
				<CardAction className="flex items-center gap-2 text-sm text-muted-foreground">
					<TierBadge tier={currentTier} kind="problem" size="md" />
					<span>{totalVotes}명 투표</span>
					{tierUpdatedAt && (
						<span>· {formatDistanceToNow(tierUpdatedAt, { addSuffix: true, locale: ko })}</span>
					)}
				</CardAction>
			</CardHeader>
			<CardContent className="space-y-4">
				{disabledReason ? (
					<div className="rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
						{disabledReason}
					</div>
				) : (
					<div className="space-y-4">
						{/* 현재 슬라이더 위치 미리보기 */}
						<div className="flex items-center justify-center gap-2 text-base font-medium">
							<TierBadge
								tier={unsureLevel ? 0 : previewTier}
								kind="problem"
								size="md"
								showTooltip={false}
							/>
							<span className={unsureLevel ? "text-muted-foreground" : undefined}>
								{previewLabel}
							</span>
						</div>

						{/* 슬라이더 (0=N/R, 1~30=Bronze 5~Ruby 1) — 트랙에 티어 그룹 색상 칠 */}
						<Slider.Root
							className={`relative flex w-full touch-none select-none items-center py-2 ${
								unsureLevel ? "opacity-40 pointer-events-none" : ""
							}`}
							min={0}
							max={30}
							step={1}
							value={[sliderValue]}
							onValueChange={(v) => setSliderValue(v[0])}
							disabled={unsureLevel}
							aria-label="난이도 선택 슬라이더"
						>
							<Slider.Track
								className="relative h-3 w-full grow overflow-hidden rounded-full"
								style={{ background: TIER_TRACK_GRADIENT }}
							/>
							<Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
						</Slider.Root>

						<div className="flex items-center gap-2 text-sm">
							<Checkbox
								id="vote-unsure-level"
								checked={unsureLevel}
								onCheckedChange={(v) => setUnsureLevel(v === true)}
							/>
							<label
								htmlFor="vote-unsure-level"
								className="cursor-pointer select-none text-muted-foreground"
							>
								난이도를 매기지 못하겠음
							</label>
						</div>

						<Textarea
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="의견 (선택)"
							rows={3}
						/>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<span className="text-sm font-medium">알고리즘 태그</span>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setTagDialogOpen(true)}
									disabled={tagChips.length >= MAX_TAGS_PER_VOTE}
								>
									+ 추가
								</Button>
							</div>
							{tagChips.length > 0 ? (
								<div className="flex flex-wrap gap-1">
									{tagChips.map((tag) => (
										<span
											key={tag.id}
											className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs"
											title={tag.path.map((p) => p.name).join(" > ")}
										>
											{tag.name}
											<button
												type="button"
												onClick={() => handleRemoveTag(tag.id)}
												className="text-muted-foreground hover:text-foreground"
												aria-label={`${tag.name} 제거`}
											>
												<X className="h-3 w-3" />
											</button>
										</span>
									))}
								</div>
							) : (
								<p className="text-xs text-muted-foreground">선택된 태그 없음</p>
							)}
						</div>

						<TagSearchDialog
							open={tagDialogOpen}
							onOpenChange={setTagDialogOpen}
							selectedTagIds={tagChips.map((t) => t.id)}
							onSelect={handleAddTag}
							maxReached={tagChips.length >= MAX_TAGS_PER_VOTE}
						/>

						<div className="flex gap-2">
							<Button onClick={handleSubmit} disabled={pending}>
								{hasVoted ? "수정하기" : "투표하기"}
							</Button>
							{hasVoted && (
								<Button variant="outline" onClick={handleRemove} disabled={pending}>
									철회
								</Button>
							)}
						</div>
					</div>
				)}

				{data.canViewVotes && totalVotes > 0 && (
					<div className="space-y-2 pt-4 border-t">
						<h4 className="text-sm font-semibold">사용자 의견 ({totalVotes})</h4>
						<ul className={`space-y-2 transition-opacity ${pagePending ? "opacity-60" : ""}`}>
							{pagedVotes.map((v) => (
								<li
									key={v.username}
									className="flex items-start gap-2 rounded border px-3 py-2 text-sm"
								>
									<TierBadge
										tier={v.level === null ? 0 : v.level === 0 ? -1 : v.level}
										kind="problem"
										size="sm"
									/>
									<div className="flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium">{v.name}</span>
											<span className="text-xs text-muted-foreground">
												{formatDistanceToNow(v.updatedAt, {
													addSuffix: true,
													locale: ko,
												})}
											</span>
										</div>
										{v.comment && (
											<p className="mt-1 whitespace-pre-wrap text-muted-foreground">{v.comment}</p>
										)}
										{v.tags.length > 0 && (
											<div className="mt-1 flex flex-wrap gap-1">
												{v.tags.map((t) => (
													<span
														key={t.id}
														className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground"
													>
														{t.name}
													</span>
												))}
											</div>
										)}
									</div>
								</li>
							))}
						</ul>
						<PaginationLinks
							currentPage={votesPage}
							totalPages={totalVotePages}
							onPageChange={handlePageChange}
							disabled={pagePending}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
