import { NextResponse } from "next/server";
import { requireApiKey } from "./api-auth";
import { type Endpoint, endpoints, NotFoundError } from "./api-registry";

/** Match a path pattern (e.g., "problems/:id/testcases") against URL segments */
function matchPath(pattern: string, segments: string[]): Record<string, string> | null {
	const parts = pattern.split("/");
	if (parts.length !== segments.length) return null;

	const params: Record<string, string> = {};
	for (let i = 0; i < parts.length; i++) {
		if (parts[i].startsWith(":")) {
			params[parts[i].slice(1)] = segments[i];
		} else if (parts[i] !== segments[i]) {
			return null;
		}
	}
	return params;
}

/** Parse query params from URL using search params */
function parseSearchParams(url: string): Record<string, string> {
	const { searchParams } = new URL(url);
	const result: Record<string, string> = {};
	searchParams.forEach((value, key) => {
		result[key] = value;
	});
	return result;
}

/** Find matching endpoint and extract path params */
function findEndpoint(
	method: string,
	segments: string[]
): { endpoint: Endpoint; pathParams: Record<string, string> } | null {
	for (const endpoint of endpoints) {
		if (endpoint.method !== method) continue;
		const pathParams = matchPath(endpoint.path, segments);
		if (pathParams) return { endpoint, pathParams };
	}
	return null;
}

/** Handle an API request by routing through the registry */
export async function handleApiRequest(request: Request, segments: string[]): Promise<Response> {
	// Auth check
	const authError = await requireApiKey(request);
	if (authError) return authError;

	const method = request.method;
	const match = findEndpoint(method, segments);

	if (!match) {
		return NextResponse.json(
			{ error: `No endpoint found: ${method} ${segments.join("/")}` },
			{ status: 404 }
		);
	}

	const { endpoint, pathParams } = match;

	try {
		// Custom handler — gets the raw Request
		if (endpoint.type === "custom") {
			return await endpoint.handler(request, pathParams);
		}

		// JSON handler — parse query/body with Zod, call handler, return JSON
		const rawQuery = parseSearchParams(request.url);
		const query = endpoint.query ? endpoint.query.parse(rawQuery) : {};

		let body = {};
		if ((method === "POST" || method === "PUT") && endpoint.body) {
			const rawBody = await request.json().catch(() => ({}));
			body = endpoint.body.parse(rawBody);
		}

		const result = await endpoint.handler({ pathParams, query, body });
		return NextResponse.json(result);
	} catch (error) {
		if (error instanceof NotFoundError) {
			return NextResponse.json({ error: error.message }, { status: 404 });
		}
		// Zod validation errors
		if (error && typeof error === "object" && "issues" in error) {
			return NextResponse.json(
				{ error: "Validation error", details: (error as { issues: unknown }).issues },
				{ status: 400 }
			);
		}
		const message = error instanceof Error ? error.message : String(error);
		return NextResponse.json({ error: message }, { status: 400 });
	}
}
