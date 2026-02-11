"use client";

import {
	Archive,
	ChevronDown,
	ChevronRight,
	Download,
	File,
	Folder,
	FolderOpen,
	Pencil,
	Trash2,
	Upload,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import type { Node } from "./types";
import { isZipFile } from "./utils";

interface FileNodeProps {
	node: Node;
	level: number;
	activeFile: string;
	selectedPaths: Set<string>;
	expandedFolders: Set<string>;
	onNodeClick: (path: string, event: React.MouseEvent, isFolder: boolean) => void;
	onToggleFolder: (path: string) => void;
	onSelect: (path: string) => void;
	onDelete: (paths: string[]) => void;
	onDownload: (paths: string[]) => void;
	onRenameClick: (path: string, name: string) => void;
	onExtractZip: (path: string, overwrite: boolean) => void;
	onFileUploadClick: (folderPath: string) => void;
}

export function FileNode({
	node,
	level,
	activeFile,
	selectedPaths,
	expandedFolders,
	onNodeClick,
	onToggleFolder,
	onSelect,
	onDelete,
	onDownload,
	onRenameClick,
	onExtractZip,
	onFileUploadClick,
}: FileNodeProps) {
	const [isHovered, setIsHovered] = useState(false);
	const isExpanded = expandedFolders.has(node.id);
	const isActive = node.id === activeFile;
	const isSelected = selectedPaths.has(node.id);
	const paddingLeft = level * 12 + 12;

	if (node.type === "folder") {
		return (
			<div>
				<ContextMenu>
					<ContextMenuTrigger>
						<div
							role="button"
							tabIndex={0}
							className={cn(
								"flex items-center gap-1.5 py-1 pr-2 text-sm cursor-pointer hover:bg-muted/50 select-none group",
								(isActive || isSelected) && "bg-muted font-medium"
							)}
							style={{ paddingLeft: `${paddingLeft}px` }}
							onClick={(e) => onNodeClick(node.id, e, true)}
							onMouseEnter={() => setIsHovered(true)}
							onMouseLeave={() => setIsHovered(false)}
							onKeyDown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									onToggleFolder(node.id);
								}
							}}
						>
							<span className="opacity-70">
								{isExpanded ? (
									<ChevronDown className="h-4 w-4" />
								) : (
									<ChevronRight className="h-4 w-4" />
								)}
							</span>
							<span className="text-blue-500/80">
								{isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />}
							</span>
							<span className="truncate flex-1">{node.name}</span>
							{isHovered && (
								<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
									<Button
										variant="ghost"
										size="icon"
										className="h-5 w-5"
										onClick={(e) => {
											e.stopPropagation();
											onDelete([node.id]);
										}}
									>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							)}
						</div>
					</ContextMenuTrigger>
					<ContextMenuContent>
						<ContextMenuItem onClick={() => onFileUploadClick(node.id)}>
							<Upload className="h-4 w-4 mr-2" />
							파일 업로드
						</ContextMenuItem>
						<ContextMenuItem onClick={() => onDownload([node.id])}>
							<Download className="h-4 w-4 mr-2" />
							다운로드 (ZIP)
						</ContextMenuItem>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={() => onDelete([node.id])} className="text-red-500">
							<Trash2 className="h-4 w-4 mr-2" />
							삭제
						</ContextMenuItem>
					</ContextMenuContent>
				</ContextMenu>

				{isExpanded && node.children && (
					<div>
						{node.children.map((child) => (
							<FileNode
								key={child.id}
								node={child}
								level={level + 1}
								activeFile={activeFile}
								selectedPaths={selectedPaths}
								expandedFolders={expandedFolders}
								onNodeClick={onNodeClick}
								onToggleFolder={onToggleFolder}
								onSelect={onSelect}
								onDelete={onDelete}
								onDownload={onDownload}
								onRenameClick={onRenameClick}
								onExtractZip={onExtractZip}
								onFileUploadClick={onFileUploadClick}
							/>
						))}
					</div>
				)}
			</div>
		);
	}

	return (
		<ContextMenu>
			<ContextMenuTrigger>
				<div
					role="button"
					tabIndex={0}
					className={cn(
						"flex items-center gap-2 py-1 pr-2 text-sm cursor-pointer hover:bg-muted/50 select-none group",
						(isActive || isSelected) && "bg-muted font-medium"
					)}
					style={{ paddingLeft: `${paddingLeft + 16}px` }}
					onClick={(e) => onNodeClick(node.id, e, false)}
					onMouseEnter={() => setIsHovered(true)}
					onMouseLeave={() => setIsHovered(false)}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.preventDefault();
							onSelect(node.id);
						}
					}}
				>
					<span className="opacity-70">
						<File className="h-4 w-4" />
					</span>
					<span className="truncate flex-1">{node.name}</span>
					{isHovered && (
						<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5"
								onClick={(e) => {
									e.stopPropagation();
									onRenameClick(node.id, node.name);
								}}
							>
								<Pencil className="h-3 w-3" />
							</Button>
							<Button
								variant="ghost"
								size="icon"
								className="h-5 w-5"
								onClick={(e) => {
									e.stopPropagation();
									onDelete([node.id]);
								}}
							>
								<Trash2 className="h-3 w-3" />
							</Button>
							{isZipFile(node.id) && (
								<Button
									variant="ghost"
									size="icon"
									className="h-5 w-5"
									onClick={(e) => {
										e.stopPropagation();
										onExtractZip(node.id, false);
									}}
								>
									<Archive className="h-3 w-3" />
								</Button>
							)}
						</div>
					)}
				</div>
			</ContextMenuTrigger>
			<ContextMenuContent>
				<ContextMenuItem onClick={() => onDownload([node.id])}>
					<Download className="h-4 w-4 mr-2" />
					다운로드
				</ContextMenuItem>
				<ContextMenuItem onClick={() => onRenameClick(node.id, node.name)}>
					<Pencil className="h-4 w-4 mr-2" />
					이름 변경
				</ContextMenuItem>
				{isZipFile(node.id) && (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem onClick={() => onExtractZip(node.id, false)}>
							<Archive className="h-4 w-4 mr-2" />
							압축 풀기
						</ContextMenuItem>
					</>
				)}
				<ContextMenuSeparator />
				<ContextMenuItem onClick={() => onDelete([node.id])} className="text-red-500">
					<Trash2 className="h-4 w-4 mr-2" />
					삭제
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	);
}
