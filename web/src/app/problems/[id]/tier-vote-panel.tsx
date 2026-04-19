"use client";

import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { Slider } from "radix-ui";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
	type ProblemVotePanelData,
	removeVoteAction,
	voteOnProblemAction,
} from "@/actions/problem-votes";
import { TierBadge } from "@/components/tier/tier-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PaginationLinks } from "@/components/ui/pagination-links";
import { Textarea } from "@/components/ui/textarea";
import { tierLabel } from "@/lib/tier";

interface TierVotePanelProps {
	problemId: number;
	currentTier: number;
	tierUpdatedAt: Date | null;
	data: ProblemVotePanelData;
}

// Slider 값(0~30) ↔ DB level(null=not_ratable, 1~30)
function sliderToLevel(v: number): number | null {
	return v === 0 ? null : v;
}
function levelToSlider(level: number | null | undefined): number {
	return level == null ? 0 : level;
}

const DEFAULT_SLIDER_POS = 15; // 미투표 사용자의 기본 슬라이더 위치 (Gold V 근처)
const VOTES_PER_PAGE = 10;

// 슬라이더 그룹 표시용 라벨 (총 7구간: NR + 6 tier groups)
const GROUP_LABELS = ["N/R", "B", "S", "G", "P", "D", "R"] as const;

export function TierVotePanel({ problemId, currentTier, tierUpdatedAt, data }: TierVotePanelProps) {
	const [sliderValue, setSliderValue] = useState<number>(
		data.myVote ? levelToSlider(data.myVote.level) : DEFAULT_SLIDER_POS
	);
	const [comment, setComment] = useState<string>(data.myVote?.comment ?? "");
	const [pending, startTransition] = useTransition();
	const [votesPage, setVotesPage] = useState<number>(1);

	const totalVotePages = Math.max(1, Math.ceil(data.votes.length / VOTES_PER_PAGE));
	const safePage = Math.min(votesPage, totalVotePages);
	const pagedVotes = data.votes.slice((safePage - 1) * VOTES_PER_PAGE, safePage * VOTES_PER_PAGE);

	const hasVoted = data.myVote != null;
	const canVote = data.canVote.ok;

	// 미리보기 tier 정수 (슬라이더 0 → -1=not_ratable, 1~30 → 그대로)
	const previewTier = sliderValue === 0 ? -1 : sliderValue;
	const previewLabel = tierLabel(previewTier, "problem");

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
					level: sliderToLevel(sliderValue),
					comment: comment.trim() || null,
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
				setSliderValue(DEFAULT_SLIDER_POS);
				setComment("");
				toast.success("투표를 철회했습니다");
			} catch (e) {
				toast.error(e instanceof Error ? e.message : "철회 실패");
			}
		});
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between gap-2">
				<CardTitle>난이도 투표</CardTitle>
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<TierBadge tier={currentTier} kind="problem" size="md" />
					<span>{data.votes.length}명 투표</span>
					{tierUpdatedAt && (
						<span>· {formatDistanceToNow(tierUpdatedAt, { addSuffix: true, locale: ko })}</span>
					)}
				</div>
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
							<TierBadge tier={previewTier} kind="problem" size="md" showTooltip={false} />
							<span>{previewLabel}</span>
						</div>

						{/* 슬라이더 (0=N/R, 1~30=Bronze 5~Ruby 1) */}
						<Slider.Root
							className="relative flex w-full touch-none select-none items-center py-2"
							min={0}
							max={30}
							step={1}
							value={[sliderValue]}
							onValueChange={(v) => setSliderValue(v[0])}
							aria-label="난이도 선택 슬라이더"
						>
							<Slider.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-muted">
								<Slider.Range className="absolute h-full bg-primary" />
							</Slider.Track>
							<Slider.Thumb className="block h-5 w-5 rounded-full border-2 border-primary bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
						</Slider.Root>

						{/* 그룹 레이블 (NR / B / S / G / P / D / R) */}
						<div className="grid grid-cols-7 text-[10px] text-muted-foreground">
							{GROUP_LABELS.map((label) => (
								<span key={label} className="text-center">
									{label}
								</span>
							))}
						</div>

						<Textarea
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="의견 (선택)"
							rows={3}
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

				{data.votes.length > 0 && (
					<div className="space-y-2 pt-4 border-t">
						<h4 className="text-sm font-semibold">다른 사용자 의견 ({data.votes.length})</h4>
						<ul className="space-y-2">
							{pagedVotes.map((v) => (
								<li
									key={v.userId}
									className="flex items-start gap-2 rounded border px-3 py-2 text-sm"
								>
									<TierBadge tier={v.level ?? -1} kind="problem" size="sm" />
									<div className="flex-1">
										<div className="flex items-center gap-2">
											<span className="font-medium">{v.username}</span>
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
									</div>
								</li>
							))}
						</ul>
						<PaginationLinks
							currentPage={safePage}
							totalPages={totalVotePages}
							onPageChange={setVotesPage}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
