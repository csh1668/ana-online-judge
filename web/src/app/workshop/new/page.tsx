import { redirect } from "next/navigation";
import { getGroupForUser } from "@/actions/workshop/groups";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { NewWorkshopProblemForm } from "./new-form";

export const dynamic = "force-dynamic";

export default async function NewWorkshopProblemPage({
	searchParams,
}: {
	searchParams: Promise<{ group?: string }>;
}) {
	try {
		await requireWorkshopAccess();
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		redirect("/workshop");
	}

	const { group } = await searchParams;
	const groupId = group ? Number.parseInt(group, 10) : null;
	const groupInfo =
		groupId !== null && Number.isFinite(groupId) ? await getGroupForUser(groupId) : null;

	if (groupId !== null && !groupInfo) {
		redirect("/workshop");
	}

	return (
		<PageShell
			width="narrow"
			breadcrumb={[
				{ label: "창작마당", href: "/workshop" },
				...(groupInfo ? [{ label: groupInfo.name, href: `/workshop/groups/${groupInfo.id}` }] : []),
				{ label: "새 문제" },
			]}
		>
			<Card>
				<PageHeader
					title="새 창작마당 문제"
					description={groupInfo ? `그룹 "${groupInfo.name}" 안에서 생성` : "개인 문제로 생성"}
				/>
				<CardContent>
					<NewWorkshopProblemForm groupId={groupInfo?.id ?? null} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
