import { type NextRequest, NextResponse } from "next/server";
import { getPlaygroundSession } from "@/actions/playground";
import { auth } from "@/auth";

export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ sessionId: string }> }
) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { sessionId } = await params;
	const userId = parseInt(session.user.id, 10);

	const playgroundSession = await getPlaygroundSession(sessionId, userId);
	if (!playgroundSession) {
		return NextResponse.json({ error: "Session not found" }, { status: 404 });
	}

	return NextResponse.json({ files: playgroundSession.files });
}
