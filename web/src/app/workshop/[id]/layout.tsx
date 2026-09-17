import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getGroupName } from "@/actions/workshop/queries";
import { PageShell } from "@/components/layout/page-shell";
import { Badge } from "@/components/ui/badge";
import { WorkshopProblemBreadcrumb } from "./_components/problem-breadcrumb";
import { WorkshopProblemNav } from "./nav";

export default async function WorkshopProblemLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem, draft } = data;
	const groupName = problem.groupId !== null ? await getGroupName(problem.groupId) : null;

	const base = [
		{ label: "창작마당", href: "/workshop" },
		...(problem.groupId !== null
			? [
					{
						label: groupName ?? `그룹 #${problem.groupId}`,
						href: `/workshop/groups/${problem.groupId}`,
					},
				]
			: []),
		{ label: draft.title, href: `/workshop/${problem.id}` },
	];

	return (
		<PageShell breadcrumbSlot={<WorkshopProblemBreadcrumb base={base} problemId={problem.id} />}>
			<div>
				<div className="flex flex-wrap items-center gap-2">
					<h1 className="text-2xl font-bold tracking-tight">{draft.title}</h1>
					{problem.groupId !== null && (
						<Badge variant="secondary" asChild>
							<Link href={`/workshop/groups/${problem.groupId}`}>
								그룹: {groupName ?? `#${problem.groupId}`}
							</Link>
						</Badge>
					)}
				</div>
				<p className="mt-1 font-mono text-xs text-muted-foreground">
					ID {problem.id} · {draft.problemType} · {draft.timeLimit}ms · {draft.memoryLimit}MB · seed{" "}
					{draft.seed}
				</p>
				<div className="mt-4">
					<WorkshopProblemNav problemId={problem.id} />
				</div>
			</div>
			{children}
		</PageShell>
	);
}
