import { CheckCircle2, Download, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProblemRanking, getProblemStats } from "@/actions/problem-stats";
import { getProblemVotesData } from "@/actions/problem-votes";
import { getProblemById } from "@/actions/problems";
import { getSubmissions, getUserProblemStatuses } from "@/actions/submissions";
import { auth } from "@/auth";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { LanguageSwitcherClient } from "@/components/problems/language-switcher-client";
import { ProblemTypeBadges } from "@/components/problems/problem-type-badges";
import { TierBadge } from "@/components/tier/tier-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { LanguageCode } from "@/db/schema";
import { resolveDisplay } from "@/lib/utils/translations";
import { ProblemDetailClient } from "./problem-detail-client";

interface Props {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ locale?: string }>;
}

const VALID_LOCALES: LanguageCode[] = ["ko", "en", "ja", "pl", "hr"];

function resolveLocale(locale: string | undefined): LanguageCode {
	return VALID_LOCALES.includes(locale as LanguageCode) ? (locale as LanguageCode) : "ko";
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
	const { id } = await params;
	const { locale } = await searchParams;
	const problem = await getProblemById(parseInt(id, 10));

	if (!problem) {
		return { title: "문제를 찾을 수 없음" };
	}

	const currentLocale = resolveLocale(locale);
	const display = resolveDisplay(problem.translations, currentLocale);

	return {
		title: display.title,
		description: `문제 ${problem.id}: ${display.title}`,
	};
}

export default async function ProblemDetailPage({ params, searchParams }: Props) {
	const { id } = await params;
	const { locale } = await searchParams;
	const problemId = parseInt(id, 10);
	const problem = await getProblemById(problemId);
	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

	if (!problem) {
		notFound();
	}

	const currentLocale = resolveLocale(locale);
	const display = resolveDisplay(problem.translations, currentLocale);

	// Parallel data fetch
	const [
		stats,
		mySubmissionsResult,
		allSubmissionsResult,
		rankingsResult,
		userStatus,
		votePanelData,
	] = await Promise.all([
		getProblemStats(problemId),
		currentUserId
			? getSubmissions({
					problemId,
					userId: currentUserId,
					limit: 20,
					sort: "createdAt",
					order: "desc",
				})
			: Promise.resolve({ submissions: [], total: 0 }),
		getSubmissions({
			problemId,
			limit: 20,
			sort: "createdAt",
			order: "desc",
		}),
		getProblemRanking(problemId, { sortBy: "executionTime", page: 1, limit: 20 }),
		currentUserId ? getUserProblemStatuses([problemId], currentUserId) : Promise.resolve(new Map()),
		getProblemVotesData(problemId),
	]);

	const status = userStatus.get(problemId);
	const isSolved = status?.solved ?? false;
	const score = status?.score ?? null;

	// Problem header (server-rendered, passed as slot)
	const problemHeader = (
		<div>
			<div className="flex items-start justify-between gap-4">
				<div className="flex-1">
					<div className="flex items-center gap-2 text-muted-foreground mb-2">
						<span className="font-mono">#{problem.id}</span>
					</div>
					<div className="flex items-center gap-3">
						<TierBadge tier={problem.tier} kind="problem" size="md" />
						<CardTitle className="text-2xl">
							<MarkdownRenderer content={display.title} inline />
						</CardTitle>
						<ProblemTypeBadges
							type={problem.problemType}
							judgeAvailable={problem.judgeAvailable}
							languageRestricted={problem.allowedLanguages !== null}
							hasSubtasks={problem.hasSubtasks}
						/>
						{isAdmin && !problem.isPublic && (
							<Badge variant="secondary" className="text-xs">
								비공개
							</Badge>
						)}
						{isSolved && (
							<div className="flex items-center gap-1">
								<CheckCircle2 className="h-5 w-5 text-green-600" />
								{problem.problemType === "anigma" && score !== null && (
									<span className="text-sm font-medium text-green-600">{score}점</span>
								)}
							</div>
						)}
						<LanguageSwitcherClient
							translations={problem.translations}
							currentLanguage={currentLocale}
						/>
					</div>
					{isAdmin && (
						<Button variant="ghost" size="icon" asChild>
							<Link href={`/admin/problems/${problem.id}`} aria-label="관리자 페이지">
								<Pencil className="h-4 w-4" />
							</Link>
						</Button>
					)}
				</div>
			</div>
			{problem.problemType === "anigma" && problem.referenceCodePath && (
				<>
					<Separator className="my-4" />
					<div className="flex items-center justify-between p-4 border rounded-md bg-muted/10">
						<div>
							<p className="text-sm font-medium">문제 제공 코드 (Reference Code)</p>
							<p className="text-xs text-muted-foreground mt-1">
								ANIGMA 문제를 해결하기 위한 참조 코드를 다운로드하세요.
							</p>
						</div>
						<Button variant="outline" size="sm" asChild>
							<Link href={`/api/problems/${problem.id}/reference-code`}>
								<Download className="mr-2 h-4 w-4" />
								다운로드
							</Link>
						</Button>
					</div>
				</>
			)}
		</div>
	);

	return (
		<div className="py-8">
			<ProblemDetailClient
				problem={{
					id: problem.id,
					title: display.title,
					content: display.content,
					timeLimit: problem.timeLimit,
					memoryLimit: problem.memoryLimit,
					problemType: problem.problemType,
					judgeAvailable: problem.judgeAvailable,
					allowedLanguages: problem.allowedLanguages,
					isPublic: problem.isPublic,
					tier: problem.tier,
					tierUpdatedAt: problem.tierUpdatedAt,
				}}
				authors={problem.authors}
				reviewers={problem.reviewers}
				sources={problem.sources}
				stats={stats}
				mySubmissions={mySubmissionsResult.submissions}
				allSubmissions={allSubmissionsResult}
				rankings={rankingsResult}
				currentUserId={currentUserId}
				isAdmin={isAdmin}
				votePanelData={votePanelData}
				confirmedTags={votePanelData.confirmedTags}
				breadcrumbItems={[{ label: "문제", href: "/problems" }, { label: display.title }]}
			>
				{problemHeader}
			</ProblemDetailClient>
		</div>
	);
}
