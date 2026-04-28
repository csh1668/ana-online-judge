import { redirect } from "next/navigation";
import { getGroupForUser } from "@/actions/workshop/groups";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { NewWorkshopProblemForm } from "./new-form";

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
		<div className="container mx-auto p-6 max-w-xl">
			<h1 className="text-2xl font-bold mb-2">새 창작마당 문제</h1>
			{groupInfo ? (
				<p className="text-sm text-muted-foreground mb-6">
					그룹: <span className="font-medium">{groupInfo.name}</span> 안에서 생성
				</p>
			) : (
				<p className="text-sm text-muted-foreground mb-6">개인 문제로 생성</p>
			)}
			<NewWorkshopProblemForm groupId={groupInfo?.id ?? null} />
		</div>
	);
}
