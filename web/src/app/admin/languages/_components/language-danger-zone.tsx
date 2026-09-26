"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteLanguageAction, restoreLanguageAction } from "@/actions/admin/languages";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "./confirm-button";
import { errorMessage } from "./language-form-values";

type Props = { id: string; label: string; deleted: boolean };

export function LanguageDangerZone({ id, label, deleted }: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const run = (action: () => Promise<void>, success: string, redirect?: string) => {
		startTransition(async () => {
			try {
				await action();
				toast.success(success);
				if (redirect) router.push(redirect);
				else router.refresh();
			} catch (err) {
				toast.error(errorMessage(err, "요청에 실패했습니다."));
			}
		});
	};

	if (deleted) {
		return (
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-sm text-muted-foreground">
					삭제된 언어입니다. 복구하면 비활성 상태로 되돌아오며, 설치 스크립트가 있으면 다시 설치해야
					합니다.
				</p>
				<Button
					variant="outline"
					disabled={isPending}
					onClick={() => run(() => restoreLanguageAction(id), `${label}을(를) 복구했습니다.`)}
				>
					<RotateCcw className="mr-2 h-4 w-4" />
					복구
				</Button>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<p className="text-sm text-muted-foreground">
				언어를 삭제하면 제출 언어 목록에서 사라지고 설치된 툴체인도 제거됩니다. 기존 제출 기록은
				유지되며, 삭제된 언어는 목록의 &quot;삭제됨 보기&quot;에서 복구할 수 있습니다.
			</p>
			<ConfirmButton
				label="언어 삭제"
				icon={<Trash2 className="mr-2 h-4 w-4" />}
				title="언어 삭제"
				description={
					<>
						<span className="font-semibold text-foreground">{label}</span>을(를) 삭제하시겠습니까?
						설치된 툴체인도 제거됩니다.
					</>
				}
				confirmLabel="삭제"
				destructive
				disabled={isPending}
				onConfirm={() =>
					run(() => deleteLanguageAction(id), `${label}을(를) 삭제했습니다.`, "/admin/languages")
				}
			/>
		</div>
	);
}
