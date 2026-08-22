"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ProblemRankingItemWithAccess } from "@/actions/problem-stats";
import type { ProblemVotePanelData } from "@/actions/problem-votes";
import type { SubmissionListItem } from "@/actions/submissions";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SourcePath } from "@/components/sources/source-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserNameDisplay } from "@/components/user-name-display";
import type { ExternalSite, ProblemType } from "@/db/schema";
import { useProblemLayout } from "@/hooks/use-problem-layout";
import { JUDGE_PRIORITY_LABELS, type JudgePriority } from "@/lib/judge-priority";
import type { TagWithPath } from "@/lib/services/algorithm-tags";
import type { ProblemStats } from "@/lib/services/problem-stats";
import { AllSubmissions } from "./all-submissions";
import { LayoutToggle } from "./layout-toggle";
import { MySubmissions } from "./my-submissions";
import { ProblemRanking } from "./problem-ranking";
import { ProblemStatsBar } from "./problem-stats-bar";
import { RejudgeHistoryPanel } from "./rejudge-history-panel";
import { ProblemSubmitSection } from "./submit-section";
import { TagsRevealRow } from "./tags-reveal-row";
import { TierVotePanel } from "./tier-vote-panel";

interface ProblemDetailClientProps {
	problem: {
		id: number;
		title: string;
		content: string;
		timeLimit: number;
		memoryLimit: number;
		problemType: ProblemType;
		judgeAvailable: boolean;
		allowedLanguages: string[] | null;
		isPublic: boolean;
		tier: number;
		tierUpdatedAt: Date | null;
		useFullJudge?: boolean;
		passThreshold?: number | null;
		totalTestcases?: number;
		judgePriority: number;
	};
	authors: {
		name: string;
		username: string | null;
		mainExternalSite: ExternalSite | null;
		mainExternalRating: number | null;
	}[];
	reviewers: {
		name: string;
		username: string | null;
		mainExternalSite: ExternalSite | null;
		mainExternalRating: number | null;
	}[];
	sources: { problemNumber: string | null; segments: { id: number; name: string }[] }[];
	stats: ProblemStats;
	mySubmissions: SubmissionListItem[];
	allSubmissions: { submissions: SubmissionListItem[]; total: number };
	rankings: { rankings: ProblemRankingItemWithAccess[]; total: number };
	currentUserId: number | null;
	isAdmin: boolean;
	contestId?: number;
	votePanelData: ProblemVotePanelData;
	confirmedTags: TagWithPath[];
	breadcrumbItems: { label: string; href?: string }[];
	children: React.ReactNode;
}

export function ProblemDetailClient({
	problem,
	authors,
	reviewers,
	sources,
	stats,
	mySubmissions,
	allSubmissions,
	rankings,
	currentUserId,
	isAdmin,
	contestId,
	votePanelData,
	confirmedTags,
	breadcrumbItems,
	children: problemHeaderSlot,
}: ProblemDetailClientProps) {
	const router = useRouter();
	const { mode, setMode, isNarrow } = useProblemLayout();
	const [activeTab, setActiveTab] = useState("submit");
	const [highlightSubmissionId, setHighlightSubmissionId] = useState<number | null>(null);

	const handleSubmitSuccess = useCallback(
		(submissionId: number) => {
			if (mode === "split") {
				setActiveTab("my");
			}
			setHighlightSubmissionId(submissionId);
			setTimeout(() => setHighlightSubmissionId(null), 3000);
			window.dispatchEvent(new CustomEvent("scroll-to-my-submissions"));
			router.refresh();
		},
		[mode, router]
	);

	const submitSection = (
		<ProblemSubmitSection
			problemId={problem.id}
			problemType={problem.problemType}
			judgeAvailable={problem.judgeAvailable}
			allowedLanguages={problem.allowedLanguages}
			contestId={contestId}
			onSubmitSuccess={handleSubmitSuccess}
		/>
	);

	const mySubmissionsSection = (
		<MySubmissions
			problemId={problem.id}
			submissions={mySubmissions}
			highlightSubmissionId={highlightSubmissionId}
			currentUserId={currentUserId}
			isAdmin={isAdmin}
		/>
	);

	const allSubmissionsSection = (
		<AllSubmissions
			problemId={problem.id}
			initialSubmissions={allSubmissions.submissions}
			initialTotal={allSubmissions.total}
			currentUserId={currentUserId}
			isAdmin={isAdmin}
			contestId={contestId}
		/>
	);

	const rankingSection = (
		<ProblemRanking
			problemId={problem.id}
			initialRankings={rankings.rankings}
			initialTotal={rankings.total}
			currentUserId={currentUserId}
			contestId={contestId}
			useFullJudge={problem.useFullJudge ?? false}
			totalTestcases={problem.totalTestcases ?? 0}
		/>
	);

	const voteSection = (
		<TierVotePanel
			problemId={problem.id}
			currentTier={problem.tier}
			tierUpdatedAt={problem.tierUpdatedAt}
			data={votePanelData}
		/>
	);

	const rejudgeSection = <RejudgeHistoryPanel problemId={problem.id} />;

	const showFullJudgeNotice = Boolean(
		problem.useFullJudge && problem.passThreshold && problem.totalTestcases
	);
	const showJudgePriority = problem.judgePriority !== 0;
	const hasCredits =
		sources.length > 0 ||
		authors.length > 0 ||
		reviewers.length > 0 ||
		confirmedTags.length > 0 ||
		showFullJudgeNotice ||
		showJudgePriority;

	const staffLinks = (
		people: {
			name: string;
			username: string | null;
			mainExternalSite: ExternalSite | null;
			mainExternalRating: number | null;
		}[]
	) =>
		people.map((p, i) => {
			// 외부 인사: username 없음 → 링크 없이 plain text
			if (p.username == null) {
				return (
					// biome-ignore lint/suspicious/noArrayIndexKey: 외부 인사는 식별자 없음
					<span key={`ext-${i}`}>
						{i > 0 && ", "}
						<span className="text-muted-foreground">{p.name}</span>
					</span>
				);
			}
			return (
				<span key={p.username}>
					{i > 0 && ", "}
					<UserNameDisplay
						user={{
							name: p.name,
							username: p.username,
							mainExternalSite: p.mainExternalSite,
							mainExternalRating: p.mainExternalRating,
						}}
						withLink
					/>
				</span>
			);
		});

	const creditsSection = hasCredits ? (
		<div className="mt-6">
			<Separator className="mb-4" />
			<dl className="space-y-2 text-sm">
				{sources.length > 0 && (
					<div className="flex gap-2">
						<dt className="text-muted-foreground shrink-0">출처</dt>
						<dd className="space-y-1">
							{sources.map((s, i) => (
								// biome-ignore lint/suspicious/noArrayIndexKey: sources 는 순서가 안정적
								<div key={i}>
									<SourcePath
										segments={s.segments}
										leafLabel={s.problemNumber}
										variant="emphasized"
									/>
								</div>
							))}
						</dd>
					</div>
				)}
				{authors.length > 0 && (
					<div className="flex gap-2">
						<dt className="text-muted-foreground shrink-0">문제를 만든 사람</dt>
						<dd>{staffLinks(authors)}</dd>
					</div>
				)}
				{reviewers.length > 0 && (
					<div className="flex gap-2">
						<dt className="text-muted-foreground shrink-0">검수한 사람</dt>
						<dd>{staffLinks(reviewers)}</dd>
					</div>
				)}
				{showJudgePriority && (
					<div className="flex gap-2">
						<dt className="text-muted-foreground shrink-0">채점 우선순위</dt>
						<dd>{JUDGE_PRIORITY_LABELS[problem.judgePriority as JudgePriority]}</dd>
					</div>
				)}
				<TagsRevealRow tags={confirmedTags} autoReveal={votePanelData.canViewVotes} />
				{showFullJudgeNotice && (
					<div className="flex gap-2">
						<dd>
							{problem.totalTestcases}개의 테스트케이스 중{" "}
							<strong>{problem.passThreshold}개 이상</strong> 맞아야 정답으로 인정된다.
						</dd>
					</div>
				)}
			</dl>
		</div>
	) : null;

	const statsBar = (
		<ProblemStatsBar
			timeLimit={problem.timeLimit}
			memoryLimit={problem.memoryLimit}
			stats={stats}
		/>
	);

	if (mode === "split") {
		return (
			<div className="mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 space-y-4">
				<PageBreadcrumb items={breadcrumbItems} />
				<div className="flex justify-end">
					<LayoutToggle mode={mode} setMode={setMode} isNarrow={isNarrow} />
				</div>
				<div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
					{/* Left: Problem */}
					<div className="flex-1 overflow-y-auto">
						<Card>
							<CardHeader>
								<div>
									{problemHeaderSlot}
									<div className="mt-4">{statsBar}</div>
								</div>
							</CardHeader>
							<CardContent>
								<MarkdownRenderer content={problem.content} />
								{creditsSection}
							</CardContent>
						</Card>
					</div>

					{/* Right: Sub-tabs */}
					<div className="flex-1 overflow-hidden">
						<Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
							<TabsList className="w-full justify-start">
								<TabsTrigger value="submit">코드 제출</TabsTrigger>
								<TabsTrigger value="my">내 제출</TabsTrigger>
								<TabsTrigger value="vote">난이도 투표</TabsTrigger>
								<TabsTrigger value="all">전체 제출</TabsTrigger>
								<TabsTrigger value="ranking">맞은 사람</TabsTrigger>
								{isAdmin && <TabsTrigger value="rejudge">재채점</TabsTrigger>}
							</TabsList>
							<div className="flex-1 overflow-y-auto mt-2">
								<TabsContent
									forceMount
									value="submit"
									className="mt-0"
									hidden={activeTab !== "submit"}
								>
									{submitSection}
								</TabsContent>
								<TabsContent forceMount value="my" className="mt-0" hidden={activeTab !== "my"}>
									{mySubmissionsSection}
								</TabsContent>
								<TabsContent forceMount value="vote" className="mt-0" hidden={activeTab !== "vote"}>
									{voteSection}
								</TabsContent>
								<TabsContent
									forceMount
									value="ranking"
									className="mt-0"
									hidden={activeTab !== "ranking"}
								>
									{rankingSection}
								</TabsContent>
								<TabsContent forceMount value="all" className="mt-0" hidden={activeTab !== "all"}>
									{allSubmissionsSection}
								</TabsContent>
								{isAdmin && (
									<TabsContent
										forceMount
										value="rejudge"
										className="mt-0"
										hidden={activeTab !== "rejudge"}
									>
										{rejudgeSection}
									</TabsContent>
								)}
							</div>
						</Tabs>
					</div>
				</div>
			</div>
		);
	}

	// Single column layout
	return (
		<div className="page-container space-y-4">
			<PageBreadcrumb items={breadcrumbItems} />
			<div className="flex justify-end">
				<LayoutToggle mode={mode} setMode={setMode} isNarrow={isNarrow} />
			</div>

			<Card>
				<CardHeader>
					<div>
						{problemHeaderSlot}
						<div className="mt-4">{statsBar}</div>
					</div>
				</CardHeader>
				<CardContent className="space-y-6">
					<MarkdownRenderer content={problem.content} />
					{creditsSection}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>코드 제출</CardTitle>
				</CardHeader>
				<CardContent>{submitSection}</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>내 제출</CardTitle>
				</CardHeader>
				<CardContent>{mySubmissionsSection}</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>맞은 사람</CardTitle>
				</CardHeader>
				<CardContent>{rankingSection}</CardContent>
			</Card>

			{voteSection}

			<Card>
				<CardHeader>
					<CardTitle>전체 제출</CardTitle>
				</CardHeader>
				<CardContent>{allSubmissionsSection}</CardContent>
			</Card>

			{isAdmin && (
				<Card>
					<CardHeader>
						<CardTitle>재채점</CardTitle>
					</CardHeader>
					<CardContent>{rejudgeSection}</CardContent>
				</Card>
			)}
		</div>
	);
}
