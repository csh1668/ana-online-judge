"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteUpdateNoteAction } from "@/actions/update-notes";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PaginationLinks } from "@/components/ui/pagination-links";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { UpdateNote } from "@/db/schema";
import { formatDateTime } from "@/lib/format-date";

type Props = {
	notes: UpdateNote[];
	currentPage: number;
	totalPages: number;
};

export function UpdateNotesManager({ notes, currentPage, totalPages }: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const handleDelete = (note: UpdateNote) => {
		startTransition(async () => {
			try {
				await deleteUpdateNoteAction(note.id);
				toast.success("업데이트 내역을 삭제했습니다.");
				router.refresh();
			} catch (error) {
				toast.error(error instanceof Error ? error.message : "삭제에 실패했습니다.");
			}
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex justify-end">
				<Button asChild>
					<Link href="/admin/updates/new">
						<Plus className="mr-2 h-4 w-4" />새 업데이트
					</Link>
				</Button>
			</div>

			<Card>
				<CardContent>
					{notes.length === 0 ? (
						<EmptyState>등록된 업데이트 내역이 없습니다.</EmptyState>
					) : (
						<Table className="min-w-[800px]">
							<TableHeader>
								<TableRow>
									<TableHead className="w-[80px]">#</TableHead>
									<TableHead>제목</TableHead>
									<TableHead className="w-[180px]">업데이트 시간</TableHead>
									<TableHead className="w-[180px]">작성 시간</TableHead>
									<TableHead className="w-[120px] text-right">관리</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{notes.map((note) => (
									<TableRow key={note.id}>
										<TableCell className="font-mono text-xs">{note.id}</TableCell>
										<TableCell>
											<div className="block truncate" title={note.title}>
												{note.title}
											</div>
										</TableCell>
										<TableCell className="font-mono text-xs">
											{formatDateTime(note.publishedAt, { timeZone: "Asia/Seoul" })}
										</TableCell>
										<TableCell className="font-mono text-xs text-muted-foreground">
											{formatDateTime(note.createdAt, { timeZone: "Asia/Seoul" })}
										</TableCell>
										<TableCell className="text-right">
											<Button variant="ghost" size="icon" asChild aria-label="편집">
												<Link href={`/admin/updates/${note.id}/edit`}>
													<Pencil className="h-4 w-4" />
												</Link>
											</Button>
											<AlertDialog>
												<AlertDialogTrigger asChild>
													<Button
														variant="ghost"
														size="icon"
														disabled={isPending}
														className="text-destructive hover:text-destructive"
														aria-label="삭제"
													>
														<Trash2 className="h-4 w-4" />
													</Button>
												</AlertDialogTrigger>
												<AlertDialogContent>
													<AlertDialogHeader>
														<AlertDialogTitle>업데이트 내역 삭제</AlertDialogTitle>
														<AlertDialogDescription>
															<span className="font-semibold text-foreground">{note.title}</span>
															을(를) 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
														</AlertDialogDescription>
													</AlertDialogHeader>
													<AlertDialogFooter>
														<AlertDialogCancel>취소</AlertDialogCancel>
														<AlertDialogAction
															onClick={() => handleDelete(note)}
															className="bg-destructive hover:bg-destructive/90"
														>
															삭제
														</AlertDialogAction>
													</AlertDialogFooter>
												</AlertDialogContent>
											</AlertDialog>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>

			{notes.length > 0 && (
				<PaginationLinks
					currentPage={currentPage}
					totalPages={totalPages}
					buildHref={(p) => `/admin/updates?page=${p}`}
				/>
			)}
		</div>
	);
}
