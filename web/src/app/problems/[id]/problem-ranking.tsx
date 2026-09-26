"use client";

import { ChevronRight, Download } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { getProblemRanking, type ProblemRankingItemWithAccess } from "@/actions/problem-stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface ProblemRankingProps {
	problemId: number;
	initialRankings: ProblemRankingItemWithAccess[];
	initialTotal: number;
	currentUserId?: number | null;
	contestId?: number;
	useFullJudge?: boolean;
	totalTestcases?: number;
	/** 언어 id → 표시 라벨 (삭제·비활성 언어 포함). */
	languageLabels: Record<string, string>;
}

const ACCESS_DENIED_LABELS: Record<string, string> = {
	contest_running: "대회 진행 중인 제출",
	contest_submission: "대회 제출은 비공개",
	anonymous: "로그인 후 열람 가능",
	not_solved: "이 문제를 풀어야 열람 가능",
	private: "비공개 제출",
	not_yet_ac: "아직 만점이 아닌 제출",
	judging: "채점 중",
};

export function ProblemRanking({
	problemId,
	initialRankings,
	initialTotal,
	currentUserId,
	contestId,
	useFullJudge = false,
	totalTestcases = 0,
	languageLabels,
}: ProblemRankingProps) {
	const [rankings, setRankings] = useState(initialRankings);
	const [total, setTotal] = useState(initialTotal);
	const [sortBy, setSortBy] = useState<"executionTime" | "codeLength">("executionTime");
	const [language, setLanguage] = useState("all");
	const [page, setPage] = useState(1);
	const [isPending, startTransition] = useTransition();
	const limit = 20;
	const totalPages = Math.ceil(total / limit);

	const reload = (newSortBy: typeof sortBy, newLang: string, newPage: number) => {
		startTransition(async () => {
			const result = await getProblemRanking(problemId, {
				sortBy: newSortBy,
				language: newLang === "all" ? undefined : newLang,
				page: newPage,
				limit,
				contestId,
			});
			setRankings(result.rankings);
			setTotal(result.total);
		});
	};

	const handleSortChange = (value: string) => {
		const next = value as "executionTime" | "codeLength";
		setSortBy(next);
		setPage(1);
		reload(next, language, 1);
	};

	const handleLanguageChange = (value: string) => {
		setLanguage(value);
		setPage(1);
		reload(sortBy, value, 1);
	};

	const handlePageChange = (newPage: number) => {
		setPage(newPage);
		reload(sortBy, language, newPage);
	};

	// Calculate user's percentile
	const userRankIndex = currentUserId ? rankings.findIndex((r) => r.userId === currentUserId) : -1;
	const userPercentile =
		userRankIndex >= 0 && total > 0
			? (((userRankIndex + 1 + (page - 1) * limit) / total) * 100).toFixed(0)
			: null;

	return (
		<div>
			{/* Filters */}
			<div className="flex flex-wrap items-center gap-3 mb-4">
				{!useFullJudge && (
					<>
						<Tabs value={sortBy} onValueChange={handleSortChange}>
							<TabsList>
								<TabsTrigger value="executionTime">실행 시간</TabsTrigger>
								<TabsTrigger value="codeLength">숏코딩</TabsTrigger>
							</TabsList>
						</Tabs>

						<Select value={language} onValueChange={handleLanguageChange}>
							<SelectTrigger className="w-[120px]">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="all">모든 언어</SelectItem>
								{Object.entries(languageLabels)
									.filter(([value]) => value !== "text")
									.map(([value, label]) => (
										<SelectItem key={value} value={value}>
											{label}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</>
				)}
				{useFullJudge && (
					<span className="text-xs text-muted-foreground">통과한 테스트케이스 수가 많은 순</span>
				)}

				{userPercentile && <Badge variant="secondary">상위 {userPercentile}%</Badge>}
			</div>

			{rankings.length === 0 ? (
				<EmptyState>아직 맞은 사람이 없습니다.</EmptyState>
			) : (
				<Table className="min-w-[800px]">
					<TableHeader>
						<TableRow>
							<TableHead className="w-[80px]">#</TableHead>
							<TableHead className="w-[60px]">순위</TableHead>
							<TableHead>사용자</TableHead>
							<TableHead className="w-[80px]">언어</TableHead>
							<TableHead className="w-[80px] text-right">시간</TableHead>
							<TableHead className="w-[80px] text-right">메모리</TableHead>
							<TableHead className="w-[80px] text-right">코드 길이</TableHead>
							<TableHead className="w-[100px]" />
						</TableRow>
					</TableHeader>
					<TableBody>
						{rankings.map((item, idx) => {
							const rank = (page - 1) * limit + idx + 1;
							const isMe = currentUserId !== null && item.userId === currentUserId;
							const canAccessDetail = item.codeAccess.allowed;
							const deniedReason = !item.codeAccess.allowed ? item.codeAccess.reason : null;
							return (
								<TableRow key={item.id} className={isMe ? "bg-primary/5" : ""}>
									<TableCell>
										{canAccessDetail ? (
											<Link
												href={`/submissions/${item.id}`}
												className="font-mono text-primary hover:underline"
											>
												{item.id}
											</Link>
										) : (
											<span
												className="font-mono text-muted-foreground/60"
												title={deniedReason ? ACCESS_DENIED_LABELS[deniedReason] : undefined}
											>
												{item.id}
											</span>
										)}
									</TableCell>
									<TableCell className="font-mono">
										{rank === 1
											? "\u{1F947}"
											: rank === 2
												? "\u{1F948}"
												: rank === 3
													? "\u{1F949}"
													: rank}
									</TableCell>
									<TableCell className="font-medium">
										<div className="flex items-center gap-2 min-w-0">
											<span className="truncate" title={item.userName}>
												{item.userName}
											</span>
											{useFullJudge && item.bestPassed != null && (
												<span className="text-xs text-muted-foreground shrink-0">
													({item.bestPassed}/{totalTestcases})
												</span>
											)}
											{isMe && (
												<Badge variant="outline" className="text-xs shrink-0">
													나
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{languageLabels[item.language] ?? item.language}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{item.executionTime !== null ? `${item.executionTime}ms` : "-"}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{item.memoryUsed !== null ? `${item.memoryUsed}KB` : "-"}
									</TableCell>
									<TableCell className="text-right tabular-nums text-muted-foreground">
										{item.codeLength !== null ? `${item.codeLength}B` : "-"}
									</TableCell>
									<TableCell className="text-right">
										<div className="flex items-center justify-end gap-2">
											{canAccessDetail && (
												<>
													<Button
														variant="ghost"
														size="icon"
														className="h-8 w-8"
														onClick={() => {
															window.location.href = `/api/submissions/${item.id}/download`;
														}}
														title="파일 다운로드"
													>
														<Download className="h-4 w-4" />
													</Button>
													<Link
														href={`/submissions/${item.id}`}
														className="inline-flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
													>
														<ChevronRight className="h-4 w-4" />
													</Link>
												</>
											)}
										</div>
									</TableCell>
								</TableRow>
							);
						})}
					</TableBody>
				</Table>
			)}

			{totalPages > 1 && (
				<div className="flex items-center justify-center gap-2 mt-4">
					<Button
						variant="outline"
						size="sm"
						disabled={page <= 1 || isPending}
						onClick={() => handlePageChange(page - 1)}
					>
						이전
					</Button>
					<span className="text-sm text-muted-foreground">
						{page} / {totalPages}
					</span>
					<Button
						variant="outline"
						size="sm"
						disabled={page >= totalPages || isPending}
						onClick={() => handlePageChange(page + 1)}
					>
						다음
					</Button>
				</div>
			)}
		</div>
	);
}
