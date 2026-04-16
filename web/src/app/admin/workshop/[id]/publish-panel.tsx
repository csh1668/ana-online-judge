"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { WorkshopReadinessReturn } from "@/actions/admin/workshop";
import { publishWorkshopProblem, republishWorkshopProblem } from "@/actions/admin/workshop";
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

type Props = {
	workshopProblemId: number;
	readiness: WorkshopReadinessReturn;
	publishedProblemId: number | null;
};

export function PublishPanel({ workshopProblemId, readiness, publishedProblemId }: Props) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);

	const handlePublish = () => {
		setError(null);
		setSuccess(null);
		startTransition(async () => {
			try {
				const r = await publishWorkshopProblem(workshopProblemId);
				setSuccess(`problem #${r.problemId}으로 출판되었습니다.`);
				router.refresh();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	};

	const handleRepublish = () => {
		setError(null);
		setSuccess(null);
		startTransition(async () => {
			try {
				const r = await republishWorkshopProblem(workshopProblemId);
				setSuccess(`problem #${r.problemId}이 업데이트되었습니다.`);
				router.refresh();
			} catch (e) {
				setError(e instanceof Error ? e.message : String(e));
			}
		});
	};

	return (
		<div className="space-y-4">
			<div className="rounded-md border p-4 space-y-2">
				<h3 className="font-semibold flex items-center gap-2">
					출판 준비 체크리스트
					{readiness.ready ? (
						<CheckCircle2 className="h-5 w-5 text-green-600" />
					) : (
						<XCircle className="h-5 w-5 text-red-600" />
					)}
				</h3>
				{readiness.snapshotLabel ? (
					<p className="text-xs text-muted-foreground">
						대상 스냅샷: {readiness.snapshotLabel} (#{readiness.snapshotId})
					</p>
				) : (
					<p className="text-xs text-muted-foreground">커밋된 스냅샷이 없습니다.</p>
				)}
				{readiness.issues.length === 0 ? (
					<p className="text-sm text-green-700 flex items-center gap-2">
						<CheckCircle2 className="h-4 w-4" /> 모든 조건 충족.
					</p>
				) : (
					<ul className="space-y-1 text-sm">
						{readiness.issues.map((issue) => (
							<li key={issue.code} className="flex items-start gap-2 text-red-700">
								<XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
								<span>{issue.message}</span>
							</li>
						))}
					</ul>
				)}
			</div>

			{error && (
				<div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 whitespace-pre-wrap">
					{error}
				</div>
			)}
			{success && (
				<div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
					{success}
				</div>
			)}

			<div className="flex gap-2">
				{publishedProblemId === null ? (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button disabled={!readiness.ready || isPending}>문제로 전환</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>새 problem으로 출판하시겠습니까?</AlertDialogTitle>
								<AlertDialogDescription>
									최신 커밋 스냅샷을 기반으로 새 problem row가 생성됩니다. 출판 후에도 창작마당은
									그대로 유지됩니다.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>취소</AlertDialogCancel>
								<AlertDialogAction onClick={handlePublish}>확인</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				) : (
					<>
						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="destructive" disabled={!readiness.ready || isPending}>
									<AlertTriangle className="h-4 w-4 mr-2" />
									기존 problem 업데이트 (#{publishedProblemId})
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>
										기존 problem #{publishedProblemId}을 덮어쓰시겠습니까?
									</AlertDialogTitle>
									<AlertDialogDescription>
										기존 테스트케이스 + 체커 + 밸리데이터 + 이미지 파일이 모두 삭제되고 최신
										스냅샷으로 교체됩니다. problems.id는 유지되지만, 기존 제출/결과의 정합성을
										admin이 직접 확인해야 합니다.
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>취소</AlertDialogCancel>
									<AlertDialogAction
										onClick={handleRepublish}
										className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
									>
										덮어쓰기
									</AlertDialogAction>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>

						<AlertDialog>
							<AlertDialogTrigger asChild>
								<Button variant="outline" disabled={!readiness.ready || isPending}>
									새 problem으로 출판
								</Button>
							</AlertDialogTrigger>
							<AlertDialogContent>
								<AlertDialogHeader>
									<AlertDialogTitle>새 problem으로 출판하시겠습니까?</AlertDialogTitle>
									<AlertDialogDescription>
										기존 problem #{publishedProblemId}은 그대로 두고, 최신 스냅샷 기반으로 별도의 새
										problem을 만듭니다. 이 경우 먼저 DB에서 workshopProblems.publishedProblemId를
										null로 초기화한 뒤 시도하세요. (MVP에서는 이 경로는 미지원)
									</AlertDialogDescription>
								</AlertDialogHeader>
								<AlertDialogFooter>
									<AlertDialogCancel>닫기</AlertDialogCancel>
								</AlertDialogFooter>
							</AlertDialogContent>
						</AlertDialog>
					</>
				)}
			</div>
		</div>
	);
}
