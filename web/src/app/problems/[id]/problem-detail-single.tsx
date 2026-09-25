"use client";

import type { ReactNode } from "react";
import { type RailItem, RailSection } from "@/components/layout/page-rail";
import { PageShell } from "@/components/layout/page-shell";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProblemDetailSections } from "./problem-detail-sections";

interface ProblemDetailSingleProps {
	breadcrumbItems: { label: string; href?: string }[];
	breadcrumbAside: ReactNode;
	problemHeader: ReactNode;
	statsBar: ReactNode;
	content: string;
	creditsSection: ReactNode;
	sections: ProblemDetailSections;
	isAdmin: boolean;
}

/** 단일 모드: 카드가 세로로 쌓이고 좌측 레일이 섹션 이동을 담당한다. */
export function ProblemDetailSingle({
	breadcrumbItems,
	breadcrumbAside,
	problemHeader,
	statsBar,
	content,
	creditsSection,
	sections,
	isAdmin,
}: ProblemDetailSingleProps) {
	const railItems: RailItem[] = [
		{ kind: "section", id: "problem", label: "문제" },
		{ kind: "section", id: "submit", label: "코드 제출" },
		{ kind: "section", id: "my-submissions", label: "내 제출" },
		{ kind: "section", id: "ranking", label: "맞은 사람" },
		{ kind: "section", id: "vote", label: "난이도 투표" },
		{ kind: "section", id: "all-submissions", label: "전체 제출" },
		...(isAdmin ? [{ kind: "section", id: "rejudge", label: "재채점" } as const] : []),
	];

	return (
		<PageShell
			width="default"
			breadcrumb={breadcrumbItems}
			breadcrumbAside={breadcrumbAside}
			rail={{ items: railItems }}
		>
			<RailSection id="problem" label="문제">
				<Card>
					<CardHeader>
						<div>
							{problemHeader}
							<div className="mt-4">{statsBar}</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						<MarkdownRenderer content={content} />
						{creditsSection}
					</CardContent>
				</Card>
			</RailSection>

			<RailSection id="submit" label="코드 제출">
				<Card>
					<CardHeader>
						<CardTitle>코드 제출</CardTitle>
					</CardHeader>
					<CardContent>{sections.submit}</CardContent>
				</Card>
			</RailSection>

			<RailSection id="my-submissions" label="내 제출">
				<Card>
					<CardHeader>
						<CardTitle>내 제출</CardTitle>
					</CardHeader>
					<CardContent>{sections.mySubmissions}</CardContent>
				</Card>
			</RailSection>

			<RailSection id="ranking" label="맞은 사람">
				<Card>
					<CardHeader>
						<CardTitle>맞은 사람</CardTitle>
					</CardHeader>
					<CardContent>{sections.ranking}</CardContent>
				</Card>
			</RailSection>

			<RailSection id="vote" label="난이도 투표">
				{sections.vote}
			</RailSection>

			<RailSection id="all-submissions" label="전체 제출">
				<Card>
					<CardHeader>
						<CardTitle>전체 제출</CardTitle>
					</CardHeader>
					<CardContent>{sections.allSubmissions}</CardContent>
				</Card>
			</RailSection>

			{isAdmin && (
				<RailSection id="rejudge" label="재채점">
					<Card>
						<CardHeader>
							<CardTitle>재채점</CardTitle>
						</CardHeader>
						<CardContent>{sections.rejudge}</CardContent>
					</Card>
				</RailSection>
			)}
		</PageShell>
	);
}
