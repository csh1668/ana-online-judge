import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = {
	title: "비밀번호 재설정",
};

export default async function ResetPasswordPage() {
	const session = await auth();
	if (!session?.user) {
		redirect("/login");
	}
	if (!session.user.mustChangePassword) {
		redirect("/");
	}

	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
			<ResetPasswordForm username={session.user.username} />
		</div>
	);
}
