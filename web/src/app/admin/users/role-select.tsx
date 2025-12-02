"use client";

import { useState } from "react";
import { updateUserRole } from "@/actions/admin";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

interface RoleSelectProps {
	userId: number;
	currentRole: string;
}

export function RoleSelect({ userId, currentRole }: RoleSelectProps) {
	const [role, setRole] = useState(currentRole);
	const [isUpdating, setIsUpdating] = useState(false);

	const handleChange = async (newRole: string) => {
		if (newRole === role) return;

		setIsUpdating(true);
		try {
			await updateUserRole(userId, newRole as "user" | "admin");
			setRole(newRole);
		} catch (error) {
			console.error("Role update error:", error);
		} finally {
			setIsUpdating(false);
		}
	};

	return (
		<Select value={role} onValueChange={handleChange} disabled={isUpdating}>
			<SelectTrigger className="w-[100px]">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				<SelectItem value="user">사용자</SelectItem>
				<SelectItem value="admin">관리자</SelectItem>
			</SelectContent>
		</Select>
	);
}




