"use client";

import {
	Archive,
	ChevronDown,
	ChevronRight,
	Download,
	File,
	FilePlus,
	Folder,
	FolderOpen,
	FolderPlus,
	Pencil,
	Plus,
	Trash2,
	Upload,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	createFolder,
	downloadPlaygroundFiles,
	extractZipToPlayground,
	uploadSingleFile,
} from "@/actions/playground-files";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface PlaygroundFile {
	path: string;
	content: string;
}

interface FileTreeProps {
	sessionId: string;
	files: PlaygroundFile[];
	activeFile: string;
	onSelect: (path: string) => void;
	onCreateFile: (path: string, content: string) => void;
	onDeleteFile: (path: string) => void;
	onRenameFile: (oldPath: string, newPath: string) => void;
	onRefresh: () => void;
}

type Node = {
	id: string; // full path
	name: string;
	type: "file" | "folder";
	children?: Node[];
};

type CreateDialogType = "file" | "folder" | null;

export function FileTree({
	sessionId,
	files,
	activeFile,
	onSelect,
	onCreateFile,
	onDeleteFile,
	onRenameFile,
	onRefresh,
}: FileTreeProps) {
	const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
	const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
	const [lastSelectedPath, setLastSelectedPath] = useState<string>("");

	// Create dialog
	const [createDialogType, setCreateDialogType] = useState<CreateDialogType>(null);
	const [createDialogFolder, setCreateDialogFolder] = useState<string>("__root__");
	const [newItemName, setNewItemName] = useState("");

	// Rename dialog
	const [renameDialogPath, setRenameDialogPath] = useState<string>("");
	const [renameNewName, setRenameNewName] = useState("");

	// Extract ZIP dialog
	const [extractDialogPath, setExtractDialogPath] = useState<string>("");
	const [extractConflicts, setExtractConflicts] = useState<string[]>([]);

	// File upload
	const fileUploadRef = useRef<HTMLInputElement>(null);
	const [uploadTargetFolder, setUploadTargetFolder] = useState<string>("");

	// Convert flat files to tree
	const tree = useMemo(() => {
		const root: Node[] = [];

		files.forEach((file) => {
			const parts = file.path.split("/");
			let currentLevel = root;
			let currentPath = "";

			parts.forEach((part, index) => {
				currentPath = currentPath ? `${currentPath}/${part}` : part;
				const isFile = index === parts.length - 1;

				// .gitkeep 파일은 노드로 추가하지 않음
				if (isFile && part === ".gitkeep") {
					return;
				}

				let node = currentLevel.find((n) => n.name === part);

				if (!node) {
					node = {
						id: currentPath,
						name: part,
						type: isFile ? "file" : "folder",
						children: isFile ? undefined : [],
					};
					currentLevel.push(node);
				}

				if (!isFile && node.children) {
					currentLevel = node.children;
				}
			});
		});

		// Sort: folders first, then files, alphabetically
		const sortNodes = (nodes: Node[]) => {
			nodes.sort((a, b) => {
				if (a.type === b.type) return a.name.localeCompare(b.name);
				return a.type === "folder" ? -1 : 1;
			});
			nodes.forEach((n) => {
				if (n.children) sortNodes(n.children);
			});
		};

		sortNodes(root);
		return root;
	}, [files]);

	// Get flat list of all paths in tree order
	const flatPaths = useMemo(() => {
		const paths: string[] = [];
		const traverse = (nodes: Node[]) => {
			nodes.forEach((node) => {
				paths.push(node.id);
				if (node.children && expandedFolders.has(node.id)) {
					traverse(node.children);
				}
			});
		};
		traverse(tree);
		return paths;
	}, [tree, expandedFolders]);

	const toggleFolder = (path: string) => {
		const newExpanded = new Set(expandedFolders);
		if (newExpanded.has(path)) {
			newExpanded.delete(path);
		} else {
			newExpanded.add(path);
		}
		setExpandedFolders(newExpanded);
	};

	const handleNodeClick = (path: string, event: React.MouseEvent, isFolder: boolean) => {
		// Ctrl/Cmd + Click: Toggle selection
		if (event.ctrlKey || event.metaKey) {
			event.preventDefault();
			const newSelected = new Set(selectedPaths);
			if (newSelected.has(path)) {
				newSelected.delete(path);
			} else {
				newSelected.add(path);
			}
			setSelectedPaths(newSelected);
			setLastSelectedPath(path);
			if (!isFolder) {
				onSelect(path);
			}
		}
		// Shift + Click: Range selection
		else if (event.shiftKey && lastSelectedPath) {
			event.preventDefault();
			const lastIndex = flatPaths.indexOf(lastSelectedPath);
			const currentIndex = flatPaths.indexOf(path);
			if (lastIndex !== -1 && currentIndex !== -1) {
				const start = Math.min(lastIndex, currentIndex);
				const end = Math.max(lastIndex, currentIndex);
				const rangeSelection = flatPaths.slice(start, end + 1);
				setSelectedPaths(new Set(rangeSelection));
			}
			if (!isFolder) {
				onSelect(path);
			}
		}
		// Normal click
		else {
			setSelectedPaths(new Set([path]));
			setLastSelectedPath(path);
			if (isFolder) {
				toggleFolder(path);
			} else {
				onSelect(path);
			}
		}
	};

	const handleCreateItem = async () => {
		if (!newItemName) return;

		// 파일/폴더 이름 검증
		if (newItemName.includes("/") || newItemName.includes("\\")) {
			toast.error("파일 이름에 슬래시(/ \\)를 사용할 수 없습니다.");
			return;
		}

		if (newItemName.trim() !== newItemName) {
			toast.error("파일 이름 앞뒤에 공백을 사용할 수 없습니다.");
			return;
		}

		// __root__를 빈 문자열로 변환
		const targetFolder = createDialogFolder === "__root__" ? "" : createDialogFolder;

		let path = newItemName;
		if (targetFolder) {
			path = `${targetFolder}/${newItemName}`;
		}

		if (createDialogType === "file") {
			// Check duplicate
			if (files.some((f) => f.path === path)) {
				toast.error("이미 존재하는 파일입니다.");
				return;
			}
			onCreateFile(path, "");
			if (targetFolder) {
				setExpandedFolders((prev) => new Set(prev).add(targetFolder));
			}
			onSelect(path);
			toast.success("파일이 생성되었습니다.");
		} else if (createDialogType === "folder") {
			try {
				await createFolder(sessionId, path);
				onRefresh();
				if (targetFolder) {
					setExpandedFolders((prev) => new Set(prev).add(targetFolder));
				}
				setExpandedFolders((prev) => new Set(prev).add(path));
				toast.success("폴더가 생성되었습니다.");
			} catch (_error) {
				toast.error("폴더 생성에 실패했습니다.");
			}
		}

		setNewItemName("");
		setCreateDialogType(null);
	};

	const handleRename = () => {
		if (!renameNewName || !renameDialogPath) return;

		const oldPath = renameDialogPath;
		const parts = oldPath.split("/");
		parts[parts.length - 1] = renameNewName;
		const newPath = parts.join("/");

		if (files.some((f) => f.path === newPath)) {
			toast.error("이미 존재하는 이름입니다.");
			return;
		}

		onRenameFile(oldPath, newPath);
		setRenameDialogPath("");
		setRenameNewName("");
		toast.success("이름이 변경되었습니다.");
	};

	const handleDelete = async (paths: string[]) => {
		if (paths.length === 0) return;

		const confirmMsg =
			paths.length === 1
				? `"${paths[0]}"을(를) 삭제하시겠습니까?`
				: `${paths.length}개의 항목을 삭제하시겠습니까?`;

		if (!confirm(confirmMsg)) return;

		try {
			for (const path of paths) {
				// If it's a folder, delete all files within (including .gitkeep)
				const filesToDelete = files.filter((f) => f.path === path || f.path.startsWith(`${path}/`));

				// Delete all files sequentially
				for (const f of filesToDelete) {
					await onDeleteFile(f.path);
				}
			}

			setSelectedPaths(new Set());
			toast.success("삭제되었습니다.");
		} catch (_error) {
			toast.error("삭제에 실패했습니다.");
		}
	};

	const handleDownload = async (paths: string[]) => {
		if (paths.length === 0) return;

		try {
			// Expand paths to include folder contents
			const expandedPaths = new Set<string>();
			paths.forEach((path) => {
				const node = findNode(tree, path);
				if (node?.type === "folder") {
					// Add all files in this folder
					for (const f of files.filter((f) => f.path.startsWith(`${path}/`) || f.path === path)) {
						expandedPaths.add(f.path);
					}
				} else {
					expandedPaths.add(path);
				}
			});

			const result = await downloadPlaygroundFiles(sessionId, Array.from(expandedPaths));

			const link = document.createElement("a");
			if (result.isZip) {
				link.href = `data:application/zip;base64,${result.data}`;
			} else {
				link.href = `data:application/octet-stream;base64,${result.data}`;
			}
			link.download = result.filename;
			link.click();

			toast.success("다운로드가 시작되었습니다.");
		} catch (_error) {
			toast.error("다운로드에 실패했습니다.");
		}
	};

	const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
		const uploadedFiles = Array.from(e.target.files || []) as File[];
		if (uploadedFiles.length === 0) return;

		// 중복 파일 확인
		const conflicts: string[] = [];
		for (const file of uploadedFiles) {
			const fileName = file.name;
			const path = uploadTargetFolder ? `${uploadTargetFolder}/${fileName}` : fileName;
			if (files.some((f) => f.path === path)) {
				conflicts.push(path);
			}
		}

		// 중복 파일이 있으면 확인
		if (conflicts.length > 0) {
			const overwrite = confirm(
				`${conflicts.length}개 파일이 이미 존재합니다. 덮어쓰시겠습니까?`
			);
			if (!overwrite) {
				if (fileUploadRef.current) {
					fileUploadRef.current.value = "";
				}
				return;
			}
		}

		// 모든 파일 업로드
		let successCount = 0;
		let failCount = 0;

		for (const file of uploadedFiles) {
			try {
				const fileName = file.name;
				const path = uploadTargetFolder ? `${uploadTargetFolder}/${fileName}` : fileName;

				// 파일을 Base64로 읽기 (바이너리 파일 지원)
				await new Promise<void>((resolve, reject) => {
					const reader = new FileReader();

					reader.onload = async (event) => {
						try {
							const content = event.target?.result as string;
							// Base64 데이터로 업로드 (data:image/png;base64,... 형식)
							await uploadSingleFile(sessionId, path, content, true);
							successCount++;
							resolve();
						} catch (error) {
							reject(error);
						}
					};

					reader.onerror = () => {
						reject(new Error("파일 읽기에 실패했습니다."));
					};

					// 바이너리 파일을 Base64로 읽기
					reader.readAsDataURL(file);
				});
			} catch (_error) {
				failCount++;
			}
		}

		// 결과 토스트 메시지
		if (successCount > 0) {
			onRefresh();
			if (failCount === 0) {
				toast.success(`${successCount}개 파일이 업로드되었습니다.`);
			} else {
				toast.warning(`${successCount}개 파일 업로드 성공, ${failCount}개 실패`);
			}
		} else {
			toast.error("파일 업로드에 실패했습니다.");
		}

		// Reset input
		if (fileUploadRef.current) {
			fileUploadRef.current.value = "";
		}
	};

	const handleExtractZip = async (zipPath: string, overwrite: boolean) => {
		try {
			const result = await extractZipToPlayground(sessionId, zipPath, overwrite);

			if (!overwrite && result.conflicts.length > 0) {
				setExtractConflicts(result.conflicts);
				setExtractDialogPath(zipPath);
				return;
			}

			onRefresh();
			toast.success(`${result.addedFiles.length}개의 파일이 추출되었습니다.`);
			setExtractDialogPath("");
			setExtractConflicts([]);
		} catch (_error) {
			toast.error("압축 해제에 실패했습니다.");
		}
	};

	const findNode = (nodes: Node[], path: string): Node | null => {
		for (const node of nodes) {
			if (node.id === path) return node;
			if (node.children) {
				const found = findNode(node.children, path);
				if (found) return found;
			}
		}
		return null;
	};

	const isZipFile = (path: string) => path.toLowerCase().endsWith(".zip");

	// 모든 폴더 경로 가져오기
	const getAllFolders = useMemo(() => {
		const folders: string[] = ["__root__"]; // 루트 포함
		const collectFolders = (nodes: Node[], parentPath = "") => {
			nodes.forEach((node) => {
				if (node.type === "folder") {
					const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
					folders.push(fullPath);
					if (node.children) {
						collectFolders(node.children, fullPath);
					}
				}
			});
		};
		collectFolders(tree);
		return folders;
	}, [tree]);

	const FileNode = ({ node, level }: { node: Node; level: number }) => {
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
								onClick={(e) => handleNodeClick(node.id, e, true)}
								onMouseEnter={() => setIsHovered(true)}
								onMouseLeave={() => setIsHovered(false)}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										toggleFolder(node.id);
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
												handleDelete([node.id]);
											}}
										>
											<Trash2 className="h-3 w-3" />
										</Button>
									</div>
								)}
							</div>
						</ContextMenuTrigger>
						<ContextMenuContent>
							<ContextMenuItem
								onClick={() => {
									setUploadTargetFolder(node.id);
									fileUploadRef.current?.click();
								}}
							>
								<Upload className="h-4 w-4 mr-2" />
								파일 업로드
							</ContextMenuItem>
							<ContextMenuItem onClick={() => handleDownload([node.id])}>
								<Download className="h-4 w-4 mr-2" />
								다운로드 (ZIP)
							</ContextMenuItem>
							<ContextMenuSeparator />
							<ContextMenuItem onClick={() => handleDelete([node.id])} className="text-red-500">
								<Trash2 className="h-4 w-4 mr-2" />
								삭제
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>

					{isExpanded && node.children && (
						<div>
							{node.children.map((child) => (
								<FileNode key={child.id} node={child} level={level + 1} />
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
						onClick={(e) => handleNodeClick(node.id, e, false)}
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
										setRenameDialogPath(node.id);
										setRenameNewName(node.name);
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
										handleDelete([node.id]);
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
											handleExtractZip(node.id, false);
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
					<ContextMenuItem onClick={() => handleDownload([node.id])}>
						<Download className="h-4 w-4 mr-2" />
						다운로드
					</ContextMenuItem>
					<ContextMenuItem
						onClick={() => {
							setRenameDialogPath(node.id);
							setRenameNewName(node.name);
						}}
					>
						<Pencil className="h-4 w-4 mr-2" />
						이름 변경
					</ContextMenuItem>
					{isZipFile(node.id) && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem onClick={() => handleExtractZip(node.id, false)}>
								<Archive className="h-4 w-4 mr-2" />
								압축 풀기
							</ContextMenuItem>
						</>
					)}
					<ContextMenuSeparator />
					<ContextMenuItem onClick={() => handleDelete([node.id])} className="text-red-500">
						<Trash2 className="h-4 w-4 mr-2" />
						삭제
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		);
	};

	return (
		<div className="flex flex-col h-full bg-muted/10 border-r">
			{/* Header */}
			<div className="p-2 border-b flex items-center justify-between">
				<span className="font-semibold text-sm">탐색기</span>
				<div className="flex items-center gap-1">
					{selectedPaths.size > 1 && (
						<Button
							variant="ghost"
							size="icon"
							className="h-6 w-6"
							onClick={() => handleDownload(Array.from(selectedPaths))}
						>
							<Download className="h-3.5 w-3.5" />
						</Button>
					)}
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button variant="ghost" size="icon" className="h-6 w-6">
								<Plus className="h-4 w-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem
								onClick={() => {
									// 현재 선택된 폴더가 있으면 그 폴더에, 없으면 루트에 생성
									const selectedFolder = selectedPaths.size === 1 && Array.from(selectedPaths)[0];
									const targetFolder =
										selectedFolder && findNode(tree, selectedFolder)?.type === "folder"
											? selectedFolder
											: "__root__";
									setCreateDialogType("file");
									setCreateDialogFolder(targetFolder);
								}}
							>
								<FilePlus className="h-4 w-4 mr-2" />새 파일
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									// 현재 선택된 폴더가 있으면 그 폴더에, 없으면 루트에 생성
									const selectedFolder = selectedPaths.size === 1 && Array.from(selectedPaths)[0];
									const targetFolder =
										selectedFolder && findNode(tree, selectedFolder)?.type === "folder"
											? selectedFolder
											: "__root__";
									setCreateDialogType("folder");
									setCreateDialogFolder(targetFolder);
								}}
							>
								<FolderPlus className="h-4 w-4 mr-2" />새 폴더
							</DropdownMenuItem>
							<DropdownMenuItem
								onClick={() => {
									// 현재 선택된 폴더가 있으면 그 폴더에, 없으면 루트에 업로드
									const selectedFolder = selectedPaths.size === 1 && Array.from(selectedPaths)[0];
									const targetFolder =
										selectedFolder && findNode(tree, selectedFolder)?.type === "folder"
											? selectedFolder
											: ""; // 업로드는 실제로 빈 문자열을 사용 (handleFileUpload에서 처리)
									setUploadTargetFolder(targetFolder);
									fileUploadRef.current?.click();
								}}
							>
								<Upload className="h-4 w-4 mr-2" />
								파일 업로드
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
			</div>

			{/* File tree */}
			<div className="flex-1 overflow-auto py-2">
				{tree.map((node) => (
					<FileNode key={node.id} node={node} level={0} />
				))}
				{tree.length === 0 && (
					<div className="text-center text-xs text-muted-foreground p-4">파일이 없습니다.</div>
				)}
			</div>

			{/* Hidden file input for upload */}
			<input ref={fileUploadRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

			{/* Create File/Folder Dialog */}
			<Dialog open={createDialogType !== null} onOpenChange={() => setCreateDialogType(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{createDialogType === "file" ? "새 파일 생성" : "새 폴더 생성"}
						</DialogTitle>
					</DialogHeader>
					<div className="py-4 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="location">위치</Label>
							<Select value={createDialogFolder} onValueChange={setCreateDialogFolder}>
								<SelectTrigger id="location">
									<SelectValue placeholder="위치 선택" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="__root__">(루트)</SelectItem>
									{getAllFolders
										.filter((f) => f !== "__root__")
										.map((folder) => (
											<SelectItem key={folder} value={folder}>
												{folder}
											</SelectItem>
										))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="name">
								{createDialogType === "file" ? "파일 이름" : "폴더 이름"}
							</Label>
							<Input
								id="name"
								placeholder={createDialogType === "file" ? "filename.ext" : "foldername"}
								value={newItemName}
								onChange={(e) => setNewItemName(e.target.value)}
								onKeyDown={(e) => e.key === "Enter" && handleCreateItem()}
								autoFocus
							/>
						</div>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setCreateDialogType(null)}>
							취소
						</Button>
						<Button onClick={handleCreateItem}>생성</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Rename Dialog */}
			<Dialog open={!!renameDialogPath} onOpenChange={() => setRenameDialogPath("")}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>이름 변경</DialogTitle>
					</DialogHeader>
					<div className="py-4">
						<Input
							placeholder="새 이름"
							value={renameNewName}
							onChange={(e) => setRenameNewName(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleRename()}
							autoFocus
						/>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={() => setRenameDialogPath("")}>
							취소
						</Button>
						<Button onClick={handleRename}>변경</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			{/* Extract ZIP Conflicts Dialog */}
			<AlertDialog
				open={extractDialogPath !== "" && extractConflicts.length > 0}
				onOpenChange={() => {
					setExtractDialogPath("");
					setExtractConflicts([]);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>파일 충돌</AlertDialogTitle>
						<AlertDialogDescription>
							다음 파일들이 이미 존재합니다:
							<ul className="list-disc list-inside mt-2 max-h-48 overflow-auto">
								{extractConflicts.map((path) => (
									<li key={path} className="text-xs">
										{path}
									</li>
								))}
							</ul>
							덮어쓰시겠습니까?
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel
							onClick={() => {
								setExtractDialogPath("");
								setExtractConflicts([]);
							}}
						>
							취소
						</AlertDialogCancel>
						<AlertDialogAction onClick={() => handleExtractZip(extractDialogPath, true)}>
							덮어쓰기
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
