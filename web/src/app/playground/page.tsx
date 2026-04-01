import { redirect } from "next/navigation";
import { getPlaygroundSessions, requirePlaygroundAccess } from "@/actions/playground";
import { auth } from "@/auth";
import { PlaygroundSessionList } from "@/components/playground/session-list";

export const metadata = {
	title: "플레이그라운드",
};

export default async function PlaygroundPage() {
	const session = await auth();

	if (!session?.user?.id) {
		redirect("/login");
	}

	const userId = parseInt(session.user.id, 10);

	// Check permission
	try {
		await requirePlaygroundAccess(userId);
	} catch (_e) {
		return (
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<h1 className="text-2xl font-bold mb-4">접근 권한이 없습니다</h1>
				<p>플레이그라운드를 사용할 권한이 없습니다. 관리자에게 문의하세요.</p>
			</div>
		);
	}

	const sessions = await getPlaygroundSessions(userId);

	return (
		<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
			<h1 className="text-2xl font-bold mb-8">내 플레이그라운드</h1>
			<PlaygroundSessionList initialSessions={sessions} userId={userId} />
		</div>
	);
}
