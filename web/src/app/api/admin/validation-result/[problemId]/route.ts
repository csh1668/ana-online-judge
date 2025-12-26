import { NextResponse } from "next/server";
import { getValidationResult } from "@/actions/admin";

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ problemId: string }> }
) {
	try {
		const { problemId } = await params;
		const result = await getValidationResult(Number.parseInt(problemId, 10));

		if (!result) {
			return NextResponse.json({ status: "pending" }, { status: 200 });
		}

		return NextResponse.json(result, { status: 200 });
	} catch (error) {
		console.error("Validation result fetch error:", error);
		return NextResponse.json({ error: "Failed to fetch validation result" }, { status: 500 });
	}
}
