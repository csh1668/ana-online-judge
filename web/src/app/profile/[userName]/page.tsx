import { notFound } from "next/navigation";
import { getSessionInfo } from "@/lib/auth-utils";
import { getSubmissions } from "@/lib/services/submissions";
import { getUserHeatmap, getUserLanguageStats, getUserStats } from "@/lib/services/user-stats";
import { getUserByUsername } from "@/lib/services/users";
import { ProfileHeader } from "./profile-header";
import { ProfileHeatmap } from "./profile-heatmap";
import { ProfileLanguageChart } from "./profile-language-chart";
import { ProfileSubmissions } from "./profile-submissions";

export async function generateMetadata({ params }: { params: Promise<{ userName: string }> }) {
	const { userName } = await params;
	const user = await getUserByUsername(decodeURIComponent(userName));
	if (!user) return { title: "사용자를 찾을 수 없습니다" };
	return { title: `${user.name} — AOJ` };
}

export default async function ProfilePage({
	params,
	searchParams,
}: {
	params: Promise<{ userName: string }>;
	searchParams: Promise<{ page?: string }>;
}) {
	const { userName } = await params;
	const { page: pageStr } = await searchParams;
	const page = Math.max(1, Number.parseInt(pageStr ?? "1", 10) || 1);

	const user = await getUserByUsername(decodeURIComponent(userName));
	if (!user) notFound();

	const { userId, isAdmin } = await getSessionInfo();
	const isOwner = userId === user.id;

	const [stats, heatmap, languageStats, submissionsData] = await Promise.all([
		getUserStats(user.id),
		getUserHeatmap(user.id),
		getUserLanguageStats(user.id),
		getSubmissions(
			{ userId: user.id, page, limit: 20, excludeContestSubmissions: true },
			{ currentUserId: userId, isAdmin }
		),
	]);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
			<ProfileHeader user={user} stats={stats} isOwner={isOwner} />
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2">
					<ProfileHeatmap data={heatmap} />
				</div>
				<div>
					<ProfileLanguageChart data={languageStats} />
				</div>
			</div>
			<ProfileSubmissions
				submissions={submissionsData.submissions}
				total={submissionsData.total}
				page={page}
				isAdmin={isAdmin}
				currentUserId={userId}
			/>
		</div>
	);
}
