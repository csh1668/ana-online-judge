import { redirect } from "next/navigation";
import { getGroupForUser, listGroupProblems } from "@/actions/workshop/groups";
import { SettingsForm } from "./settings-form";

export default async function GroupSettingsTab({ params }: { params: Promise<{ gid: string }> }) {
	const { gid } = await params;
	const groupId = Number.parseInt(gid, 10);
	const group = await getGroupForUser(groupId);
	if (!group || group.myRole !== "owner") {
		redirect(`/workshop/groups/${groupId}`);
	}
	const problems = await listGroupProblems(groupId);
	const publishedCount = problems.filter((p) => p.publishedProblemId !== null).length;
	const unpublishedCount = problems.length - publishedCount;
	return (
		<SettingsForm
			groupId={groupId}
			name={group.name}
			description={group.description}
			publishedCount={publishedCount}
			unpublishedCount={unpublishedCount}
		/>
	);
}
