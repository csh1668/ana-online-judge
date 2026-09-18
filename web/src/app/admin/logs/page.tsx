import { ScrollText } from "lucide-react";
import { isProxyConfigured } from "@/actions/admin/logs";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { LogViewer } from "./_components/log-viewer";

export const dynamic = "force-dynamic";

export default async function AdminLogsPage() {
	const proxyOn = await isProxyConfigured();

	return (
		<PageShell
			width="fluid"
			breadcrumb={[{ label: "관리자", href: "/admin" }, { label: "서버 로그" }]}
		>
			<Card>
				<PageHeader
					title="서버 로그"
					meta={<ScrollText className="h-5 w-5 text-muted-foreground" />}
				/>
				<CardContent>
					{proxyOn ? (
						<LogViewer />
					) : (
						<div className="rounded-[2px] border border-border bg-card p-6">
							<h2 className="font-semibold mb-2">이 환경에서는 사용할 수 없습니다</h2>
							<p className="text-sm text-muted-foreground leading-relaxed">
								<code className="rounded-[2px] bg-muted px-1 py-0.5">DOCKER_PROXY_URL</code>{" "}
								환경변수가 설정되어 있지 않습니다. 본 기능은 docker-compose의 prod 프로파일에서
								socket-proxy 사이드카와 함께 동작하며, 로컬 dev 환경(웹이 호스트에서 직접 실행되는
								경우)에서는 의도적으로 비활성화되어 있습니다.
							</p>
						</div>
					)}
				</CardContent>
			</Card>
		</PageShell>
	);
}
