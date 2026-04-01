import { handleApiRequest } from "@/lib/services/api-router";

type RouteParams = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, { params }: RouteParams) {
	const { path } = await params;
	return handleApiRequest(request, path);
}

export async function POST(request: Request, { params }: RouteParams) {
	const { path } = await params;
	return handleApiRequest(request, path);
}

export async function PUT(request: Request, { params }: RouteParams) {
	const { path } = await params;
	return handleApiRequest(request, path);
}

export async function DELETE(request: Request, { params }: RouteParams) {
	const { path } = await params;
	return handleApiRequest(request, path);
}
