"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { deletePractice } from "@/actions/practices";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export function DeletePracticeButton({
	practiceId,
	redirectTo,
}: {
	practiceId: number;
	redirectTo: string;
}) {
	const router = useRouter();
	const { toast } = useToast();
	const [pending, setPending] = useState(false);

	async function handleDelete() {
		if (!confirm("정말로 이 연습을 삭제하시겠습니까?")) return;
		setPending(true);
		try {
			await deletePractice(practiceId);
			toast({ title: "삭제됨", description: "연습이 삭제되었습니다." });
			router.push(redirectTo);
		} catch (err) {
			toast({
				title: "오류",
				description: err instanceof Error ? err.message : "삭제 중 오류가 발생했습니다",
				variant: "destructive",
			});
			setPending(false);
		}
	}

	return (
		<Button variant="destructive" onClick={handleDelete} disabled={pending}>
			<Trash2 className="mr-2 h-4 w-4" />
			{pending ? "삭제 중..." : "삭제"}
		</Button>
	);
}
