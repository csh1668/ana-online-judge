import { redirect } from "next/navigation";
import { getPlaygroundSession } from "@/actions/playground";
import { auth } from "@/auth";
import { IDELayout } from "@/components/playground/ide-layout";

interface PageProps {
	params: Promise<{ sessionId: string }>;
}

export const metadata = {
	title: "플레이그라운드",
};

export default async function PlaygroundSessionPage({ params }: PageProps) {
	const session = await auth();
	const resolvedParams = await params;

	if (!session?.user?.id) {
		redirect("/login");
	}

	const userId = parseInt(session.user.id, 10);

	const playgroundSession = await getPlaygroundSession(resolvedParams.sessionId, userId);

	if (!playgroundSession) {
		return (
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<h1 className="text-2xl font-bold mb-4">세션을 찾을 수 없습니다</h1>
				<p>존재하지 않거나 삭제된 세션입니다.</p>
			</div>
		);
	}

	return <IDELayout sessionId={playgroundSession.id} initialFiles={playgroundSession.files} />;
}
