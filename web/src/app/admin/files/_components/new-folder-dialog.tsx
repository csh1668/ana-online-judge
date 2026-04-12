"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { createFolder } from "@/actions/file-manager";
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

interface NewFolderDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	currentPrefix: string;
	onCreated: () => void;
}

export function NewFolderDialog({
	open,
	onOpenChange,
	currentPrefix,
	onCreated,
}: NewFolderDialogProps) {
	const [name, setName] = useState("");
	const [loading, setLoading] = useState(false);

	const handleOpenChange = useCallback(
		(next: boolean) => {
			if (!next) {
				setName("");
			}
			onOpenChange(next);
		},
		[onOpenChange]
	);

	const handleCreate = useCallback(async () => {
		const trimmed = name.trim();
		if (!trimmed) return;
		setLoading(true);
		try {
			await createFolder(`${currentPrefix}${trimmed}/`);
			toast.success("폴더가 생성되었습니다.");
			setName("");
			onOpenChange(false);
			onCreated();
		} catch {
			toast.error("폴더 생성에 실패했습니다.");
		} finally {
			setLoading(false);
		}
	}, [name, currentPrefix, onOpenChange, onCreated]);

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>새 폴더</DialogTitle>
					<DialogDescription>/{currentPrefix}</DialogDescription>
				</DialogHeader>

				<Input
					placeholder="폴더 이름"
					value={name}
					onChange={(e) => setName(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.preventDefault();
							handleCreate();
						}
					}}
					disabled={loading}
					autoFocus
				/>

				<DialogFooter>
					<Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
						취소
					</Button>
					<Button onClick={handleCreate} disabled={!name.trim() || loading}>
						{loading ? (
							<>
								<Loader2 className="h-4 w-4 animate-spin" />
								생성 중...
							</>
						) : (
							"생성"
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
