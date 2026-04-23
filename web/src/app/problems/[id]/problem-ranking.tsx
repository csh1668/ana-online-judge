"use client";

import { useState, useTransition } from "react";
import { getProblemRanking } from "@/actions/problem-stats";
import { LANGUAGE_LABELS } from "@/components/submissions/submission-row";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { ProblemRankingItem } from "@/lib/services/problem-stats";

interface ProblemRankingProps {
	problemId: number;
	initialRankings: ProblemRankingItem[];
	initialTotal: number;
	currentUserId?: number | null;
	contestId?: number;
}

export function ProblemRanking({
	problemId,
	initialRankings,
	initialTotal,
	currentUserId,
	contestId,
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

	const handleSortChange = (value: "executionTime" | "codeLength") => {
		setSortBy(value);
		setPage(1);
		reload(value, language, 1);
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
			<div className="flex items-center gap-3 mb-4">
				<Select value={sortBy} onValueChange={handleSortChange}>
					<SelectTrigger className="w-[140px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="executionTime">실행 시간순</SelectItem>
						<SelectItem value="codeLength">코드 길이순</SelectItem>
					</SelectContent>
				</Select>

				<Select value={language} onValueChange={handleLanguageChange}>
					<SelectTrigger className="w-[120px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">모든 언어</SelectItem>
						<SelectItem value="c">C</SelectItem>
						<SelectItem value="cpp">C++</SelectItem>
						<SelectItem value="python">Python</SelectItem>
						<SelectItem value="java">Java</SelectItem>
						<SelectItem value="javascript">JavaScript</SelectItem>
						<SelectItem value="csharp">C#</SelectItem>
					</SelectContent>
				</Select>

				{userPercentile && <Badge variant="secondary">상위 {userPercentile}%</Badge>}
			</div>

			{rankings.length === 0 ? (
				<div className="py-8 text-center text-muted-foreground text-sm">
					아직 맞은 사람이 없습니다.
				</div>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead className="w-[60px]">순위</TableHead>
							<TableHead className="w-[120px]">사용자</TableHead>
							<TableHead className="w-[80px]">언어</TableHead>
							<TableHead className="w-[80px] text-right">시간</TableHead>
							<TableHead className="w-[80px] text-right">메모리</TableHead>
							<TableHead className="w-[80px] text-right">코드 길이</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rankings.map((item, idx) => {
							const rank = (page - 1) * limit + idx + 1;
							const isMe = currentUserId !== null && item.userId === currentUserId;
							return (
								<TableRow key={item.id} className={isMe ? "bg-primary/5" : ""}>
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
											{isMe && (
												<Badge variant="outline" className="text-xs shrink-0">
													나
												</Badge>
											)}
										</div>
									</TableCell>
									<TableCell className="text-muted-foreground">
										{LANGUAGE_LABELS[item.language] || item.language}
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{item.executionTime !== null ? `${item.executionTime}ms` : "-"}
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{item.memoryUsed !== null ? `${item.memoryUsed}KB` : "-"}
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{item.codeLength !== null ? `${item.codeLength}B` : "-"}
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
