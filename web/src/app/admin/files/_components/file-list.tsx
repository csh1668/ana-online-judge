"use client";

import {
	FileIcon,
	FileText,
	FolderIcon,
	Image as ImageIcon,
	Loader2,
	Plus,
	Upload,
} from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { listDirectoryEntries } from "@/actions/file-manager";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface FileListProps {
	currentPrefix: string;
	onNavigate: (prefix: string) => void;
	onSelectFile: (key: string) => void;
	selectedFileKey: string | null;
	onUploadClick: () => void;
	onNewFolderClick: () => void;
	refreshKey: number;
}

interface FolderEntry {
	prefix: string;
	name: string;
}

interface FileEntry {
	key: string;
	name: string;
	size: number;
	lastModified: Date;
	fileType: "text" | "image" | "binary";
}

function formatFileSize(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${(bytes / k ** i).toFixed(2)} ${sizes[i]}`;
}

function formatDate(date: Date): string {
	return new Date(date).toLocaleString("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getFileIcon(fileType: "text" | "image" | "binary") {
	switch (fileType) {
		case "image":
			return <ImageIcon className="h-4 w-4 shrink-0 text-blue-500" />;
		case "text":
			return <FileText className="h-4 w-4 shrink-0 text-green-500" />;
		default:
			return <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />;
	}
}

function buildBreadcrumbSegments(prefix: string) {
	const parts = prefix.split("/").filter(Boolean);
	const segments: { label: string; prefix: string }[] = [{ label: "/", prefix: "" }];

	for (let i = 0; i < parts.length; i++) {
		segments.push({
			label: parts[i],
			prefix: `${parts.slice(0, i + 1).join("/")}/`,
		});
	}

	return segments;
}

export function FileList({
	currentPrefix,
	onNavigate,
	onSelectFile,
	selectedFileKey,
	onUploadClick,
	onNewFolderClick,
	refreshKey,
}: FileListProps) {
	const [folders, setFolders] = useState<FolderEntry[]>([]);
	const [files, setFiles] = useState<FileEntry[]>([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		// refreshKey is used as a dependency to trigger re-fetches
		void refreshKey;
		let cancelled = false;
		setLoading(true);
		listDirectoryEntries(currentPrefix)
			.then((result) => {
				if (cancelled) return;
				setFolders(result.folders);
				setFiles(result.files);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [currentPrefix, refreshKey]);

	const segments = buildBreadcrumbSegments(currentPrefix);

	return (
		<div className="flex h-full flex-col">
			{/* Breadcrumb Navigation */}
			<div className="border-b px-3 py-2">
				<Breadcrumb>
					<BreadcrumbList>
						{segments.map((segment, index) => {
							const isLast = index === segments.length - 1;
							return (
								<Fragment key={segment.prefix}>
									{index > 0 && <BreadcrumbSeparator />}
									<BreadcrumbItem>
										{isLast ? (
											<BreadcrumbPage>{segment.label}</BreadcrumbPage>
										) : (
											<BreadcrumbLink
												href="#"
												onClick={(e) => {
													e.preventDefault();
													onNavigate(segment.prefix);
												}}
											>
												{segment.label}
											</BreadcrumbLink>
										)}
									</BreadcrumbItem>
								</Fragment>
							);
						})}
					</BreadcrumbList>
				</Breadcrumb>
			</div>

			{/* File/Folder List */}
			<ScrollArea className="flex-1">
				{loading ? (
					<div className="flex items-center justify-center py-12">
						<Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
					</div>
				) : folders.length === 0 && files.length === 0 ? (
					<div className="flex items-center justify-center py-12">
						<p className="text-sm text-muted-foreground">비어 있는 디렉토리입니다.</p>
					</div>
				) : (
					<div className="divide-y">
						{folders.map((folder) => (
							<button
								key={folder.prefix}
								type="button"
								className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/50 transition-colors"
								onClick={() => onNavigate(folder.prefix)}
							>
								<FolderIcon className="h-4 w-4 shrink-0 text-yellow-500" />
								<span className="flex-1 truncate font-medium">{folder.name}</span>
							</button>
						))}
						{files.map((file) => (
							<button
								key={file.key}
								type="button"
								className={cn(
									"flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
									selectedFileKey === file.key && "bg-muted"
								)}
								onClick={() => onSelectFile(file.key)}
							>
								{getFileIcon(file.fileType)}
								<span className="flex-1 truncate">{file.name}</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatFileSize(file.size)}
								</span>
								<span className="shrink-0 text-xs text-muted-foreground">
									{formatDate(file.lastModified)}
								</span>
							</button>
						))}
					</div>
				)}
			</ScrollArea>

			{/* Action Bar */}
			<div className="flex items-center gap-2 border-t px-3 py-2">
				<Button size="sm" variant="outline" onClick={onUploadClick}>
					<Upload className="mr-1.5 h-4 w-4" />
					업로드
				</Button>
				<Button size="sm" variant="outline" onClick={onNewFolderClick}>
					<Plus className="mr-1.5 h-4 w-4" />새 폴더
				</Button>
			</div>
		</div>
	);
}
