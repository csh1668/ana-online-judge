import { notFound, redirect } from "next/navigation";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSessionInfo } from "@/lib/auth-utils";
import { getUserByUsername } from "@/lib/services/users";
import { VisibilityForm } from "./visibility-form";

export const metadata = { title: "개인 설정 — AOJ" };

export default async function SettingsPage({ params }: { params: Promise<{ userName: string }> }) {
	const { userName } = await params;
	const user = await getUserByUsername(decodeURIComponent(userName));
	if (!user) notFound();

	const { userId } = await getSessionInfo();
	if (!userId) redirect("/login");
	if (userId !== user.id) notFound();

	return (
		<div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-8 space-y-6">
			<PageBreadcrumb
				items={[
					{ label: "프로필", href: `/profile/${user.username}` },
					{ label: user.name, href: `/profile/${user.username}` },
					{ label: "설정" },
				]}
			/>
			<Card>
				<CardHeader>
					<CardTitle>기본 제출 공개 설정</CardTitle>
				</CardHeader>
				<CardContent>
					<VisibilityForm initial={user.defaultSubmissionVisibility ?? "public"} />
				</CardContent>
			</Card>
		</div>
	);
}
