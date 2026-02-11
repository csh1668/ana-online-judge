"use client";

import { Download, FilePlus, FolderPlus, Plus, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
	createFolder,
	downloadPlaygroundFiles,
	extractZipToPlayground,
	uploadSingleFile,
} from "@/actions/playground-files";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateItemDialog, ExtractConflictDialog, RenameDialog } from "./dialogs";
import { FileNode } from "./file-node";
import type { CreateDialogType, FileTreeProps } from "./types";
import { buildFileTree, findNode, flattenPaths, getAllFolderPaths } from "./utils";

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

	const [createDialogType, setCreateDialogType] = useState<CreateDialogType>(null);
	const [createDialogFolder, setCreateDialogFolder] = useState<string>("__root__");
	const [newItemName, setNewItemName] = useState("");
	const [renameDialogPath, setRenameDialogPath] = useState<string>("");
	const [renameNewName, setRenameNewName] = useState("");
	const [extractDialogPath, setExtractDialogPath] = useState<string>("");
	const [extractConflicts, setExtractConflicts] = useState<string[]>([]);
	const fileUploadRef = useRef<HTMLInputElement>(null);
	const [uploadTargetFolder, setUploadTargetFolder] = useState<string>("");

	const tree = useMemo(() => buildFileTree(files), [files]);

	const flatPaths = useMemo(() => flattenPaths(tree, expandedFolders), [tree, expandedFolders]);

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
		} else if (event.shiftKey && lastSelectedPath) {
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
		} else {
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

		if (newItemName.includes("/") || newItemName.includes("")) {
			toast.error("파일 이름에 슬래시(/ )를 사용할 수 없습니다.");
			return;
		}

		if (newItemName.trim() !== newItemName) {
			toast.error("파일 이름 앞뒤에 공백을 사용할 수 없습니다.");
			return;
		}

		const targetFolder = createDialogFolder === "__root__" ? "" : createDialogFolder;

		let path = newItemName;
		if (targetFolder) {
			path = `${targetFolder}/${newItemName}`;
		}

		if (createDialogType === "file") {
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
				const filesToDelete = files.filter((f) => f.path === path || f.path.startsWith(`${path}/`));

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
			const expandedPaths = new Set<string>();
			paths.forEach((path) => {
				const node = findNode(tree, path);
				if (node?.type === "folder") {
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

		const conflicts: string[] = [];
		for (const file of uploadedFiles) {
			const fileName = file.name;
			const path = uploadTargetFolder ? `${uploadTargetFolder}/${fileName}` : fileName;
			if (files.some((f) => f.path === path)) {
				conflicts.push(path);
			}
		}

		if (conflicts.length > 0) {
			const overwrite = confirm(`${conflicts.length}개 파일이 이미 존재합니다. 덮어쓰시겠습니까?`);
			if (!overwrite) {
				if (fileUploadRef.current) {
					fileUploadRef.current.value = "";
				}
				return;
			}
		}

		let successCount = 0;
		let failCount = 0;

		for (const file of uploadedFiles) {
			try {
				const fileName = file.name;
				const path = uploadTargetFolder ? `${uploadTargetFolder}/${fileName}` : fileName;

				await new Promise<void>((resolve, reject) => {
					const reader = new FileReader();

					reader.onload = async (event) => {
						try {
							const content = event.target?.result as string;
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

					reader.readAsDataURL(file);
				});
			} catch (_error) {
				failCount++;
			}
		}

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

	const allFolders = useMemo(() => getAllFolderPaths(tree), [tree]);

	return (
		<div className="flex flex-col h-full bg-muted/10 border-r">
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
									const selectedFolder = selectedPaths.size === 1 && Array.from(selectedPaths)[0];
									const targetFolder =
										selectedFolder && findNode(tree, selectedFolder)?.type === "folder"
											? selectedFolder
											: "";
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

			<div className="flex-1 overflow-auto py-2">
				{tree.map((node) => (
					<FileNode
						key={node.id}
						node={node}
						level={0}
						activeFile={activeFile}
						selectedPaths={selectedPaths}
						expandedFolders={expandedFolders}
						onNodeClick={handleNodeClick}
						onToggleFolder={toggleFolder}
						onSelect={onSelect}
						onDelete={handleDelete}
						onDownload={handleDownload}
						onRenameClick={(path, name) => {
							setRenameDialogPath(path);
							setRenameNewName(name);
						}}
						onExtractZip={handleExtractZip}
						onFileUploadClick={(folder) => {
							setUploadTargetFolder(folder);
							fileUploadRef.current?.click();
						}}
					/>
				))}
				{tree.length === 0 && (
					<div className="text-center text-xs text-muted-foreground p-4">파일이 없습니다.</div>
				)}
			</div>

			<input
				ref={fileUploadRef}
				type="file"
				multiple
				className="hidden"
				onChange={handleFileUpload}
			/>

			<CreateItemDialog
				type={createDialogType}
				isOpen={createDialogType !== null}
				onOpenChange={(open) => !open && setCreateDialogType(null)}
				folder={createDialogFolder}
				onFolderChange={setCreateDialogFolder}
				name={newItemName}
				onNameChange={setNewItemName}
				onSubmit={handleCreateItem}
				allFolders={allFolders}
			/>

			<RenameDialog
				isOpen={!!renameDialogPath}
				onOpenChange={(open) => !open && setRenameDialogPath("")}
				name={renameNewName}
				onNameChange={setRenameNewName}
				onSubmit={handleRename}
			/>

			<ExtractConflictDialog
				isOpen={extractDialogPath !== "" && extractConflicts.length > 0}
				onOpenChange={(open) => {
					if (!open) {
						setExtractDialogPath("");
						setExtractConflicts([]);
					}
				}}
				conflicts={extractConflicts}
				onConfirm={() => handleExtractZip(extractDialogPath, true)}
			/>
		</div>
	);
}
