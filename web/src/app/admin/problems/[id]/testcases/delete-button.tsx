"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteTestcase } from "@/actions/admin";
import { Button } from "@/components/ui/button";

interface DeleteTestcaseButtonProps {
	testcaseId: number;
	problemId: number;
}

export function DeleteTestcaseButton({ testcaseId, problemId }: DeleteTestcaseButtonProps) {
	const [isDeleting, setIsDeleting] = useState(false);

	const handleDelete = async () => {
		setIsDeleting(true);
		try {
			await deleteTestcase(testcaseId, problemId);
		} catch (error) {
			console.error("Delete error:", error);
		} finally {
			setIsDeleting(false);
		}
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			className="text-destructive hover:text-destructive"
			onClick={handleDelete}
			disabled={isDeleting}
		>
			{isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
		</Button>
	);
}
