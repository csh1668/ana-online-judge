import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DeviceForm } from "./device-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
	title: "앱 연결 승인",
	description: "외부 앱을 AOJ 계정에 연결합니다.",
};

type SearchParams = Promise<{ user_code?: string }>;

export default async function OAuthDevicePage({ searchParams }: { searchParams: SearchParams }) {
	const session = await auth();
	if (!session?.user?.id) {
		redirect(`/login?callbackUrl=${encodeURIComponent("/oauth/device")}`);
	}

	const params = await searchParams;
	const initialUserCode = (params.user_code ?? "").toUpperCase();

	const displayName = session.user.username ?? session.user.name ?? "사용자";

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
			<DeviceForm initialUserCode={initialUserCode} username={displayName} />
		</div>
	);
}
