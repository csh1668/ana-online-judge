import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { listWorkshopMembers } from "@/actions/workshop/members";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { auth } from "@/auth";
import { db } from "@/db";
import { workshopProblemMembers } from "@/db/schema";
import { WorkshopProblemNav } from "../nav";
import { MembersClient } from "./members-client";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId)) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem } = data;

	const session = await auth();
	const currentUserId = session?.user?.id ? Number.parseInt(session.user.id, 10) : null;
	const isAdmin = session?.user?.role === "admin";

	const members = await listWorkshopMembers(problem.id);

	let isOwner = isAdmin;
	if (!isOwner && currentUserId !== null) {
		const [m] = await db
			.select({ role: workshopProblemMembers.role })
			.from(workshopProblemMembers)
			.where(
				and(
					eq(workshopProblemMembers.workshopProblemId, problem.id),
					eq(workshopProblemMembers.userId, currentUserId)
				)
			)
			.limit(1);
		isOwner = m?.role === "owner";
	}

	return (
		<div className="container mx-auto p-6">
			<div className="mb-4">
				<h1 className="text-2xl font-bold">{problem.title}</h1>
				<p className="text-xs text-muted-foreground mt-1">멤버 관리</p>
			</div>
			<WorkshopProblemNav problemId={problem.id} />
			<MembersClient
				problemId={problem.id}
				initialMembers={members}
				isOwner={isOwner}
				currentUserId={currentUserId}
			/>
		</div>
	);
}
