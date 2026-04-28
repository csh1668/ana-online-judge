import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { isProxyConfigured, listContainers } from "@/lib/services/docker-logs";

export const dynamic = "force-dynamic";

export async function GET() {
	const session = await auth();
	if (!session?.user || session.user.role !== "admin") {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	if (!isProxyConfigured()) {
		return NextResponse.json({ error: "DOCKER_PROXY_URL not configured" }, { status: 503 });
	}

	try {
		const containers = await listContainers();
		return NextResponse.json({ containers });
	} catch (error) {
		const message = error instanceof Error ? error.message : "unknown error";
		return NextResponse.json({ error: message }, { status: 502 });
	}
}
