import { NextResponse } from "next/server";
import { registerForContest } from "@/actions/contests";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
	try {
		const { id } = await params;
		const contestId = Number.parseInt(id, 10);

		await registerForContest(contestId);

		return NextResponse.redirect(new URL(`/contests/${contestId}`, request.url));
	} catch (error) {
		console.error("Contest registration error:", error);
		return NextResponse.json({ error: "대회 등록 중 오류가 발생했습니다." }, { status: 500 });
	}
}
