import { NextResponse } from "next/server";
import { getInvocation } from "@/lib/services/workshop-invocations";
import { downloadFile } from "@/lib/storage/operations";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { workshopInvocationOutputPath } from "@/lib/workshop/paths";

export const dynamic = "force-dynamic";

const MAX_PREVIEW_BYTES = 1 * 1024 * 1024; // 1MB inline

export async function GET(
	_request: Request,
	{ params }: { params: Promise<{ id: string; solutionId: string; testcaseId: string }> }
) {
	try {
		await requireWorkshopAccess();
	} catch (err) {
		return NextResponse.json(
			{ error: err instanceof Error ? err.message : "권한이 없습니다" },
			{ status: 403 }
		);
	}

	const { id, solutionId, testcaseId } = await params;
	const invocationId = Number.parseInt(id, 10);
	const solId = Number.parseInt(solutionId, 10);
	const tcId = Number.parseInt(testcaseId, 10);
	if (!Number.isFinite(invocationId) || !Number.isFinite(solId) || !Number.isFinite(tcId)) {
		return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
	}

	const invocation = await getInvocation(invocationId);
	if (!invocation) {
		return NextResponse.json({ error: "인보케이션을 찾을 수 없습니다" }, { status: 404 });
	}

	const path = workshopInvocationOutputPath(
		invocation.workshopProblemId,
		invocationId,
		solId,
		tcId
	);
	try {
		const buf = await downloadFile(path);
		if (buf.byteLength > MAX_PREVIEW_BYTES) {
			return NextResponse.json({
				truncated: true,
				size: buf.byteLength,
				text: buf.subarray(0, MAX_PREVIEW_BYTES).toString("utf-8"),
			});
		}
		return NextResponse.json({
			truncated: false,
			size: buf.byteLength,
			text: buf.toString("utf-8"),
		});
	} catch (err) {
		// MinIO 404 -- no output was uploaded for this cell (probably crashed before stdout)
		return NextResponse.json(
			{ error: "출력이 저장되지 않았습니다", message: err instanceof Error ? err.message : "" },
			{ status: 404 }
		);
	}
}
