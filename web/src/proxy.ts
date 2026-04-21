import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function proxy(request: NextRequest) {
	const session = await auth();
	const { pathname } = request.nextUrl;

	// Add pathname to headers for use in layouts
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-pathname", pathname);

	// If user is not logged in, allow normal flow
	if (!session?.user) {
		return NextResponse.next({
			request: {
				headers: requestHeaders,
			},
		});
	}

	// Force password reset if flagged
	if (session.user.mustChangePassword) {
		const allowed = ["/reset-password", "/logout", "/api/auth"];
		const isAllowed = allowed.some((p) => pathname.startsWith(p));
		if (!isAllowed) {
			return NextResponse.redirect(new URL("/reset-password", request.url));
		}
		return NextResponse.next({
			request: {
				headers: requestHeaders,
			},
		});
	}

	// If user is not a contest-only account, allow normal flow
	if (!session.user.contestAccountOnly) {
		return NextResponse.next({
			request: {
				headers: requestHeaders,
			},
		});
	}

	// Contest-only account restrictions

	// Allowed paths for contest-only accounts
	const allowedPaths = [
		"/logout",
		"/api/auth", // NextAuth routes
		"/api/submissions/", // Submission status and stream endpoints for live updates
	];

	// Check if path is allowed
	if (allowedPaths.some((path) => pathname.startsWith(path))) {
		return NextResponse.next({
			request: {
				headers: requestHeaders,
			},
		});
	}

	// Allow access to the contest they're assigned to
	if (session.user.contestId) {
		const contestPath = `/contests/${session.user.contestId}`;
		if (pathname.startsWith(contestPath)) {
			return NextResponse.next({
				request: {
					headers: requestHeaders,
				},
			});
		}
	}

	// Allow access to submissions pages (their own)
	if (pathname.startsWith("/submissions/")) {
		return NextResponse.next({
			request: {
				headers: requestHeaders,
			},
		});
	}

	// Redirect to their contest page
	if (session.user.contestId) {
		return NextResponse.redirect(new URL(`/contests/${session.user.contestId}`, request.url));
	}

	// If no contest assigned, redirect to login (shouldn't happen)
	return NextResponse.redirect(new URL("/login", request.url));
}

// Configure which routes to run proxy on
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
