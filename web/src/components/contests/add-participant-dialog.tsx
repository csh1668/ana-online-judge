"use client";

import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addParticipantToContest, searchUsers } from "@/actions/contests";
import { Button } from "@/components/ui/button";
import { UserSearchDialog, type UserSearchResult } from "@/components/user-search-dialog";

interface AddParticipantDialogProps {
	contestId: number;
}

export function AddParticipantDialog({ contestId }: AddParticipantDialogProps) {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	const handleAdd = async (user: UserSearchResult) => {
		await addParticipantToContest(contestId, user.id);
		router.refresh();
	};

	return (
		<>
			<Button onClick={() => setOpen(true)}>
				<UserPlus className="mr-2 h-4 w-4" />
				참가자 추가
			</Button>
			<UserSearchDialog
				open={open}
				onOpenChange={setOpen}
				title="참가자 추가"
				description="사용자 아이디나 이름을 검색하여 참가자를 추가하세요."
				searchAction={searchUsers}
				onSelect={handleAdd}
				closeOnSelect={false}
			/>
		</>
	);
}
