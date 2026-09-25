"use client";

import type { ReactNode } from "react";
import { PageShell } from "@/components/layout/page-shell";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ProblemDetailSections } from "./problem-detail-sections";

interface ProblemDetailSplitProps {
	breadcrumbItems: { label: string; href?: string }[];
	breadcrumbAside: ReactNode;
	problemHeader: ReactNode;
	statsBar: ReactNode;
	content: string;
	creditsSection: ReactNode;
	sections: ProblemDetailSections;
	isAdmin: boolean;
	activeTab: string;
	onTabChange: (tab: string) => void;
}

/** 분할 모드: 좌측 지문, 우측 탭. 각 pane이 자체 스크롤한다. */
export function ProblemDetailSplit({
	breadcrumbItems,
	breadcrumbAside,
	problemHeader,
	statsBar,
	content,
	creditsSection,
	sections,
	isAdmin,
	activeTab,
	onTabChange,
}: ProblemDetailSplitProps) {
	return (
		<PageShell width="wide" breadcrumb={breadcrumbItems} breadcrumbAside={breadcrumbAside}>
			<div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
				{/* Left: Problem */}
				<div className="flex-1 overflow-y-auto">
					<Card>
						<CardHeader>
							<div>
								{problemHeader}
								<div className="mt-4">{statsBar}</div>
							</div>
						</CardHeader>
						<CardContent>
							<MarkdownRenderer content={content} />
							{creditsSection}
						</CardContent>
					</Card>
				</div>

				{/* Right: Sub-tabs */}
				<div className="flex-1 overflow-hidden">
					<Tabs value={activeTab} onValueChange={onTabChange} className="h-full flex flex-col">
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
								{sections.submit}
							</TabsContent>
							<TabsContent forceMount value="my" className="mt-0" hidden={activeTab !== "my"}>
								{sections.mySubmissions}
							</TabsContent>
							<TabsContent forceMount value="vote" className="mt-0" hidden={activeTab !== "vote"}>
								{sections.vote}
							</TabsContent>
							<TabsContent
								forceMount
								value="ranking"
								className="mt-0"
								hidden={activeTab !== "ranking"}
							>
								{sections.ranking}
							</TabsContent>
							<TabsContent forceMount value="all" className="mt-0" hidden={activeTab !== "all"}>
								{sections.allSubmissions}
							</TabsContent>
							{isAdmin && (
								<TabsContent
									forceMount
									value="rejudge"
									className="mt-0"
									hidden={activeTab !== "rejudge"}
								>
									{sections.rejudge}
								</TabsContent>
							)}
						</div>
					</Tabs>
				</div>
			</div>
		</PageShell>
	);
}
