import { notFound, redirect } from "next/navigation";
import { getGroupForUser } from "@/actions/workshop/groups";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
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
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8 space-y-4">
			<PageBreadcrumb items={[{ label: "창작마당", href: "/workshop" }, { label: group.name }]} />
			<div>
				<h1 className="text-2xl font-bold">{group.name}</h1>
				{group.description && (
					<p className="mt-1 text-sm text-muted-foreground whitespace-pre-line">
						{group.description}
					</p>
				)}
			</div>
			<GroupNav groupId={groupId} isOwner={group.myRole === "owner"} />
			{children}
		</div>
	);
}
