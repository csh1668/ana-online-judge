import { redirect } from "next/navigation";
import { listMyDevices } from "@/actions/devices/queries";
import { auth } from "@/auth";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { DevicesTable } from "./devices-table";

export const dynamic = "force-dynamic";

export const metadata = { title: "연결된 앱 — AOJ" };

export default async function DevicesPage() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect(`/login?callbackUrl=${encodeURIComponent("/settings/devices")}`);
	}
	const tokens = await listMyDevices();
	return (
		<PageShell
			width="narrow"
			breadcrumb={[{ label: "설정", href: "/settings" }, { label: "연결된 앱" }]}
		>
			<Card>
				<PageHeader
					title="연결된 앱"
					description="외부 앱에서 발급된 API 토큰 목록입니다. 의심스러운 활동이 있으면 즉시 회수하세요."
				/>
				<CardContent>
					<DevicesTable tokens={tokens} />
				</CardContent>
			</Card>
		</PageShell>
	);
}
