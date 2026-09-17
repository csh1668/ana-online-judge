import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPracticeById } from "@/actions/practices";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { DeletePracticeButton } from "@/components/practices/delete-practice-button";
import { PracticeEditForm } from "@/components/practices/practice-edit-form";
import { PracticeProblemManager } from "@/components/practices/practice-problem-manager";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ id: string }>;
}): Promise<Metadata> {
	const { id } = await params;
	const practice = await getPracticeById(Number.parseInt(id, 10));
	if (!practice) return { title: "연습을 찾을 수 없습니다" };
	return { title: `${practice.title} - 편집` };
}

export default async function PracticeEditPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = await params;
	const practiceId = Number.parseInt(id, 10);
	const session = await auth();
	if (!session?.user) redirect("/login");
	const userId = Number.parseInt(session.user.id ?? "", 10);
	const isAdmin = session.user.role === "admin";

	const practice = await getPracticeById(practiceId);
	if (!practice) notFound();

	if (!isAdmin && practice.createdBy !== userId) redirect(`/practices/${practiceId}`);

	return (
		<PageShell
			width="narrow"
			breadcrumb={[
				{ label: "연습", href: "/practices" },
				{ label: practice.title, href: `/practices/${practiceId}` },
				{ label: "편집" },
			]}
		>
			<Card>
				<PageHeader title="편집" description={practice.title} />
				<CardContent>
					<PracticeEditForm practice={practice} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>문제</CardTitle>
				</CardHeader>
				<CardContent>
					<PracticeProblemManager practiceId={practiceId} problems={practice.problems} />
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>위험 영역</CardTitle>
				</CardHeader>
				<CardContent>
					<DeletePracticeButton practiceId={practiceId} redirectTo="/practices" />
				</CardContent>
			</Card>
		</PageShell>
	);
}
