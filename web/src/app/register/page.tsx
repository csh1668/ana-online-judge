import type { Metadata } from "next";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = {
	title: "회원가입",
	description: "AOJ에 가입하세요",
};

export default function RegisterPage() {
	return (
		<div className="flex min-h-[calc(100vh-8rem)] items-center justify-center px-4 py-12">
			<RegisterForm />
		</div>
	);
}
