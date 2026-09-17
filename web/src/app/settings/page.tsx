import Link from "next/link";
import { redirect } from "next/navigation";
import { getMainExternalSite, getUserByUsername, getUserHandles } from "@/actions/profile";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectedHandlesForm } from "./connected-handles-form";
import { ProfileForm } from "./profile-form";
import { VisibilityForm } from "./visibility-form";

export const metadata = { title: "설정 — AOJ" };

export default async function SettingsPage() {
	const session = await auth();
	const username = session?.user?.username;
	if (!username) redirect("/login");

	const user = await getUserByUsername(username);
	if (!user) redirect("/login");

	const [handles, mainExternalSite] = await Promise.all([
		getUserHandles(user.id),
		getMainExternalSite(user.id),
	]);

	return (
		<PageShell width="narrow" breadcrumb={[{ label: "설정" }]}>
			<Card>
				<PageHeader title="설정" />
				<CardContent>
					<h3 className="text-sm font-semibold mb-3">프로필</h3>
					<ProfileForm initial={{ name: user.name, bio: user.bio, avatarUrl: user.avatarUrl }} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>외부 핸들 연동</CardTitle>
				</CardHeader>
				<CardContent>
					<ConnectedHandlesForm initialHandles={handles} initialMainSite={mainExternalSite} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>기본 제출 공개 설정</CardTitle>
				</CardHeader>
				<CardContent>
					<VisibilityForm initial={user.defaultSubmissionVisibility ?? "public"} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>연결된 앱</CardTitle>
					<CardDescription>외부 앱에서 발급된 API 토큰을 관리합니다</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground mb-4">
						외부 앱에서 발급된 API 토큰을 확인하고 회수할 수 있습니다.
					</p>
					<Link href="/settings/devices">
						<Button variant="outline">관리</Button>
					</Link>
				</CardContent>
			</Card>
		</PageShell>
	);
}
