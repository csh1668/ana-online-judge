import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "@/components/auth/register-form";
import { isFirstUser, isRegistrationOpen } from "@/lib/auth-utils";

export const metadata: Metadata = {
	title: "회원가입",
	description: "AOJ에 가입하세요",
};

export default async function RegisterPage() {
	const session = await auth();

	if (session) {
		redirect("/");
	}

	const [registrationOpen, firstUser] = await Promise.all([isRegistrationOpen(), isFirstUser()]);

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
			<RegisterForm registrationOpen={registrationOpen} isFirstUser={firstUser} />
		</div>
	);
}
