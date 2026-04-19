"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { searchUsersForStaff } from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserSearchDialog, type UserSearchResult } from "@/components/user-search-dialog";

export type StaffUser = { id: number; username: string; name: string };

interface Props {
	authors: StaffUser[];
	reviewers: StaffUser[];
	onChange: (next: { authors: StaffUser[]; reviewers: StaffUser[] }) => void;
	disabled?: boolean;
}

export function PendingStaffPicker({ authors, reviewers, onChange, disabled }: Props) {
	const addAuthor = (user: UserSearchResult) => {
		if (authors.some((u) => u.id === user.id)) return;
		onChange({ authors: [...authors, user], reviewers });
	};
	const removeAuthor = (id: number) => {
		onChange({ authors: authors.filter((u) => u.id !== id), reviewers });
	};
	const addReviewer = (user: UserSearchResult) => {
		if (reviewers.some((u) => u.id === user.id)) return;
		onChange({ authors, reviewers: [...reviewers, user] });
	};
	const removeReviewer = (id: number) => {
		onChange({ authors, reviewers: reviewers.filter((u) => u.id !== id) });
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>출제자 / 검수자</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
					<PendingStaffList
						label="출제자"
						staff={authors}
						onAdd={addAuthor}
						onRemove={removeAuthor}
						disabled={disabled}
					/>
					<PendingStaffList
						label="검수자"
						staff={reviewers}
						onAdd={addReviewer}
						onRemove={removeReviewer}
						disabled={disabled}
					/>
				</div>
			</CardContent>
		</Card>
	);
}

interface PendingStaffListProps {
	label: string;
	staff: StaffUser[];
	onAdd: (user: UserSearchResult) => void;
	onRemove: (id: number) => void;
	disabled?: boolean;
}

function PendingStaffList({ label, staff, onAdd, onRemove, disabled }: PendingStaffListProps) {
	const [dialogOpen, setDialogOpen] = useState(false);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>{label}</Label>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={() => setDialogOpen(true)}
					disabled={disabled}
				>
					<Plus className="mr-1 h-3 w-3" />
					{label} 추가
				</Button>
			</div>

			<div className="flex flex-wrap gap-2 min-h-[2.25rem]">
				{staff.length === 0 && (
					<span className="text-sm text-muted-foreground">등록된 {label}가 없습니다.</span>
				)}
				{staff.map((u) => (
					<span
						key={u.id}
						className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-sm"
					>
						<span className="font-medium">{u.username}</span>
						<span className="text-muted-foreground">({u.name})</span>
						<button
							type="button"
							onClick={() => onRemove(u.id)}
							disabled={disabled}
							className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
							aria-label="삭제"
						>
							<X className="h-3 w-3" />
						</button>
					</span>
				))}
			</div>

			<UserSearchDialog
				open={dialogOpen}
				onOpenChange={setDialogOpen}
				title={`${label} 추가`}
				description={`${label}로 등록할 사용자를 검색하세요.`}
				searchAction={searchUsersForStaff}
				onSelect={onAdd}
				excludeIds={staff.map((s) => s.id)}
				closeOnSelect={false}
			/>
		</div>
	);
}
