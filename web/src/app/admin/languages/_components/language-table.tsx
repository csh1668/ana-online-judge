"use client";

import { Check, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { restoreLanguageAction } from "@/actions/admin/languages";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import type { LanguageAdminRow } from "@/lib/services/languages";
import { cn } from "@/lib/utils";
import { InstallStateBadge } from "./install-state-badge";
import { errorMessage } from "./language-form-values";

type Props = { rows: LanguageAdminRow[]; showDeleted: boolean };

export function LanguageTable({ rows, showDeleted }: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const handleRestore = (row: LanguageAdminRow) => {
		startTransition(async () => {
			try {
				await restoreLanguageAction(row.id);
				toast.success(`${row.label}을(를) 복구했습니다. 다시 활성화해 주세요.`);
				router.refresh();
			} catch (err) {
				toast.error(errorMessage(err, "복구에 실패했습니다."));
			}
		});
	};

	if (rows.length === 0) return <EmptyState>등록된 언어가 없습니다.</EmptyState>;

	return (
		<Table className={showDeleted ? "min-w-[1000px]" : "min-w-[900px]"}>
			<TableHeader>
				<TableRow>
					<TableHead>라벨</TableHead>
					<TableHead className="w-[140px]">ID</TableHead>
					<TableHead className="w-[160px]">버전</TableHead>
					<TableHead className="w-[80px]">활성</TableHead>
					<TableHead className="w-[200px]">설치 상태</TableHead>
					<TableHead className="w-[80px]">정렬</TableHead>
					{showDeleted && <TableHead className="w-[100px] text-right">관리</TableHead>}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => {
					const deleted = row.deletedAt !== null;
					return (
						<TableRow key={row.id} className={cn(deleted && "text-muted-foreground")}>
							<TableCell>
								<Link
									href={`/admin/languages/${row.id}`}
									className="block truncate font-medium hover:underline"
									title={row.label}
								>
									{row.label}
								</Link>
							</TableCell>
							<TableCell className="font-mono text-xs">{row.id}</TableCell>
							<TableCell className="font-mono text-xs">
								<div className="block truncate" title={row.version}>
									{row.version || "-"}
								</div>
							</TableCell>
							<TableCell>
								{row.enabled ? (
									<Check className="h-4 w-4 text-(--verdict-accepted)" aria-label="활성" />
								) : (
									<span className="text-muted-foreground">-</span>
								)}
							</TableCell>
							<TableCell>
								<InstallStateBadge row={row} />
							</TableCell>
							<TableCell className="font-mono text-xs">{row.sortOrder}</TableCell>
							{showDeleted && (
								<TableCell className="text-right">
									{deleted && (
										<Button
											variant="ghost"
											size="sm"
											disabled={isPending}
											onClick={() => handleRestore(row)}
										>
											<RotateCcw className="mr-1 h-4 w-4" />
											복구
										</Button>
									)}
								</TableCell>
							)}
						</TableRow>
					);
				})}
			</TableBody>
		</Table>
	);
}
