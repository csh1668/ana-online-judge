import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function middleware(request: NextRequest) {
	const session = await auth();

	// If user is not logged in, allow normal flow
	if (!session?.user) {
		return NextResponse.next();
	}

	// If user is not a contest-only account, allow normal flow
	if (!session.user.contestAccountOnly) {
		return NextResponse.next();
	}

	// Contest-only account restrictions
	const { pathname } = request.nextUrl;

	// Allowed paths for contest-only accounts
	const allowedPaths = [
		"/logout",
		"/api/auth", // NextAuth routes
		"/api/submissions/", // Submission status and stream endpoints for live updates
	];

	// Check if path is allowed
	if (allowedPaths.some((path) => pathname.startsWith(path))) {
		return NextResponse.next();
	}

	// Allow access to the contest they're assigned to
	if (session.user.contestId) {
		const contestPath = `/contests/${session.user.contestId}`;
		if (pathname.startsWith(contestPath)) {
			return NextResponse.next();
		}
	}

	// Allow access to submissions pages (their own)
	if (pathname.startsWith("/submissions/")) {
		return NextResponse.next();
	}

	// Redirect to their contest page
	if (session.user.contestId) {
		return NextResponse.redirect(new URL(`/contests/${session.user.contestId}`, request.url));
	}

	// If no contest assigned, redirect to login (shouldn't happen)
	return NextResponse.redirect(new URL("/login", request.url));
}

// Configure which routes to run middleware on
export const config = {
	matcher: [
		/*
		 * Match all request paths except for the ones starting with:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 * - public files
		 */
		"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
	],
};
