"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	createSourceAction,
	deleteSourceAction,
	listChildrenAction,
	previewDeleteImpactAction,
	updateSourceAction,
} from "@/actions/sources";
import {
	SourceTreeSelect,
	useAdminSourceTreeSelectFetchers,
} from "@/components/sources/source-tree-select";
import { Button } from "@/components/ui/button";
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
import type { Source } from "@/db/schema";

interface Props {
	initialRoots: Source[];
}

export function SourcesTreeManager({ initialRoots }: Props) {
	const [roots, setRoots] = useState(initialRoots);
	const [childrenMap, setChildrenMap] = useState<Record<number, Source[] | undefined>>({});
	const fetchers = useAdminSourceTreeSelectFetchers();

	const [createOpen, setCreateOpen] = useState<{ parentId: number | null } | null>(null);
	const [editOpen, setEditOpen] = useState<Source | null>(null);
	const [deleteOpen, setDeleteOpen] = useState<Source | null>(null);

	const refreshRoots = async () => {
		setRoots((await listChildrenAction(null)) as Source[]);
	};

	const refreshChildren = async (parentId: number) => {
		const rows = (await listChildrenAction(parentId)) as Source[];
		setChildrenMap((m) => ({ ...m, [parentId]: rows }));
	};

	const toggleLoad = async (node: Source) => {
		if (childrenMap[node.id] === undefined) await refreshChildren(node.id);
	};

	const renderNode = (node: Source, depth: number) => {
		const children = childrenMap[node.id];
		return (
			<div key={node.id} className={depth > 0 ? "ml-4 border-l pl-2" : ""}>
				<div className="flex items-center gap-2 py-1">
					<button
						type="button"
						onClick={() => toggleLoad(node)}
						className="flex-1 text-left text-sm hover:underline"
					>
						{node.name}
						{node.year !== null && (
							<span className="ml-1 text-xs text-muted-foreground">({node.year})</span>
						)}
					</button>
					<Button size="sm" variant="ghost" onClick={() => setCreateOpen({ parentId: node.id })}>
						자식 추가
					</Button>
					<Button size="sm" variant="ghost" onClick={() => setEditOpen(node)}>
						편집
					</Button>
					<Button size="sm" variant="ghost" onClick={() => setDeleteOpen(node)}>
						삭제
					</Button>
				</div>
				{children?.map((c) => renderNode(c, depth + 1))}
			</div>
		);
	};

	return (
		<div className="space-y-4">
			<div className="flex gap-2">
				<Button onClick={() => setCreateOpen({ parentId: null })}>루트 노드 추가</Button>
			</div>
			<div className="rounded border p-4">
				{roots.length === 0 ? (
					<p className="text-sm text-muted-foreground">등록된 출처가 없습니다.</p>
				) : (
					roots.map((r) => renderNode(r, 0))
				)}
			</div>

			{createOpen && (
				<CreateDialog
					parentId={createOpen.parentId}
					onClose={() => setCreateOpen(null)}
					onCreated={async () => {
						if (createOpen.parentId === null) await refreshRoots();
						else await refreshChildren(createOpen.parentId);
					}}
				/>
			)}
			{editOpen && (
				<EditDialog
					source={editOpen}
					fetchers={fetchers}
					onClose={() => setEditOpen(null)}
					onUpdated={async () => {
						if (editOpen.parentId === null) await refreshRoots();
						else await refreshChildren(editOpen.parentId);
					}}
				/>
			)}
			{deleteOpen && (
				<DeleteDialog
					source={deleteOpen}
					onClose={() => setDeleteOpen(null)}
					onDeleted={async () => {
						if (deleteOpen.parentId === null) await refreshRoots();
						else await refreshChildren(deleteOpen.parentId);
					}}
				/>
			)}
		</div>
	);
}

function CreateDialog({
	parentId,
	onClose,
	onCreated,
}: {
	parentId: number | null;
	onClose: () => void;
	onCreated: () => Promise<void>;
}) {
	const [slug, setSlug] = useState("");
	const [name, setName] = useState("");
	const [year, setYear] = useState("");
	const [loading, setLoading] = useState(false);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>출처 노드 추가</DialogTitle>
					<DialogDescription>
						{parentId === null ? "루트 노드" : `부모 #${parentId} 아래`}에 새 노드를 추가합니다.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
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
						disabled={loading}
						onClick={async () => {
							setLoading(true);
							try {
								await createSourceAction({
									parentId,
									slug,
									name,
									year: year ? Number.parseInt(year, 10) : null,
								});
								await onCreated();
								onClose();
								toast.success("생성 완료");
							} catch (e) {
								toast.error((e as Error).message);
							} finally {
								setLoading(false);
							}
						}}
					>
						생성
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function EditDialog({
	source,
	fetchers,
	onClose,
	onUpdated,
}: {
	source: Source;
	fetchers: ReturnType<typeof useAdminSourceTreeSelectFetchers>;
	onClose: () => void;
	onUpdated: () => Promise<void>;
}) {
	const [slug, setSlug] = useState(source.slug);
	const [name, setName] = useState(source.name);
	const [year, setYear] = useState(source.year?.toString() ?? "");
	const [parentId, setParentId] = useState<number | null>(source.parentId);
	const [loading, setLoading] = useState(false);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>출처 노드 편집</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label>Slug</Label>
						<Input value={slug} onChange={(e) => setSlug(e.target.value)} />
					</div>
					<div>
						<Label>이름</Label>
						<Input value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<div>
						<Label>연도</Label>
						<Input type="number" value={year} onChange={(e) => setYear(e.target.value)} />
					</div>
					<div>
						<Label>부모 노드 (이동)</Label>
						<SourceTreeSelect
							mode="single"
							value={parentId}
							onChange={setParentId}
							excludeSubtreeOf={source.id}
							{...fetchers}
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						취소
					</Button>
					<Button
						disabled={loading}
						onClick={async () => {
							setLoading(true);
							try {
								await updateSourceAction(source.id, {
									slug,
									name,
									year: year ? Number.parseInt(year, 10) : null,
									parentId,
								});
								await onUpdated();
								onClose();
								toast.success("수정 완료");
							} catch (e) {
								toast.error((e as Error).message);
							} finally {
								setLoading(false);
							}
						}}
					>
						저장
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function DeleteDialog({
	source,
	onClose,
	onDeleted,
}: {
	source: Source;
	onClose: () => void;
	onDeleted: () => Promise<void>;
}) {
	const [impact, setImpact] = useState<{
		descendantCount: number;
		problemsAffected: number;
		detachableContests: { id: number; title: string }[];
	} | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		previewDeleteImpactAction(source.id)
			.then(setImpact)
			.catch(() => setImpact(null));
	}, [source.id]);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>출처 삭제 확인</DialogTitle>
					<DialogDescription>
						{impact ? (
							<>
								이 노드와 {impact.descendantCount}개 하위 노드가 삭제되며, {impact.problemsAffected}
								개 문제에서 출처 연결이 해제되고, {impact.detachableContests.length}개 대회의 출처가
								해제됩니다.
							</>
						) : (
							"영향 범위 계산 중..."
						)}
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button variant="ghost" onClick={onClose}>
						취소
					</Button>
					<Button
						variant="destructive"
						disabled={loading}
						onClick={async () => {
							setLoading(true);
							try {
								await deleteSourceAction(source.id);
								await onDeleted();
								onClose();
								toast.success("삭제 완료");
							} catch (e) {
								toast.error((e as Error).message);
							} finally {
								setLoading(false);
							}
						}}
					>
						삭제
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
