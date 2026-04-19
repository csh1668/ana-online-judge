"use client";

import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface TierVotePanelProps {
	problemId: number;
	currentTier: number;
	tierUpdatedAt: Date | null;
	data: ProblemVotePanelData;
}

const LEVEL_GRID = Array.from({ length: 30 }, (_, i) => i + 1); // 1..30

export function TierVotePanel({ problemId, currentTier, tierUpdatedAt, data }: TierVotePanelProps) {
	const [selectedLevel, setSelectedLevel] = useState<number | null>(data.myVote?.level ?? null);
	const [isNotRatable, setIsNotRatable] = useState<boolean>(
		data.myVote != null && data.myVote.level === null
	);
	const [comment, setComment] = useState<string>(data.myVote?.comment ?? "");
	const [pending, startTransition] = useTransition();

	const hasVoted = data.myVote != null;
	const canVote = data.canVote.ok;

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
					level: isNotRatable ? null : selectedLevel,
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
				setSelectedLevel(null);
				setIsNotRatable(false);
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
					<div className="space-y-3">
						<div className="grid grid-cols-6 gap-1.5">
							{LEVEL_GRID.map((lv) => (
								<button
									key={lv}
									type="button"
									onClick={() => {
										setSelectedLevel(lv);
										setIsNotRatable(false);
									}}
									className={cn(
										"flex items-center justify-center rounded border p-2 transition",
										selectedLevel === lv && !isNotRatable
											? "border-primary ring-2 ring-primary"
											: "border-border hover:border-primary/50"
									)}
									aria-pressed={selectedLevel === lv && !isNotRatable}
								>
									<TierBadge tier={lv} kind="problem" size="sm" showTooltip={false} />
								</button>
							))}
						</div>
						<button
							type="button"
							onClick={() => {
								setIsNotRatable(true);
								setSelectedLevel(null);
							}}
							className={cn(
								"w-full rounded border p-2 text-sm transition",
								isNotRatable
									? "border-primary ring-2 ring-primary"
									: "border-border hover:border-primary/50"
							)}
							aria-pressed={isNotRatable}
						>
							Not Ratable (난이도 매길 수 없음)
						</button>
						<Textarea
							value={comment}
							onChange={(e) => setComment(e.target.value)}
							placeholder="의견 (선택)"
							rows={3}
						/>
						<div className="flex gap-2">
							<Button
								onClick={handleSubmit}
								disabled={pending || (selectedLevel === null && !isNotRatable)}
							>
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
						<h4 className="text-sm font-semibold">다른 사용자 의견</h4>
						<ul className="space-y-2">
							{data.votes.slice(0, 10).map((v) => (
								<li
									key={v.userId}
									className="flex items-start gap-2 rounded border px-3 py-2 text-sm"
								>
									{v.level !== null ? (
										<TierBadge tier={v.level} kind="problem" size="sm" />
									) : (
										<TierBadge tier={-1} kind="problem" size="sm" />
									)}
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
					</div>
				)}
			</CardContent>
		</Card>
	);
}
