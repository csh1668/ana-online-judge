"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
	addProblemStaff,
	getProblemStaff,
	removeProblemStaff,
	searchUsersForStaff,
} from "@/actions/admin";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { UserSearchDialog, type UserSearchResult } from "@/components/user-search-dialog";

type StaffRole = "author" | "reviewer";
type StaffUser = { id: number; username: string; name: string };

interface Props {
	problemId: number;
}

export function ProblemStaffSection({ problemId }: Props) {
	const [authors, setAuthors] = useState<StaffUser[]>([]);
	const [reviewers, setReviewers] = useState<StaffUser[]>([]);
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
	staff: StaffUser[];
	onChange: () => void | Promise<void>;
}

function StaffList({ staffRole, label, problemId, staff, onChange }: StaffListProps) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	const handleAdd = async (user: UserSearchResult) => {
		await addProblemStaff(problemId, user.id, staffRole);
		await onChange();
	};

	const handleRemove = (userId: number) => {
		startTransition(async () => {
			await removeProblemStaff(problemId, userId, staffRole);
			await onChange();
		});
	};

	return (
		<div className="space-y-3">
			<div className="flex items-center justify-between">
				<Label>{label}</Label>
				<Button type="button" size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
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
							onClick={() => handleRemove(u.id)}
							disabled={isPending}
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
				onSelect={handleAdd}
				excludeIds={staff.map((s) => s.id)}
				closeOnSelect={false}
			/>
		</div>
	);
}
