import { type NextRequest, NextResponse } from "next/server";
import { getPlaygroundSession, requirePlaygroundAccess } from "@/actions/playground";
import { auth } from "@/auth";

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ sessionId: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { sessionId } = await params;
    const userId = parseInt(session.user.id, 10);

    // 권한 체크
    try {
        await requirePlaygroundAccess(userId);
    } catch {
        return NextResponse.json({ error: "No playground access" }, { status: 403 });
    }

    const playgroundSession = await getPlaygroundSession(sessionId, userId);
    if (!playgroundSession) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({ files: playgroundSession.files });
}




