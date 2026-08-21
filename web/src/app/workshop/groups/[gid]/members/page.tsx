import { getGroupForUser, listGroupMembers } from "@/actions/workshop/groups";
import { MembersPanel } from "./members-panel";

export const dynamic = "force-dynamic";

export default async function GroupMembersTab({ params }: { params: Promise<{ gid: string }> }) {
	const { gid } = await params;
	const groupId = Number.parseInt(gid, 10);
	const [group, members] = await Promise.all([getGroupForUser(groupId), listGroupMembers(groupId)]);
	const isOwner = group?.myRole === "owner";
	return <MembersPanel groupId={groupId} members={members} isOwner={!!isOwner} />;
}
