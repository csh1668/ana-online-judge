"use client";

import { ChevronDown, ChevronRight, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
	createTagAction,
	deleteTagAction,
	listChildrenAction,
	updateTagAction,
} from "@/actions/admin/tags";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { AlgorithmTag } from "@/db/schema";

interface Props {
	initialRoots: AlgorithmTag[];
}

interface TreeNode {
	tag: AlgorithmTag;
	loaded: boolean;
	expanded: boolean;
	children: TreeNode[];
}

function toNode(tag: AlgorithmTag): TreeNode {
	return { tag, loaded: false, expanded: false, children: [] };
}

export function TagsTreeManager({ initialRoots }: Props) {
	const [roots, setRoots] = useState<TreeNode[]>(initialRoots.map(toNode));
	const [selected, setSelected] = useState<AlgorithmTag | null>(null);
	const [editName, setEditName] = useState("");
	const [editSlug, setEditSlug] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [creatingChildOf, setCreatingChildOf] = useState<number | "root" | null>(null);
	const [newName, setNewName] = useState("");
	const [newSlug, setNewSlug] = useState("");
	const [newDescription, setNewDescription] = useState("");

	useEffect(() => {
		if (selected) {
			setEditName(selected.name);
			setEditSlug(selected.slug);
			setEditDescription(selected.description ?? "");
		}
	}, [selected]);

	async function toggleNode(node: TreeNode) {
		if (!node.expanded && !node.loaded) {
			const children = await listChildrenAction(node.tag.id);
			node.children = children.map(toNode);
			node.loaded = true;
		}
		node.expanded = !node.expanded;
		setRoots([...roots]);
	}

	async function handleSaveSelected() {
		if (!selected) return;
		try {
			await updateTagAction(selected.id, {
				name: editName,
				slug: editSlug,
				description: editDescription || null,
			});
			toast.success("저장 완료");
			selected.name = editName;
			selected.slug = editSlug;
			selected.description = editDescription || null;
			setRoots([...roots]);
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "저장 실패");
		}
	}

	async function handleDeleteSelected() {
		if (!selected) return;
		if (!confirm(`'${selected.name}' 및 모든 자손을 삭제합니다. 계속하시겠습니까?`)) return;
		try {
			const { affectedProblemCount } = await deleteTagAction(selected.id);
			toast.success(`삭제됨 — 영향 받은 문제 ${affectedProblemCount}개 재계산 예약`);
			setSelected(null);
			window.location.reload();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "삭제 실패");
		}
	}

	async function handleCreate() {
		const parentId = creatingChildOf === "root" ? null : creatingChildOf;
		try {
			await createTagAction({
				parentId,
				name: newName,
				slug: newSlug,
				description: newDescription || null,
			});
			toast.success("생성 완료");
			setNewName("");
			setNewSlug("");
			setNewDescription("");
			setCreatingChildOf(null);
			window.location.reload();
		} catch (e) {
			toast.error(e instanceof Error ? e.message : "생성 실패");
		}
	}

	function renderNode(node: TreeNode, depth: number) {
		return (
			<div key={node.tag.id}>
				<div
					className="flex items-center gap-1 py-1 hover:bg-muted/50 rounded px-1"
					style={{ paddingLeft: depth * 16 }}
				>
					<button
						type="button"
						onClick={() => toggleNode(node)}
						className="text-muted-foreground cursor-pointer"
						aria-label={node.expanded ? "접기" : "펼치기"}
					>
						{node.expanded ? (
							<ChevronDown className="h-3 w-3" />
						) : (
							<ChevronRight className="h-3 w-3" />
						)}
					</button>
					<button
						type="button"
						className="flex-1 flex items-center gap-1 cursor-pointer text-left"
						onClick={() => setSelected(node.tag)}
					>
						<span className={selected?.id === node.tag.id ? "font-semibold text-primary" : ""}>
							{node.tag.name}
						</span>
						<span className="text-xs text-muted-foreground">({node.tag.slug})</span>
					</button>
				</div>
				{node.expanded && (
					<div>
						{node.children.map((c) => renderNode(c, depth + 1))}
						<button
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								setCreatingChildOf(node.tag.id);
							}}
							className="text-xs text-muted-foreground hover:text-foreground py-1"
							style={{ paddingLeft: (depth + 1) * 16 + 16 }}
						>
							<Plus className="h-3 w-3 inline mr-1" />
							자식 추가
						</button>
					</div>
				)}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-4">
			<Card>
				<CardContent className="p-4 space-y-2">
					<div className="flex items-center justify-between">
						<h2 className="font-semibold">트리</h2>
						<Button variant="outline" size="sm" onClick={() => setCreatingChildOf("root")}>
							<Plus className="h-4 w-4 mr-1" />
							루트 추가
						</Button>
					</div>
					<div className="space-y-0.5 max-h-[600px] overflow-y-auto">
						{roots.map((r) => renderNode(r, 0))}
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardContent className="p-4 space-y-3">
					{creatingChildOf !== null ? (
						<>
							<h2 className="font-semibold">
								{creatingChildOf === "root" ? "루트 태그 생성" : "자식 태그 생성"}
							</h2>
							<div>
								<Label htmlFor="new-name">이름</Label>
								<Input id="new-name" value={newName} onChange={(e) => setNewName(e.target.value)} />
							</div>
							<div>
								<Label htmlFor="new-slug">slug (영문, 검색용)</Label>
								<Input id="new-slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} />
							</div>
							<div>
								<Label htmlFor="new-desc">설명 (markdown)</Label>
								<Textarea
									id="new-desc"
									value={newDescription}
									onChange={(e) => setNewDescription(e.target.value)}
									rows={4}
								/>
							</div>
							<div className="flex gap-2">
								<Button onClick={handleCreate}>생성</Button>
								<Button variant="outline" onClick={() => setCreatingChildOf(null)}>
									취소
								</Button>
							</div>
						</>
					) : selected ? (
						<>
							<h2 className="font-semibold">{selected.name} 편집</h2>
							<div>
								<Label htmlFor="edit-name">이름</Label>
								<Input
									id="edit-name"
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
								/>
							</div>
							<div>
								<Label htmlFor="edit-slug">slug</Label>
								<Input
									id="edit-slug"
									value={editSlug}
									onChange={(e) => setEditSlug(e.target.value)}
								/>
							</div>
							<div>
								<Label htmlFor="edit-desc">설명 (markdown)</Label>
								<Textarea
									id="edit-desc"
									value={editDescription}
									onChange={(e) => setEditDescription(e.target.value)}
									rows={6}
								/>
							</div>
							<div className="flex gap-2">
								<Button onClick={handleSaveSelected}>
									<Save className="h-4 w-4 mr-1" />
									저장
								</Button>
								<Button variant="destructive" onClick={handleDeleteSelected}>
									<Trash2 className="h-4 w-4 mr-1" />
									삭제
								</Button>
							</div>
						</>
					) : (
						<p className="text-sm text-muted-foreground">
							왼쪽 트리에서 태그를 선택하면 편집할 수 있습니다.
						</p>
					)}
				</CardContent>
			</Card>
		</div>
	);
}
