"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { setProblemSourcesAction } from "@/actions/sources/linking";
import {
	SourceTreeSelect,
	useAdminSourceTreeSelectFetchers,
} from "@/components/sources/source-tree-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getProblemSourcesAction } from "./problem-sources-fetch";

interface Props {
	problemId: number;
}

export function ProblemSourcesSection({ problemId }: Props) {
	const fetchers = useAdminSourceTreeSelectFetchers();
	const [sourceIds, setSourceIds] = useState<number[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	const refresh = useCallback(async () => {
		const rows = await getProblemSourcesAction(problemId);
		setSourceIds(rows.map((r) => r.sourceId));
		setLoading(false);
	}, [problemId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	const save = async () => {
		setSaving(true);
		try {
			await setProblemSourcesAction(problemId, sourceIds);
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
						<SourceTreeSelect
							mode="multi"
							value={sourceIds}
							onChange={setSourceIds}
							{...fetchers}
						/>
						<Button onClick={save} disabled={saving}>
							{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
							저장
						</Button>
					</>
				)}
			</CardContent>
		</Card>
	);
}
