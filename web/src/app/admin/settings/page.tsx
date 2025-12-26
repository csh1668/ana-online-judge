import type { Metadata } from "next";
import { getRegistrationStatus } from "@/actions/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RegistrationToggle } from "./registration-toggle";

export const metadata: Metadata = {
	title: "사이트 설정",
};

export default async function AdminSettingsPage() {
	const registrationOpen = await getRegistrationStatus();

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
					<CardContent>
						<RegistrationToggle initialEnabled={registrationOpen} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
