import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getContestById } from "@/actions/contests";
import { getScoreboard, getSpotboardData } from "@/actions/scoreboard";
import { auth } from "@/auth";
import { AwardCeremony } from "@/components/contests/award-ceremony";
import { Scoreboard } from "@/components/contests/scoreboard";
import { Spotboard } from "@/components/contests/spotboard";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const contest = await getContestById(Number.parseInt(id, 10));

	if (!contest) {
		return {
			title: "대회를 찾을 수 없습니다",
		};
	}

	return {
		title: `${contest.title} - 스코어보드`,
	};
}

export default async function ScoreboardPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ award?: string }>;
}) {
	const { id } = await params;
	const { award } = await searchParams;
	const contestId = Number.parseInt(id, 10);

	const contest = await getContestById(contestId);
	if (!contest) {
		notFound();
	}

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";

	// Award mode check
	const isAwardMode = award === "true";

	const isSpotboard = contest.scoreboardType === "spotboard";

	if (isSpotboard) {
		const spotboardData = await getSpotboardData(contestId);
		// Spotboard handles its own layout/header, or we can wrap it.
		// Spotboard usually expects full screen.
		return (
			<div className="w-full min-h-screen bg-white">
				<Spotboard config={spotboardData} isAwardMode={isAwardMode} />
			</div>
		);
	}

	const scoreboardData = await getScoreboard(contestId);

	// If award mode is requested but scoreboard is frozen and user is not admin, deny access
	if (isAwardMode && scoreboardData.isFrozen && !isAdmin) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<p className="text-lg text-muted-foreground">
						시상 모드는 스코어보드가 공개된 후에만 접근할 수 있습니다.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full h-screen flex flex-col">
			{/* Header */}
			<div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
				<div className="px-6 py-4">
					<h1 className="text-2xl font-bold">
						{contest.title} - 스코어보드
						{isAwardMode && " (시상 모드)"}
					</h1>
				</div>
			</div>

			{/* Scoreboard Content */}
			<div className="flex-1 overflow-auto p-6">
				{isAwardMode ? (
					<AwardCeremony data={scoreboardData} />
				) : (
					<Scoreboard data={scoreboardData} />
				)}
			</div>
		</div>
	);
}
