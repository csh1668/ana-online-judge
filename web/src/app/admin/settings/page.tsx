import type { Metadata } from "next";
import {
	getGoogleRegistrationStatus,
	getRegistrationStatus,
	getSiteSetting,
} from "@/actions/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { serverEnv } from "@/lib/env";
import { ApiKeyManager } from "./api-key-manager";
import { GoogleRegistrationToggle } from "./google-registration-toggle";
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
			</div>
		</div>
	);
}
