import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
	getSubmitTicketTtl,
	issueSubmitTicket,
	SUBMIT_TICKET_TTL_SECONDS,
} from "@/lib/turnstile-ticket";

const issueSchema = z.object({
	token: z.string().min(1),
});

function clientIpFrom(request: Request): string | undefined {
	const forwarded = request.headers.get("x-forwarded-for");
	if (forwarded) {
		const first = forwarded.split(",")[0]?.trim();
		if (first) return first;
	}
	return request.headers.get("x-real-ip") ?? undefined;
}

export async function POST(request: Request) {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
	}

	const body = await request.json().catch(() => null);
	const parsed = issueSchema.safeParse(body);
	if (!parsed.success) {
		return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
	}

	const ok = await verifyTurnstileToken(parsed.data.token, clientIpFrom(request));
	if (!ok) {
		return NextResponse.json({ error: "CAPTCHA 검증에 실패했습니다." }, { status: 400 });
	}

	const userId = Number.parseInt(session.user.id, 10);
	const { expiresAt } = await issueSubmitTicket(userId);
	return NextResponse.json({
		ok: true,
		expiresAt,
		ttlSeconds: SUBMIT_TICKET_TTL_SECONDS,
	});
}

export async function GET() {
	const session = await auth();
	if (!session?.user?.id) {
		return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
	}
	const userId = Number.parseInt(session.user.id, 10);
	const ttl = await getSubmitTicketTtl(userId);
	return NextResponse.json({ valid: ttl > 0, ttlSeconds: ttl });
}
