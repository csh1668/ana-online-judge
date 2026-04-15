import { redirect } from "next/navigation";
import { requireWorkshopAccess } from "@/lib/workshop/auth";
import { NewWorkshopProblemForm } from "./new-form";

export default async function NewWorkshopProblemPage() {
	try {
		await requireWorkshopAccess();
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		redirect("/workshop");
	}

	return (
		<div className="container mx-auto p-6 max-w-xl">
			<h1 className="text-2xl font-bold mb-6">새 창작마당 문제</h1>
			<NewWorkshopProblemForm />
		</div>
	);
}
