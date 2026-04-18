"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
	addProblemsToSourceAction,
	createSourceAndAttachContestAction,
	setContestSourceAction,
} from "@/actions/sources/linking";
import {
	SourceTreeSelect,
	useAdminSourceTreeSelectFetchers,
} from "@/components/sources/source-tree-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listContestProblemsAction } from "./contest-sources-fetch";

interface Props {
	contestId: number;
	initialSourceId: number | null;
}

export function ContestSourcesSection({ contestId, initialSourceId }: Props) {
	const fetchers = useAdminSourceTreeSelectFetchers();
	const [sourceId, setSourceId] = useState<number | null>(initialSourceId);
	const [quickOpen, setQuickOpen] = useState(false);
	const [bulkLoading, setBulkLoading] = useState(false);

	const onSelectSource = async (id: number | null) => {
		setSourceId(id);
		try {
			await setContestSourceAction(contestId, id);
			toast.success(id === null ? "출처 연결 해제" : "출처 연결");
		} catch (e) {
			toast.error((e as Error).message);
		}
	};

	const bulkAddToContestProblems = async () => {
		if (sourceId === null) return;
		setBulkLoading(true);
		try {
			const rows = await listContestProblemsAction(contestId);
			if (rows.length === 0) {
				toast.info("대회에 문제가 없습니다");
				return;
			}
			// 대회의 라벨(A/B/..) 을 그대로 출처 내 문제 번호로 전달해 순서를 유지한다.
			const res = await addProblemsToSourceAction(
				sourceId,
				rows.map((r) => ({ problemId: r.problemId, problemNumber: r.label }))
			);
			toast.success(`${res.inserted}개 문제에 출처/번호 반영`);
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setBulkLoading(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>출처 관리</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				<div>
					<Label>출처 노드 연결</Label>
					<div className="flex gap-2 items-center mt-1">
						<SourceTreeSelect
							mode="single"
							value={sourceId}
							onChange={onSelectSource}
							{...fetchers}
						/>
						<Button variant="outline" onClick={() => setQuickOpen(true)}>
							새 노드 만들어 붙이기
						</Button>
						{sourceId !== null && (
							<Button variant="ghost" onClick={() => onSelectSource(null)}>
								해제
							</Button>
						)}
					</div>
				</div>
				{sourceId !== null && (
					<div className="space-y-1">
						<Button variant="secondary" onClick={bulkAddToContestProblems} disabled={bulkLoading}>
							{bulkLoading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}이 대회 소속 문제
							모두에 이 출처 + 번호(A/B/..) 등록
						</Button>
						<p className="text-xs text-muted-foreground">
							대회의 문제 라벨을 출처 내 문제 번호로 복사합니다. 이미 커스텀 번호가 붙어있는 문제는
							덮어쓰지 않습니다.
						</p>
					</div>
				)}
				{quickOpen && (
					<QuickCreateSourceDialog
						contestId={contestId}
						onClose={() => setQuickOpen(false)}
						onCreated={(id) => setSourceId(id)}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function QuickCreateSourceDialog({
	contestId,
	onClose,
	onCreated,
}: {
	contestId: number;
	onClose: () => void;
	onCreated: (sourceId: number) => void;
}) {
	const fetchers = useAdminSourceTreeSelectFetchers();
	const [parentId, setParentId] = useState<number | null>(null);
	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [year, setYear] = useState("");
	const [saving, setSaving] = useState(false);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>새 출처 노드 만들어 대회에 붙이기</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label>부모 노드 (선택)</Label>
						<SourceTreeSelect mode="single" value={parentId} onChange={setParentId} {...fetchers} />
					</div>
					<div>
						<Label>Slug</Label>
						<Input value={slug} onChange={(e) => setSlug(e.target.value)} />
					</div>
					<div>
						<Label>이름</Label>
						<Input value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<div>
						<Label>연도 (선택)</Label>
						<Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						취소
					</Button>
					<Button
						disabled={saving}
						onClick={async () => {
							setSaving(true);
							try {
								const row = await createSourceAndAttachContestAction(contestId, {
									parentId,
									slug,
									name,
									year: year ? Number.parseInt(year, 10) : null,
								});
								onCreated(row.id);
								onClose();
								toast.success("생성 후 연결 완료");
							} catch (e) {
								toast.error((e as Error).message);
							} finally {
								setSaving(false);
							}
						}}
					>
						생성 후 연결
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
