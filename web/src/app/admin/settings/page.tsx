import type { Metadata } from "next";
import {
	getGoogleRegistrationStatus,
	getRegistrationStatus,
	getSiteSetting,
} from "@/actions/settings";
import { PageBreadcrumb } from "@/components/layout/page-breadcrumb";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { ApiKeyManager } from "./api-key-manager";
import { GoogleRegistrationToggle } from "./google-registration-toggle";
import { RecomputeRatingsButton } from "./recompute-ratings-button";
import { RegistrationToggle } from "./registration-toggle";

export const metadata: Metadata = {
	title: "사이트 설정",
};

export default async function AdminSettingsPage() {
	const [registrationOpen, googleRegistrationOpen, apiKey] = await Promise.all([
		getRegistrationStatus(),
		getGoogleRegistrationStatus(),
		getSiteSetting("admin_api_key"),
	]);

	const hasGoogleOAuth = !!(serverEnv.GOOGLE_CLIENT_ID && serverEnv.GOOGLE_CLIENT_SECRET);

	return (
		<div className="space-y-6">
			<PageBreadcrumb items={[{ label: "관리자", href: "/admin" }, { label: "설정" }]} />
			<div>
				<h1 className="text-3xl font-bold">사이트 설정</h1>
				<p className="text-muted-foreground mt-2">사이트 전반적인 설정을 관리합니다.</p>
			</div>

			<div className="grid gap-6">
				<Card>
					<CardHeader>
						<CardTitle>회원가입 설정</CardTitle>
						<CardDescription>새로운 사용자의 회원가입 허용 여부를 설정합니다.</CardDescription>
					</CardHeader>
					<CardContent className="space-y-6">
						<RegistrationToggle initialEnabled={registrationOpen} />
						{hasGoogleOAuth && (
							<>
								<div className="border-t" />
								<GoogleRegistrationToggle initialEnabled={googleRegistrationOpen} />
							</>
						)}
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>API Key</CardTitle>
						<CardDescription>
							CLI 도구에서 관리자 API에 접근할 때 사용하는 인증 키입니다.
						</CardDescription>
					</CardHeader>
					<CardContent>
						<ApiKeyManager initialKey={apiKey} />
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle>유지보수 액션</CardTitle>
						<CardDescription>
							재배포·프로세스 재시작 등으로 in-process 큐 작업이 유실됐을 때 사용하는 일괄 재계산
							복구 액션입니다.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-col gap-2">
						<RecomputeRatingsButton />
						<p className="text-xs text-muted-foreground">
							문제 티어 재계산은 의견이 1개 이상인 모든 문제에 대해 수행되며, 티어가 실제로 바뀐
							문제는 영향 사용자들의 레이팅 재계산까지 자동으로 트리거됩니다. 큐로 백그라운드
							처리되어 즉시 반영되지 않을 수 있습니다.
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
