"use client";

import { Loader2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { setProblemSourcesAction } from "@/actions/sources/linking";
import {
	SourceTreeSelect,
	useAdminSourceTreeSelectFetchers,
} from "@/components/sources/source-tree-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getProblemSourcesAction, getSourceBreadcrumbAction } from "./problem-sources-fetch";

interface Props {
	problemId: number;
}

interface Entry {
	sourceId: number;
	problemNumber: string;
	chain: { id: number; name: string; slug: string }[];
}

export function ProblemSourcesSection({ problemId }: Props) {
	const fetchers = useAdminSourceTreeSelectFetchers();
	const [entries, setEntries] = useState<Entry[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [pickerSourceId, setPickerSourceId] = useState<number | null>(null);
	const [addingBreadcrumb, setAddingBreadcrumb] = useState(false);

	const refresh = useCallback(async () => {
		const rows = await getProblemSourcesAction(problemId);
		setEntries(
			rows.map((r) => ({
				sourceId: r.sourceId,
				problemNumber: r.problemNumber ?? "",
				chain: r.chain,
			}))
		);
		setLoading(false);
	}, [problemId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const handleAddSource = async (id: number | null) => {
		setPickerSourceId(null);
		if (id === null) return;
		if (entries.some((e) => e.sourceId === id)) {
			toast.info("이미 추가된 출처입니다");
			return;
		}
		setAddingBreadcrumb(true);
		try {
			const chain = await getSourceBreadcrumbAction(id);
			setEntries((prev) => [...prev, { sourceId: id, problemNumber: "", chain }]);
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setAddingBreadcrumb(false);
		}
	};

	const updateNumber = (sourceId: number, value: string) => {
		setEntries((prev) =>
			prev.map((e) => (e.sourceId === sourceId ? { ...e, problemNumber: value } : e))
		);
	};

	const removeEntry = (sourceId: number) => {
		setEntries((prev) => prev.filter((e) => e.sourceId !== sourceId));
	};

	const save = async () => {
		setSaving(true);
		try {
			await setProblemSourcesAction(
				problemId,
				entries.map((e) => ({
					sourceId: e.sourceId,
					problemNumber: e.problemNumber.trim() === "" ? null : e.problemNumber.trim(),
				}))
			);
			toast.success("출처 저장 완료");
		} catch (e) {
			toast.error((e as Error).message);
		} finally {
			setSaving(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>출처</CardTitle>
			</CardHeader>
			<CardContent className="space-y-3">
				{loading ? (
					<div className="flex items-center gap-2 text-sm text-muted-foreground">
						<Loader2 className="h-4 w-4 animate-spin" /> 로딩 중
					</div>
				) : (
					<>
						{entries.length === 0 ? (
							<p className="text-sm text-muted-foreground">연결된 출처가 없습니다.</p>
						) : (
							<div className="space-y-2">
								{entries.map((e) => {
									const path = e.chain.map((c) => c.name).join(" › ");
									return (
										<div key={e.sourceId} className="flex items-center gap-2 rounded-md border p-2">
											<div className="flex-1 min-w-0">
												<div className="truncate text-sm font-medium">{path}</div>
												<div className="text-xs text-muted-foreground">#{e.sourceId}</div>
											</div>
											<Input
												value={e.problemNumber}
												onChange={(ev) => updateNumber(e.sourceId, ev.target.value)}
												placeholder="문제 번호 (예: A, B1, K-123)"
												className="w-48"
											/>
											<Button
												variant="ghost"
												size="icon"
												onClick={() => removeEntry(e.sourceId)}
												aria-label="출처 제거"
											>
												<X className="h-4 w-4" />
											</Button>
										</div>
									);
								})}
							</div>
						)}
						<div className="flex items-center gap-2">
							<SourceTreeSelect
								mode="single"
								value={pickerSourceId}
								onChange={handleAddSource}
								placeholder="출처 추가"
								{...fetchers}
							/>
							{addingBreadcrumb && <Loader2 className="h-4 w-4 animate-spin" />}
							<div className="flex-1" />
							<Button onClick={save} disabled={saving}>
								{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
								저장
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
