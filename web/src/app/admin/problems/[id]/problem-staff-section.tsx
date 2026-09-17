"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
	addProblemStaff,
	getProblemStaff,
	removeProblemStaff,
	searchUsersForStaff,
} from "@/actions/admin";
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

type StaffRole = "author" | "reviewer";
type StaffEntry = {
	id: number;
	userId: number | null;
	username: string | null;
	name: string;
	externalName: string | null;
};

interface Props {
	problemId: number;
}

export function ProblemStaffSection({ problemId }: Props) {
	const [authors, setAuthors] = useState<StaffEntry[]>([]);
	const [reviewers, setReviewers] = useState<StaffEntry[]>([]);
	const [loading, setLoading] = useState(true);

	const refresh = useCallback(async () => {
		const data = await getProblemStaff(problemId);
		setAuthors(data.authors);
		setReviewers(data.reviewers);
	}, [problemId]);

	useEffect(() => {
		refresh().finally(() => setLoading(false));
	}, [refresh]);

	return (
		<Card>
			<CardHeader>
				<CardTitle>출제자 / 검수자</CardTitle>
			</CardHeader>
			<CardContent>
				{loading ? (
					<div className="flex items-center justify-center py-6 text-muted-foreground">
						<Loader2 className="mr-2 h-4 w-4 animate-spin" /> 불러오는 중...
					</div>
				) : (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
						<StaffList
							staffRole="author"
							label="출제자"
							problemId={problemId}
							staff={authors}
							onChange={refresh}
						/>
						<StaffList
							staffRole="reviewer"
							label="검수자"
							problemId={problemId}
							staff={reviewers}
							onChange={refresh}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

interface StaffListProps {
	staffRole: StaffRole;
	label: string;
	problemId: number;
	staff: StaffEntry[];
	onChange: () => void | Promise<void>;
}

function StaffList({ staffRole, label, problemId, staff, onChange }: StaffListProps) {
	const [userDialogOpen, setUserDialogOpen] = useState(false);
	const [externalDialogOpen, setExternalDialogOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const handleAddUser = async (user: UserSearchResult) => {
		await addProblemStaff(problemId, staffRole, { userId: user.id });
		await onChange();
	};
	const handleAddExternal = async (name: string) => {
		await addProblemStaff(problemId, staffRole, { externalName: name });
		await onChange();
	};

	const handleRemove = (staffId: number) => {
		startTransition(async () => {
			await removeProblemStaff(problemId, staffRole, staffId);
			await onChange();
		});
	};

	const excludeUserIds = staff.filter((s) => s.userId != null).map((s) => s.userId as number);
	const existingExternalNames = staff
		.filter((s) => s.externalName != null)
		.map((s) => s.externalName as string);

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>{label}</Label>
				<div className="flex gap-2">
					<Button type="button" size="sm" variant="outline" onClick={() => setUserDialogOpen(true)}>
						<Plus className="mr-1 h-3 w-3" />
						사용자
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={() => setExternalDialogOpen(true)}
					>
						<Plus className="mr-1 h-3 w-3" />
						외부 인사
					</Button>
				</div>
			</div>

			<div className="flex flex-wrap gap-2 min-h-9">
				{staff.length === 0 && (
					<span className="text-sm text-muted-foreground">등록된 {label}가 없습니다.</span>
				)}
				{staff.map((s) => (
					<Badge key={s.id} variant="secondary" className="gap-1.5 px-3 py-1 text-sm font-normal">
						{s.userId != null ? (
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
							onClick={() => handleRemove(s.id)}
							disabled={isPending}
							className="ml-1 rounded-[2px] p-0.5 hover:bg-muted-foreground/20 disabled:opacity-50"
							aria-label="삭제"
						>
							<X className="h-3 w-3" />
						</button>
					</Badge>
				))}
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
	onAdd: (name: string) => void | Promise<void>;
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
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
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
		setSubmitting(true);
		try {
			await onAdd(trimmed);
			setName("");
			setError(null);
			onOpenChange(false);
		} catch (err) {
			setError(err instanceof Error ? err.message : "추가 중 오류가 발생했습니다.");
		} finally {
			setSubmitting(false);
		}
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
						<Label htmlFor="problem-external-staff-name">이름</Label>
						<Input
							id="problem-external-staff-name"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setError(null);
							}}
							placeholder="예: 홍길동"
							autoFocus
							disabled={submitting}
						/>
						{error && <p className="text-sm text-destructive">{error}</p>}
					</div>
					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={submitting}
						>
							취소
						</Button>
						<Button type="submit" disabled={submitting}>
							{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							추가
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
