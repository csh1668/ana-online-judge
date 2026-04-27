import { Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSubmissions } from "@/actions/submissions";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Button } from "@/components/ui/button";
import { getSessionInfo } from "@/lib/auth-utils";
import { getUserHeatmap, getUserLanguageStats, getUserStats } from "@/lib/services/user-stats";
import { getUserByUsername } from "@/lib/services/users";
import { ImpersonateButton } from "./impersonate-button";
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
		getSubmissions({ userId: user.id, page, limit: 20, excludeContestSubmissions: true }),
	]);

	return (
		<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
			<PageBreadcrumb items={[{ label: "프로필" }, { label: user.name }]} />
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2 flex relative">
					<ProfileHeader user={user} stats={stats} isOwner={isOwner} />
					{isAdmin && !isOwner && (
						<div className="absolute top-2 right-2 z-10 flex gap-1">
							<ImpersonateButton userId={user.id} username={user.username} />
							<Button variant="ghost" size="icon" asChild>
								<Link href="/admin/users" aria-label="관리자 페이지">
									<Pencil className="h-4 w-4" />
								</Link>
							</Button>
						</div>
					)}
					{isAdmin && isOwner && (
						<Button variant="ghost" size="icon" asChild className="absolute top-2 right-2 z-10">
							<Link href="/admin/users" aria-label="관리자 페이지">
								<Pencil className="h-4 w-4" />
							</Link>
						</Button>
					)}
				</div>
				<div className="flex">
					<ProfileLanguageChart data={languageStats} />
				</div>
			</div>

			<ProfileHeatmap data={heatmap} />

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
