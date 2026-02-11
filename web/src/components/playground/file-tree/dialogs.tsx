"use client";

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
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import type { CreateDialogType } from "./types";

interface CreateItemDialogProps {
	type: CreateDialogType;
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	folder: string;
	onFolderChange: (folder: string) => void;
	name: string;
	onNameChange: (name: string) => void;
	onSubmit: () => void;
	allFolders: string[];
}

export function CreateItemDialog({
	type,
	isOpen,
	onOpenChange,
	folder,
	onFolderChange,
	name,
	onNameChange,
	onSubmit,
	allFolders,
}: CreateItemDialogProps) {
	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{type === "file" ? "새 파일 생성" : "새 폴더 생성"}</DialogTitle>
				</DialogHeader>
				<div className="py-4 space-y-4">
					<div className="space-y-2">
						<Label htmlFor="location">위치</Label>
						<Select value={folder} onValueChange={onFolderChange}>
							<SelectTrigger id="location">
								<SelectValue placeholder="위치 선택" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="__root__">(루트)</SelectItem>
								{allFolders
									.filter((f) => f !== "__root__")
									.map((f) => (
										<SelectItem key={f} value={f}>
											{f}
										</SelectItem>
									))}
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="name">{type === "file" ? "파일 이름" : "폴더 이름"}</Label>
						<Input
							id="name"
							placeholder={type === "file" ? "filename.ext" : "foldername"}
							value={name}
							onChange={(e) => onNameChange(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && onSubmit()}
							autoFocus
						/>
					</div>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						취소
					</Button>
					<Button onClick={onSubmit}>생성</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface RenameDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	name: string;
	onNameChange: (name: string) => void;
	onSubmit: () => void;
}

export function RenameDialog({
	isOpen,
	onOpenChange,
	name,
	onNameChange,
	onSubmit,
}: RenameDialogProps) {
	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>이름 변경</DialogTitle>
				</DialogHeader>
				<div className="py-4">
					<Input
						placeholder="새 이름"
						value={name}
						onChange={(e) => onNameChange(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && onSubmit()}
						autoFocus
					/>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						취소
					</Button>
					<Button onClick={onSubmit}>변경</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

interface ExtractConflictDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	conflicts: string[];
	onConfirm: () => void;
}

export function ExtractConflictDialog({
	isOpen,
	onOpenChange,
	conflicts,
	onConfirm,
}: ExtractConflictDialogProps) {
	return (
		<AlertDialog open={isOpen} onOpenChange={onOpenChange}>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>파일 충돌</AlertDialogTitle>
					<AlertDialogDescription>
						다음 파일들이 이미 존재합니다:
						<ul className="list-disc list-inside mt-2 max-h-48 overflow-auto">
							{conflicts.map((path) => (
								<li key={path} className="text-xs">
									{path}
								</li>
							))}
						</ul>
						덮어쓰시겠습니까?
					</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel onClick={() => onOpenChange(false)}>취소</AlertDialogCancel>
					<AlertDialogAction onClick={onConfirm}>덮어쓰기</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
