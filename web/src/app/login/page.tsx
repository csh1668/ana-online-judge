import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "@/components/auth/login-form";
import { isRegistrationOpen } from "@/lib/auth-utils";

export const metadata: Metadata = {
	title: "로그인",
	description: "AOJ에 로그인하세요",
};

export default async function LoginPage() {
	const session = await auth();

	if (session) {
		redirect("/");
	}

	const registrationOpen = await isRegistrationOpen();

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
			<LoginForm registrationOpen={registrationOpen} />
		</div>
	);
}
