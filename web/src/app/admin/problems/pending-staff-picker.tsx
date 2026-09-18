"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";
import { searchUsersForStaff } from "@/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserSearchDialog, type UserSearchResult } from "@/components/user-search-dialog";

export type StaffUser =
	| { kind: "user"; id: number; username: string; name: string }
	| { kind: "external"; name: string };

function entryKey(s: StaffUser) {
	return s.kind === "user" ? `user:${s.id}` : `external:${s.name}`;
}

interface Props {
	authors: StaffUser[];
	reviewers: StaffUser[];
	onChange: (next: { authors: StaffUser[]; reviewers: StaffUser[] }) => void;
	disabled?: boolean;
}

export function PendingStaffPicker({ authors, reviewers, onChange, disabled }: Props) {
	const addAuthor = (s: StaffUser) => {
		if (authors.some((u) => entryKey(u) === entryKey(s))) return;
		onChange({ authors: [...authors, s], reviewers });
	};
	const removeAuthor = (key: string) => {
		onChange({ authors: authors.filter((u) => entryKey(u) !== key), reviewers });
	};
	const addReviewer = (s: StaffUser) => {
		if (reviewers.some((u) => entryKey(u) === entryKey(s))) return;
		onChange({ authors, reviewers: [...reviewers, s] });
	};
	const removeReviewer = (key: string) => {
		onChange({ authors, reviewers: reviewers.filter((u) => entryKey(u) !== key) });
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
	onAdd: (s: StaffUser) => void;
	onRemove: (key: string) => void;
	disabled?: boolean;
}

function PendingStaffList({ label, staff, onAdd, onRemove, disabled }: PendingStaffListProps) {
	const [userDialogOpen, setUserDialogOpen] = useState(false);
	const [externalDialogOpen, setExternalDialogOpen] = useState(false);

	const handleAddUser = (user: UserSearchResult) => {
		onAdd({ kind: "user", id: user.id, username: user.username, name: user.name });
	};
	const handleAddExternal = (name: string) => {
		onAdd({ kind: "external", name });
	};

	const excludeUserIds = staff
		.filter((s): s is Extract<StaffUser, { kind: "user" }> => s.kind === "user")
		.map((s) => s.id);
	const existingExternalNames = staff
		.filter((s): s is Extract<StaffUser, { kind: "external" }> => s.kind === "external")
		.map((s) => s.name);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>{label}</Label>
				<div className="flex gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setUserDialogOpen(true)}
						disabled={disabled}
					>
						<Plus className="mr-1 h-3 w-3" />
						사용자
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setExternalDialogOpen(true)}
						disabled={disabled}
					>
						<Plus className="mr-1 h-3 w-3" />
						외부 인사
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 min-h-[2.25rem]">
				{staff.length === 0 && (
					<span className="text-sm text-muted-foreground">등록된 {label}가 없습니다.</span>
				)}
				{staff.map((s) => {
					const key = entryKey(s);
					return (
						<Badge key={key} variant="secondary" className="gap-1.5 px-3 py-1 text-sm font-normal">
							{s.kind === "user" ? (
								<>
									<span className="font-medium">{s.username}</span>
									<span className="text-muted-foreground">({s.name})</span>
								</>
							) : (
								<>
									<span className="font-medium">{s.name}</span>
									<span className="text-muted-foreground">(외부)</span>
								</>
							)}
							<button
								type="button"
								onClick={() => onRemove(key)}
								disabled={disabled}
								className="ml-1 rounded-[2px] p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
								aria-label="삭제"
							>
								<X className="h-3 w-3" />
							</button>
						</Badge>
					);
				})}
			</div>

			<UserSearchDialog
				open={userDialogOpen}
				onOpenChange={setUserDialogOpen}
				title={`${label} 추가`}
				description={`${label}로 등록할 사용자를 검색하세요.`}
				searchAction={searchUsersForStaff}
				onSelect={handleAddUser}
				excludeIds={excludeUserIds}
				closeOnSelect={false}
			/>

			<ExternalStaffDialog
				open={externalDialogOpen}
				onOpenChange={setExternalDialogOpen}
				label={label}
				existingNames={existingExternalNames}
				onAdd={handleAddExternal}
			/>
		</div>
	);
}

interface ExternalStaffDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	label: string;
	existingNames: string[];
	onAdd: (name: string) => void;
}

function ExternalStaffDialog({
	open,
	onOpenChange,
	label,
	existingNames,
	onAdd,
}: ExternalStaffDialogProps) {
	const [name, setName] = useState("");
	const [error, setError] = useState<string | null>(null);

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		const trimmed = name.trim();
		if (trimmed.length === 0) {
			setError("이름을 입력하세요.");
			return;
		}
		if (existingNames.includes(trimmed)) {
			setError("이미 등록된 외부 인사입니다.");
			return;
		}
		onAdd(trimmed);
		setName("");
		setError(null);
		onOpenChange(false);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(o) => {
				if (!o) {
					setName("");
					setError(null);
				}
				onOpenChange(o);
			}}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>외부 {label} 추가</DialogTitle>
					<DialogDescription>
						사이트에 가입하지 않은 외부 {label}의 표시 이름을 입력하세요.
					</DialogDescription>
				</DialogHeader>
				<form onSubmit={handleSubmit} className="space-y-3">
					<div className="space-y-2">
						<Label htmlFor="external-staff-name">이름</Label>
						<Input
							id="external-staff-name"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setError(null);
							}}
							placeholder="예: 홍길동"
							autoFocus
						/>
						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
							취소
						</Button>
						<Button type="submit">추가</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
