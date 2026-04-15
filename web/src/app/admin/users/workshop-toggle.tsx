"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleWorkshopAccess } from "@/actions/admin";
import { Switch } from "@/components/ui/switch";

interface WorkshopToggleProps {
	userId: number;
	initialAccess: boolean;
}

export function WorkshopToggle({ userId, initialAccess }: WorkshopToggleProps) {
	const [hasAccess, setHasAccess] = useState(initialAccess);
	const [isPending, startTransition] = useTransition();

	const handleToggle = (checked: boolean) => {
		startTransition(async () => {
			try {
				await toggleWorkshopAccess(userId, checked);
				setHasAccess(checked);
				toast.success(
					checked ? "창작마당 권한이 부여되었습니다." : "창작마당 권한이 제거되었습니다."
				);
			} catch (error) {
				console.error("Workshop toggle error:", error);
				toast.error("권한 변경에 실패했습니다.");
			}
		});
	};

	return <Switch checked={hasAccess} onCheckedChange={handleToggle} disabled={isPending} />;
}
