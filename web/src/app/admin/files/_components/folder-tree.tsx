"use client";

import { ChevronDown, ChevronRight, FolderIcon, FolderOpen, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listDirectoryEntries } from "@/actions/file-manager";
import { cn } from "@/lib/utils";

interface TreeNode {
	prefix: string;
	name: string;
	children: TreeNode[] | null;
	loading: boolean;
	expanded: boolean;
}

interface FolderTreeProps {
	currentPrefix: string;
	onNavigate: (prefix: string) => void;
}

async function loadChildren(prefix: string): Promise<TreeNode[]> {
	const result = await listDirectoryEntries(prefix);
	return result.folders.map((f) => ({
		prefix: f.prefix,
		name: f.name,
		children: null,
		loading: false,
		expanded: false,
	}));
}

function updateNodeInTree(
	nodes: TreeNode[],
	prefix: string,
	updater: (node: TreeNode) => TreeNode
): TreeNode[] {
	return nodes.map((node) => {
		if (node.prefix === prefix) {
			return updater(node);
		}
		if (node.children) {
			return { ...node, children: updateNodeInTree(node.children, prefix, updater) };
		}
		return node;
	});
}

function findNode(nodes: TreeNode[], prefix: string): TreeNode | null {
	for (const node of nodes) {
		if (node.prefix === prefix) return node;
		if (node.children) {
			const found = findNode(node.children, prefix);
			if (found) return found;
		}
	}
	return null;
}

function TreeItem({
	node,
	depth,
	currentPrefix,
	onToggle,
	onSelect,
}: {
	node: TreeNode;
	depth: number;
	currentPrefix: string;
	onToggle: (prefix: string) => void;
	onSelect: (prefix: string) => void;
}) {
	const isSelected = currentPrefix === node.prefix;

	return (
		<div>
			<div
				className={cn(
					"flex items-center gap-0.5 rounded-md px-1 py-0.5 text-sm cursor-pointer hover:bg-muted",
					isSelected && "bg-accent text-accent-foreground font-medium"
				)}
				style={{ paddingLeft: `${depth * 12 + 4}px` }}
			>
				<button
					type="button"
					className="flex shrink-0 items-center justify-center rounded p-0.5 hover:bg-muted-foreground/20"
					onClick={(e) => {
						e.stopPropagation();
						onToggle(node.prefix);
					}}
				>
					{node.loading ? (
						<Loader2 className="size-3.5 animate-spin text-muted-foreground" />
					) : node.expanded ? (
						<ChevronDown className="size-3.5 text-muted-foreground" />
					) : (
						<ChevronRight className="size-3.5 text-muted-foreground" />
					)}
				</button>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
					onClick={() => onSelect(node.prefix)}
				>
					{node.expanded ? (
						<FolderOpen className="size-4 shrink-0 text-amber-500" />
					) : (
						<FolderIcon className="size-4 shrink-0 text-amber-500" />
					)}
					<span className="truncate">{node.name}</span>
				</button>
			</div>
			{node.expanded && node.children && (
				<div>
					{node.children.map((child) => (
						<TreeItem
							key={child.prefix}
							node={child}
							depth={depth + 1}
							currentPrefix={currentPrefix}
							onToggle={onToggle}
							onSelect={onSelect}
						/>
					))}
				</div>
			)}
		</div>
	);
}

export default function FolderTree({ currentPrefix, onNavigate }: FolderTreeProps) {
	const [nodes, setNodes] = useState<TreeNode[]>([]);
	const [rootLoading, setRootLoading] = useState(true);

	useEffect(() => {
		setRootLoading(true);
		loadChildren("").then((children) => {
			setNodes(children);
			setRootLoading(false);
		});
	}, []);

	const loadAndExpand = useCallback(async (prefix: string) => {
		setNodes((prev) =>
			updateNodeInTree(prev, prefix, (node) => ({
				...node,
				loading: true,
				expanded: true,
			}))
		);

		const children = await loadChildren(prefix);
		setNodes((prev) =>
			updateNodeInTree(prev, prefix, (node) => ({
				...node,
				children,
				loading: false,
			}))
		);
	}, []);

	// When currentPrefix changes externally (e.g. navigating via file list),
	// expand ancestor folders in the tree so the selected folder is visible.
	useEffect(() => {
		if (!currentPrefix) return;

		const parts = currentPrefix.replace(/\/$/, "").split("/");
		const ancestorPrefixes: string[] = [];
		for (let i = 0; i < parts.length; i++) {
			ancestorPrefixes.push(`${parts.slice(0, i + 1).join("/")}/`);
		}

		(async () => {
			for (const prefix of ancestorPrefixes) {
				// Read latest state to check if node needs loading
				const needsLoad = await new Promise<boolean>((resolve) => {
					setNodes((prev) => {
						const node = findNode(prev, prefix);
						if (!node) {
							resolve(false);
							return prev;
						}
						if (node.children === null) {
							resolve(true);
							return prev;
						}
						// Already loaded — just expand
						if (!node.expanded) {
							return updateNodeInTree(prev, prefix, (n) => ({ ...n, expanded: true }));
						}
						resolve(false);
						return prev;
					});
				});

				if (needsLoad) {
					await loadAndExpand(prefix);
				}
			}
		})();
	}, [currentPrefix, loadAndExpand]);

	const handleToggle = useCallback(
		(prefix: string) => {
			setNodes((prev) => {
				const node = findNode(prev, prefix);
				if (!node) return prev;

				if (node.children === null) {
					// Not loaded yet — trigger async load
					return prev;
				}

				return updateNodeInTree(prev, prefix, (n) => ({
					...n,
					expanded: !n.expanded,
				}));
			});

			// Check if we need to load (read from latest state via another setter)
			setNodes((prev) => {
				const node = findNode(prev, prefix);
				if (node && node.children === null) {
					// Kick off load outside of setState
					queueMicrotask(() => loadAndExpand(prefix));
				}
				return prev;
			});
		},
		[loadAndExpand]
	);

	const handleSelect = useCallback(
		(prefix: string) => {
			onNavigate(prefix);

			setNodes((prev) => {
				const node = findNode(prev, prefix);
				if (!node) return prev;

				if (node.children === null) {
					queueMicrotask(() => loadAndExpand(prefix));
					return prev;
				}

				if (!node.expanded) {
					return updateNodeInTree(prev, prefix, (n) => ({
						...n,
						expanded: true,
					}));
				}

				return prev;
			});
		},
		[onNavigate, loadAndExpand]
	);

	return (
		<div className="flex flex-col overflow-y-auto text-sm">
			<div
				className={cn(
					"flex items-center gap-1 rounded-md px-1 py-0.5 cursor-pointer hover:bg-muted",
					currentPrefix === "" && "bg-accent text-accent-foreground font-medium"
				)}
			>
				<button
					type="button"
					className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden"
					onClick={() => onNavigate("")}
				>
					<FolderOpen className="size-4 shrink-0 text-amber-500" />
					<span className="truncate">/</span>
				</button>
			</div>
			{rootLoading ? (
				<div className="flex items-center gap-1 px-1 py-0.5 pl-4 text-muted-foreground">
					<Loader2 className="size-3.5 animate-spin" />
					<span>Loading...</span>
				</div>
			) : (
				nodes.map((node) => (
					<TreeItem
						key={node.prefix}
						node={node}
						depth={1}
						currentPrefix={currentPrefix}
						onToggle={handleToggle}
						onSelect={handleSelect}
					/>
				))
			)}
		</div>
	);
}
