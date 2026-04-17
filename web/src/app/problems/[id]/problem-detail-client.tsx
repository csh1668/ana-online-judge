"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { SubmissionListItem } from "@/actions/submissions";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { SourcePath } from "@/components/sources/source-path";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProblemType } from "@/db/schema";
import { useProblemLayout } from "@/hooks/use-problem-layout";
import type { ProblemRankingItem, ProblemStats } from "@/lib/services/problem-stats";
import { AllSubmissions } from "./all-submissions";
import { LayoutToggle } from "./layout-toggle";
import { MySubmissions } from "./my-submissions";
import { ProblemRanking } from "./problem-ranking";
import { ProblemStatsBar } from "./problem-stats-bar";
import { ProblemSubmitSection } from "./submit-section";

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
	};
	authors: { name: string; username: string }[];
	reviewers: { name: string; username: string }[];
	sources: { id: number; name: string }[][];
	stats: ProblemStats;
	mySubmissions: SubmissionListItem[];
	allSubmissions: { submissions: SubmissionListItem[]; total: number };
	rankings: { rankings: ProblemRankingItem[]; total: number };
	currentUserId: number | null;
	isAdmin: boolean;
	contestId?: number;
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
		/>
	);

	const hasCredits = sources.length > 0 || authors.length > 0 || reviewers.length > 0;

	const staffLinks = (people: { name: string; username: string }[]) =>
		people.map((p, i) => (
			<span key={p.username}>
				{i > 0 && ", "}
				<Link href={`/profile/${p.username}`} className="text-primary hover:underline">
					{p.name}
				</Link>
			</span>
		));

	const creditsSection = hasCredits ? (
		<div className="mt-6">
			<Separator className="mb-4" />
			<dl className="space-y-2 text-sm">
				{sources.length > 0 && (
					<div className="flex gap-2">
						<dt className="text-muted-foreground shrink-0">출처</dt>
						<dd className="space-y-1">
							{sources.map((chain, i) => (
								<SourcePath
									// biome-ignore lint/suspicious/noArrayIndexKey: sources 는 순서가 안정적
									key={i}
									segments={chain}
									variant="emphasized"
								/>
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
								<TabsTrigger value="all">전체 제출</TabsTrigger>
								<TabsTrigger value="ranking">맞은 사람</TabsTrigger>
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
							</div>
						</Tabs>
					</div>
				</div>
			</div>
		);
	}

	// Single column layout
	return (
		<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 space-y-4">
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

			<Card>
				<CardHeader>
					<CardTitle>전체 제출</CardTitle>
				</CardHeader>
				<CardContent>{allSubmissionsSection}</CardContent>
			</Card>
		</div>
	);
}
