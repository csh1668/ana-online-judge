import { notFound, redirect } from "next/navigation";
import { getGroupForUser } from "@/actions/workshop/groups";
import { PageShell } from "@/components/layout/page-shell";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { GroupBreadcrumb } from "./_components/group-breadcrumb";
import { GroupNav } from "./nav";

export default async function GroupLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ gid: string }>;
}) {
	try {
		await requireWorkshopAccess();
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		redirect("/workshop");
	}
	const { gid } = await params;
	const groupId = Number.parseInt(gid, 10);
	if (!Number.isFinite(groupId)) notFound();
	const group = await getGroupForUser(groupId);
	if (!group) notFound();

	return (
		<PageShell
			breadcrumbSlot={
				<GroupBreadcrumb
					base={[
						{ label: "창작마당", href: "/workshop" },
						{ label: group.name, href: `/workshop/groups/${groupId}` },
					]}
					groupId={groupId}
				/>
			}
		>
			<div>
				<h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
				{group.description && (
					<p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">
						{group.description}
					</p>
				)}
				<div className="mt-4">
					<GroupNav groupId={groupId} isOwner={group.myRole === "owner"} />
				</div>
			</div>
			{children}
		</PageShell>
	);
}
