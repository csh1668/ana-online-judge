"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	createTagAction,
	deleteTagAction,
	listAdminTagChildrenAction,
	previewDeleteTagImpactAction,
	updateTagAction,
} from "@/actions/admin/tags";
import { TagTreeSelect, useAdminTagTreeSelectFetchers } from "@/components/tags/tag-tree-select";
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
import { Textarea } from "@/components/ui/textarea";
import type { AlgorithmTag } from "@/db/schema";

interface Props {
	initialRoots: AlgorithmTag[];
}

export function TagsTreeManager({ initialRoots }: Props) {
	const [roots, setRoots] = useState(initialRoots);
	const [childrenMap, setChildrenMap] = useState<Record<number, AlgorithmTag[] | undefined>>({});
	const fetchers = useAdminTagTreeSelectFetchers();

	const [createOpen, setCreateOpen] = useState<{ parentId: number | null } | null>(null);
	const [editOpen, setEditOpen] = useState<AlgorithmTag | null>(null);
	const [deleteOpen, setDeleteOpen] = useState<AlgorithmTag | null>(null);

	const refreshRoots = async () => {
		const nodes = await listAdminTagChildrenAction(null);
		// listAdminTagChildrenAction returns TagNode[]; tree display only needs id/parentId/slug/name.
		// description/createdBy 등 표시에 사용하지 않는 필드는 무시한다.
		setRoots(nodes as unknown as AlgorithmTag[]);
	};

	const refreshChildren = async (parentId: number) => {
		const nodes = await listAdminTagChildrenAction(parentId);
		setChildrenMap((m) => ({ ...m, [parentId]: nodes as unknown as AlgorithmTag[] }));
	};

	const toggleLoad = async (node: AlgorithmTag) => {
		if (childrenMap[node.id] === undefined) await refreshChildren(node.id);
	};

	const renderNode = (node: AlgorithmTag, depth: number) => {
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
						<span className="ml-1 text-xs text-muted-foreground">({node.slug})</span>
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
					<p className="text-sm text-muted-foreground">등록된 태그가 없습니다.</p>
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
					tag={editOpen}
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
					tag={deleteOpen}
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
	const [description, setDescription] = useState("");
	const [loading, setLoading] = useState(false);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>알고리즘 태그 추가</DialogTitle>
					<DialogDescription>
						{parentId === null ? "루트 태그" : `부모 #${parentId} 아래`}에 새 태그를 추가합니다.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label>이름</Label>
						<Input value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<div>
						<Label>Slug (영문, 검색용)</Label>
						<Input value={slug} onChange={(e) => setSlug(e.target.value)} />
					</div>
					<div>
						<Label>설명 (markdown, 선택)</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={4}
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
								await createTagAction({
									parentId,
									slug,
									name,
									description: description || null,
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
	tag,
	fetchers,
	onClose,
	onUpdated,
}: {
	tag: AlgorithmTag;
	fetchers: ReturnType<typeof useAdminTagTreeSelectFetchers>;
	onClose: () => void;
	onUpdated: () => Promise<void>;
}) {
	const [slug, setSlug] = useState(tag.slug);
	const [name, setName] = useState(tag.name);
	const [description, setDescription] = useState(tag.description ?? "");
	const [parentId, setParentId] = useState<number | null>(tag.parentId);
	const [loading, setLoading] = useState(false);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>알고리즘 태그 편집</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label>이름</Label>
						<Input value={name} onChange={(e) => setName(e.target.value)} />
					</div>
					<div>
						<Label>Slug</Label>
						<Input value={slug} onChange={(e) => setSlug(e.target.value)} />
					</div>
					<div>
						<Label>설명 (markdown)</Label>
						<Textarea
							value={description}
							onChange={(e) => setDescription(e.target.value)}
							rows={6}
						/>
					</div>
					<div>
						<Label>부모 노드 (이동)</Label>
						<TagTreeSelect
							mode="single"
							value={parentId}
							onChange={setParentId}
							excludeSubtreeOf={tag.id}
							placeholder="(루트)"
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
								await updateTagAction(tag.id, {
									slug,
									name,
									description: description || null,
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
	tag,
	onClose,
	onDeleted,
}: {
	tag: AlgorithmTag;
	onClose: () => void;
	onDeleted: () => Promise<void>;
}) {
	const [impact, setImpact] = useState<{
		descendantCount: number;
		affectedProblemCount: number;
	} | null>(null);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		previewDeleteTagImpactAction(tag.id)
			.then(setImpact)
			.catch(() => setImpact(null));
	}, [tag.id]);

	return (
		<Dialog open onOpenChange={(o) => !o && onClose()}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>알고리즘 태그 삭제 확인</DialogTitle>
					<DialogDescription>
						{impact ? (
							<>
								이 태그와 {impact.descendantCount}개 하위 태그가 삭제되며,{" "}
								{impact.affectedProblemCount}개 문제의 확정 태그가 재계산됩니다.
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
								await deleteTagAction(tag.id);
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
