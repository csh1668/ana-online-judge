import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { contests, practices } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
	const { searchParams } = new URL(request.url);
	const type = searchParams.get("type");
	const idParam = searchParams.get("id");

	if (!idParam || (type !== "contest" && type !== "practice")) {
		return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
	}

	const id = Number.parseInt(idParam, 10);
	if (!Number.isFinite(id)) {
		return NextResponse.json({ error: "Invalid id" }, { status: 400 });
	}

	if (type === "contest") {
		const [row] = await db
			.select({
				title: contests.title,
				startTime: contests.startTime,
				endTime: contests.endTime,
			})
			.from(contests)
			.where(eq(contests.id, id))
			.limit(1);
		if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
		return NextResponse.json({
			title: row.title,
			startTime: row.startTime.toISOString(),
			endTime: row.endTime.toISOString(),
		});
	}

	const [row] = await db
		.select({
			title: practices.title,
			startTime: practices.startTime,
			endTime: practices.endTime,
		})
		.from(practices)
		.where(eq(practices.id, id))
		.limit(1);
	if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
	return NextResponse.json({
		title: row.title,
		startTime: row.startTime.toISOString(),
		endTime: row.endTime.toISOString(),
	});
}
