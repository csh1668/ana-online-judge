import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPracticeById, getPracticeScoreboard } from "@/actions/practices";
import type { GetScoreboardReturn } from "@/actions/scoreboard";
import { auth } from "@/auth";
import { Scoreboard } from "@/components/contests/scoreboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const practice = await getPracticeById(Number.parseInt(id, 10));
	if (!practice) return { title: "연습을 찾을 수 없습니다" };
	return { title: `${practice.title} - 스코어보드` };
}

export default async function PracticeScoreboardPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	const practiceId = Number.parseInt(id, 10);
	const practice = await getPracticeById(practiceId);
	if (!practice) notFound();

	const sbData = await getPracticeScoreboard(practiceId);

	const session = await auth();
	const isAdmin = session?.user?.role === "admin";
	const currentUserId = session?.user?.id ? Number.parseInt(session.user.id, 10) : null;

	const adaptedData: GetScoreboardReturn = {
		contest: {
			id: practice.id,
			title: practice.title,
			description: practice.description,
			startTime: practice.startTime,
			endTime: practice.endTime,
			freezeMinutes: 0,
			isFrozen: false,
			visibility: "public",
			scoreboardType: "basic",
			penaltyMinutes: practice.penaltyMinutes,
			sourceId: null,
			createdAt: practice.createdAt,
			updatedAt: practice.updatedAt,
		},
		scoreboard: sbData.scoreboard,
		isFrozen: false,
	};

	return (
		<div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle>{practice.title} — 스코어보드</CardTitle>
				</CardHeader>
				<CardContent>
					<Scoreboard data={adaptedData} currentUserId={currentUserId} isAdmin={isAdmin} />
				</CardContent>
			</Card>
		</div>
	);
}
