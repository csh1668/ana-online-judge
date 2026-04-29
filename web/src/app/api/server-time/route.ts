import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
	return NextResponse.json({ now: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}
