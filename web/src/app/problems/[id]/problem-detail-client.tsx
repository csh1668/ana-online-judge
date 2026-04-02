"use client";

import { useCallback, useState } from "react";
import type { SubmissionListItem } from "@/actions/submissions";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
	stats: ProblemStats;
	mySubmissions: SubmissionListItem[];
	allSubmissions: { submissions: SubmissionListItem[]; total: number };
	rankings: { rankings: ProblemRankingItem[]; total: number };
	currentUserId: number | null;
	isAdmin: boolean;
	problemHeaderSlot: React.ReactNode;
}

export function ProblemDetailClient({
	problem,
	stats,
	mySubmissions,
	allSubmissions,
	rankings,
	currentUserId,
	isAdmin: _isAdmin,
	problemHeaderSlot,
}: ProblemDetailClientProps) {
	const { mode, setMode, isNarrow } = useProblemLayout();
	const [activeTab, setActiveTab] = useState("submit");

	const handleSubmitSuccess = useCallback(
		(submissionId: number, language: string) => {
			const newSubmission = {
				id: submissionId,
				problemId: problem.id,
				problemTitle: problem.title,
				problemIsPublic: problem.isPublic,
				maxScore: 100,
				userId: currentUserId ?? 0,
				userName: "",
				language: language as SubmissionListItem["language"],
				verdict: "pending" as const,
				executionTime: null,
				memoryUsed: null,
				codeLength: null,
				score: null,
				createdAt: new Date(),
				anigmaTaskType: null,
				contestId: null,
				contestProblemLabel: null,
			};
			if (mode === "split") {
				setActiveTab("my");
			}
			window.dispatchEvent(new CustomEvent("new-submission", { detail: newSubmission }));
		},
		[problem, currentUserId, mode]
	);

	const submitSection = (
		<ProblemSubmitSection
			problemId={problem.id}
			problemType={problem.problemType}
			judgeAvailable={problem.judgeAvailable}
			allowedLanguages={problem.allowedLanguages}
			onSubmitSuccess={handleSubmitSuccess}
		/>
	);

	const mySubmissionsSection = (
		<MySubmissions problemId={problem.id} initialSubmissions={mySubmissions} />
	);

	const allSubmissionsSection = (
		<AllSubmissions
			problemId={problem.id}
			initialSubmissions={allSubmissions.submissions}
			initialTotal={allSubmissions.total}
		/>
	);

	const rankingSection = (
		<ProblemRanking
			problemId={problem.id}
			initialRankings={rankings.rankings}
			initialTotal={rankings.total}
			currentUserId={currentUserId}
		/>
	);

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
				<div className="flex justify-end">
					<LayoutToggle mode={mode} setMode={setMode} isNarrow={isNarrow} />
				</div>
				<div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
					{/* Left: Problem */}
					<div className="flex-1 overflow-y-auto">
						<Card className="h-full">
							<CardHeader>
								{problemHeaderSlot}
								<div className="mt-4">{statsBar}</div>
							</CardHeader>
							<CardContent>
								<MarkdownRenderer content={problem.content} />
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
			<div className="flex justify-end">
				<LayoutToggle mode={mode} setMode={setMode} isNarrow={isNarrow} />
			</div>

			<Card>
				<CardHeader>
					{problemHeaderSlot}
					<div className="mt-4">{statsBar}</div>
				</CardHeader>
				<CardContent className="space-y-6">
					<MarkdownRenderer content={problem.content} />
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
