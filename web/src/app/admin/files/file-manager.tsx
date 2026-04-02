"use client";

import {
	Copy,
	Download,
	ExternalLink,
	FileIcon,
	FileText,
	Image as ImageIcon,
	Loader2,
	Search,
	Trash2,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteUploadedFile, getAllUploadedFiles } from "@/actions/files";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { FileInfo } from "@/lib/services/files";

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

export function FileManager() {
	const [files, setFiles] = useState<FileInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [searchQuery, setSearchQuery] = useState("");
	const [filterType, setFilterType] = useState<"all" | "image" | "file">("all");
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [fileToDelete, setFileToDelete] = useState<FileInfo | null>(null);
	const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null);

	const loadFiles = useCallback(async () => {
		setLoading(true);
		const result = await getAllUploadedFiles();
		if (result.success && result.files) {
			setFiles(result.files);
		} else {
			toast.error(result.error || "파일 목록을 불러오는데 실패했습니다.");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		loadFiles();
	}, [loadFiles]);

	const handleDelete = useCallback(
		async (file: FileInfo) => {
			const result = await deleteUploadedFile(file.key);
			if (result.success) {
				toast.success("파일이 삭제되었습니다.");
				setFiles((prev) => prev.filter((f) => f.key !== file.key));
				setDeleteDialogOpen(false);
				setFileToDelete(null);
				if (selectedFile?.key === file.key) {
					setSelectedFile(null);
				}
			} else {
				toast.error(result.error || "파일 삭제에 실패했습니다.");
			}
		},
		[selectedFile]
	);

	const copyToClipboard = useCallback((text: string) => {
		navigator.clipboard.writeText(text);
		toast.success("클립보드에 복사되었습니다.");
	}, []);

	const filteredFiles = files.filter((file) => {
		const matchesSearch = file.name.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesType = filterType === "all" || file.type === filterType;
		return matchesSearch && matchesType;
	});

	const imageFiles = filteredFiles.filter((f) => f.type === "image");
	const regularFiles = filteredFiles.filter((f) => f.type === "file");

	if (loading) {
		return (
			<Card>
				<CardContent className="py-12">
					<div className="flex items-center justify-center">
						<Loader2 className="h-8 w-8 animate-spin" />
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<div className="space-y-6">
			{/* Stats */}
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">총 파일</CardTitle>
						<FileIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{files.length}</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">이미지</CardTitle>
						<ImageIcon className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{files.filter((f) => f.type === "image").length}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">총 용량</CardTitle>
						<FileText className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">
							{formatFileSize(files.reduce((sum, f) => sum + f.size, 0))}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Search and Filter */}
			<Card>
				<CardHeader>
					<CardTitle>파일 검색</CardTitle>
					<CardDescription>파일명으로 검색하고 타입별로 필터링할 수 있습니다.</CardDescription>
				</CardHeader>
				<CardContent className="flex gap-4">
					<div className="relative flex-1">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="파일 검색..."
							value={searchQuery}
							onChange={(e) => setSearchQuery(e.target.value)}
							className="pl-9"
						/>
					</div>
					<Tabs value={filterType} onValueChange={(v) => setFilterType(v as typeof filterType)}>
						<TabsList>
							<TabsTrigger value="all">전체</TabsTrigger>
							<TabsTrigger value="image">이미지</TabsTrigger>
							<TabsTrigger value="file">파일</TabsTrigger>
						</TabsList>
					</Tabs>
				</CardContent>
			</Card>

			{/* File List */}
			{filteredFiles.length === 0 ? (
				<Card>
					<CardContent className="py-12">
						<p className="text-center text-muted-foreground">파일이 없습니다.</p>
					</CardContent>
				</Card>
			) : (
				<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
					{/* File List */}
					<div className="lg:col-span-2 space-y-6">
						{/* Images */}
						{imageFiles.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle>이미지 ({imageFiles.length})</CardTitle>
									<CardDescription>업로드된 이미지 파일 목록입니다.</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
										{imageFiles.map((file) => (
											<div
												key={file.key}
												role="button"
												tabIndex={0}
												className="group relative aspect-square border rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
												onClick={() => setSelectedFile(file)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														setSelectedFile(file);
													}
												}}
											>
												<Image
													src={file.url}
													alt={file.name}
													fill
													className="object-cover"
													sizes="(max-width: 768px) 50vw, (max-width: 1200px) 33vw, 25vw"
												/>
												<div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
													<Button
														size="sm"
														variant="destructive"
														onClick={(e) => {
															e.stopPropagation();
															setFileToDelete(file);
															setDeleteDialogOpen(true);
														}}
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</div>
												{file.problemId && (
													<Badge className="absolute top-2 left-2 text-xs">#{file.problemId}</Badge>
												)}
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}

						{/* Regular Files */}
						{regularFiles.length > 0 && (
							<Card>
								<CardHeader>
									<CardTitle>파일 ({regularFiles.length})</CardTitle>
									<CardDescription>업로드된 일반 파일 목록입니다.</CardDescription>
								</CardHeader>
								<CardContent>
									<div className="space-y-2">
										{regularFiles.map((file) => (
											<div
												key={file.key}
												role="button"
												tabIndex={0}
												className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
												onClick={() => setSelectedFile(file)}
												onKeyDown={(e) => {
													if (e.key === "Enter" || e.key === " ") {
														e.preventDefault();
														setSelectedFile(file);
													}
												}}
											>
												<div className="flex items-center gap-3 flex-1 min-w-0">
													<FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
													<div className="min-w-0 flex-1">
														<p className="font-medium truncate">{file.name}</p>
														<div className="flex items-center gap-2 text-sm text-muted-foreground">
															<span>{formatFileSize(file.size)}</span>
															<span>•</span>
															<span>{formatDate(file.lastModified)}</span>
															{file.problemId && (
																<>
																	<span>•</span>
																	<Badge variant="secondary" className="text-xs">
																		#{file.problemId}
																	</Badge>
																</>
															)}
														</div>
													</div>
												</div>
												<Button
													size="sm"
													variant="ghost"
													onClick={(e) => {
														e.stopPropagation();
														setFileToDelete(file);
														setDeleteDialogOpen(true);
													}}
												>
													<Trash2 className="h-4 w-4" />
												</Button>
											</div>
										))}
									</div>
								</CardContent>
							</Card>
						)}
					</div>

					{/* File Details */}
					<div className="lg:col-span-1">
						{selectedFile ? (
							<Card className="sticky top-4">
								<CardHeader>
									<CardTitle>파일 정보</CardTitle>
									<CardDescription>선택한 파일의 상세 정보입니다.</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									{/* Preview */}
									{selectedFile.type === "image" && (
										<div className="relative aspect-video border rounded-lg overflow-hidden bg-muted">
											<Image
												src={selectedFile.url}
												alt={selectedFile.name}
												fill
												className="object-contain"
												sizes="(max-width: 768px) 100vw, 33vw"
											/>
										</div>
									)}

									{/* Info */}
									<div className="space-y-3 text-sm">
										<div>
											<p className="text-muted-foreground mb-1">파일명</p>
											<p className="font-medium break-all">{selectedFile.name}</p>
										</div>
										<div>
											<p className="text-muted-foreground mb-1">타입</p>
											<Badge>{selectedFile.type === "image" ? "이미지" : "파일"}</Badge>
										</div>
										<div>
											<p className="text-muted-foreground mb-1">크기</p>
											<p className="font-medium">{formatFileSize(selectedFile.size)}</p>
										</div>
										<div>
											<p className="text-muted-foreground mb-1">업로드 날짜</p>
											<p className="font-medium">{formatDate(selectedFile.lastModified)}</p>
										</div>
										{selectedFile.problemId && (
											<div>
												<p className="text-muted-foreground mb-1">문제 번호</p>
												<p className="font-medium">#{selectedFile.problemId}</p>
											</div>
										)}
										<div>
											<p className="text-muted-foreground mb-1">URL</p>
											<div className="flex items-center gap-2">
												<Input value={selectedFile.url} readOnly className="text-xs" />
												<Button
													size="icon"
													variant="ghost"
													onClick={() => copyToClipboard(selectedFile.url)}
												>
													<Copy className="h-4 w-4" />
												</Button>
											</div>
										</div>
									</div>

									{/* Actions */}
									<div className="space-y-2 pt-2">
										<div className="flex gap-2">
											<Button size="sm" variant="outline" className="flex-1" asChild>
												<a href={selectedFile.url} target="_blank" rel="noopener noreferrer">
													<ExternalLink className="h-4 w-4 mr-2" />
													열기
												</a>
											</Button>
											<Button size="sm" variant="outline" className="flex-1" asChild>
												<a href={selectedFile.url} download={selectedFile.name}>
													<Download className="h-4 w-4 mr-2" />
													다운로드
												</a>
											</Button>
										</div>
										<Button
											size="sm"
											variant="destructive"
											className="w-full"
											onClick={() => {
												setFileToDelete(selectedFile);
												setDeleteDialogOpen(true);
											}}
										>
											<Trash2 className="h-4 w-4 mr-2" />
											삭제
										</Button>
									</div>
								</CardContent>
							</Card>
						) : (
							<Card className="sticky top-4">
								<CardContent className="py-12">
									<p className="text-center text-muted-foreground">파일을 선택하세요</p>
								</CardContent>
							</Card>
						)}
					</div>
				</div>
			)}

			{/* Delete Confirmation Dialog */}
			<AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>파일 삭제</AlertDialogTitle>
						<AlertDialogDescription>
							정말로 이 파일을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
							{fileToDelete && (
								<span className="block mt-2 font-medium text-foreground">{fileToDelete.name}</span>
							)}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>취소</AlertDialogCancel>
						<AlertDialogAction
							onClick={() => fileToDelete && handleDelete(fileToDelete)}
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
						>
							삭제
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
