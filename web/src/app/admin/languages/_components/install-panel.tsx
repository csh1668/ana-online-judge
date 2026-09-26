"use client";

import { Download, Loader2, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	installLanguageAction,
	resetLanguageInstallStateAction,
	uninstallLanguageAction,
} from "@/actions/admin/languages";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format-date";
import type { LanguageAdminRow } from "@/lib/services/languages";
import { ConfirmButton } from "./confirm-button";
import { InstallStateBadge } from "./install-state-badge";
import { errorMessage } from "./language-form-values";

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="space-y-1">
			<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
				{label}
			</div>
			<div className="font-mono text-sm">{children}</div>
		</div>
	);
}

export function InstallPanel({ row }: { row: LanguageAdminRow }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [liveLines, setLiveLines] = useState<string[] | null>(null);
	const [streaming, setStreaming] = useState(false);
	const esRef = useRef<EventSource | null>(null);
	const logRef = useRef<HTMLPreElement | null>(null);

	const isBuiltin = row.installScript === null;
	const isDeleted = row.deletedAt !== null;
	const installing = row.installState === "installing";

	const closeStream = useCallback(() => {
		esRef.current?.close();
		esRef.current = null;
		setStreaming(false);
	}, []);

	const openStream = useCallback(() => {
		esRef.current?.close();
		const es = new EventSource(`/api/admin/languages/${encodeURIComponent(row.id)}/install-log`);
		esRef.current = es;
		setStreaming(true);
		// 서버는 연결마다 저장된 로그부터 다시 보내므로, (재)연결 시 비운다.
		es.onopen = () => setLiveLines([]);
		// 401·비SSE 응답 등으로 영구 실패하면 EventSource가 CLOSED가 된다 — busy 상태를 풀어준다.
		es.onerror = () => {
			if (es.readyState === EventSource.CLOSED && esRef.current === es) closeStream();
		};
		es.addEventListener("log", (event) => {
			try {
				const { line } = JSON.parse((event as MessageEvent).data) as { line: string };
				setLiveLines((prev) => [...(prev ?? []), line]);
			} catch {
				// Bad JSON; skip
			}
		});
		es.addEventListener("done", () => {
			if (esRef.current === es) closeStream();
			else es.close();
			router.refresh();
		});
	}, [row.id, router, closeStream]);

	useEffect(() => {
		if (installing && !esRef.current) openStream();
	}, [installing, openStream]);

	useEffect(() => () => esRef.current?.close(), []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: liveLines triggers re-scroll on each new line
	useEffect(() => {
		const el = logRef.current;
		if (el) el.scrollTop = el.scrollHeight;
	}, [liveLines]);

	const run = (action: () => Promise<unknown>, success: string, stream: boolean) => {
		startTransition(async () => {
			try {
				await action();
				toast.success(success);
				if (stream) openStream();
				else closeStream();
				router.refresh();
			} catch (err) {
				toast.error(errorMessage(err, "요청에 실패했습니다."));
			}
		});
	};

	const lines = liveLines ?? (row.installLog ? row.installLog.split("\n") : []);
	const busy = isPending || installing || streaming;

	if (isBuiltin) {
		return (
			<p className="text-sm text-muted-foreground">
				이미지 내장 언어입니다. 툴체인이 judge 이미지에 포함되어 있어 설치가 필요 없습니다.
			</p>
		);
	}

	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-4">
				<Meta label="상태">
					<InstallStateBadge row={row} />
				</Meta>
				<Meta label="마지막 설치">
					{row.installedAt ? formatDateTime(row.installedAt, { timeZone: "Asia/Seoul" }) : "-"}
				</Meta>
				<Meta label="현재 해시">{row.currentHash ?? "-"}</Meta>
				<Meta label="설치 해시">{row.installedHash ?? "-"}</Meta>
			</div>

			{!isDeleted && (
				<div className="flex flex-wrap items-center gap-2">
					{(row.installState === "not_installed" || row.installState === "failed") && (
						<Button
							onClick={() => run(() => installLanguageAction(row.id), "설치를 시작했습니다.", true)}
							disabled={busy}
						>
							<Download className="mr-2 h-4 w-4" />
							설치
						</Button>
					)}
					{row.installState === "installed" && (
						<>
							<Button
								onClick={() =>
									run(() => installLanguageAction(row.id), "재설치를 시작했습니다.", true)
								}
								disabled={busy}
							>
								<RefreshCw className="mr-2 h-4 w-4" />
								재설치
							</Button>
							<ConfirmButton
								label="툴체인 제거"
								icon={<Trash2 className="mr-2 h-4 w-4" />}
								title="툴체인 제거"
								description="judge 볼륨에서 이 언어의 툴체인을 삭제하고 언어를 비활성화합니다. 다시 사용하려면 재설치해야 합니다."
								confirmLabel="제거"
								destructive
								disabled={busy}
								onConfirm={() =>
									run(() => uninstallLanguageAction(row.id), "툴체인 제거를 요청했습니다.", true)
								}
							/>
						</>
					)}
					{installing && (
						<ConfirmButton
							label="상태 초기화"
							icon={<RotateCcw className="mr-2 h-4 w-4" />}
							title="설치 상태 초기화"
							description="judge 작업이 유실되어 '설치 중'에서 멈춘 경우에만 사용하세요. 설치 로그를 지우고, 이전에 설치된 툴체인이 있으면 설치됨으로, 없으면 미설치로 되돌립니다. 실제로 설치가 진행 중이라면 결과가 뒤늦게 반영될 수 있습니다."
							confirmLabel="초기화"
							disabled={isPending}
							onConfirm={() =>
								run(
									() => resetLanguageInstallStateAction(row.id),
									"설치 상태를 초기화했습니다.",
									false
								)
							}
						/>
					)}
					{streaming && (
						<span className="flex items-center gap-2 text-sm text-muted-foreground">
							<Loader2 className="h-4 w-4 animate-spin" />
							로그 수신 중
						</span>
					)}
				</div>
			)}

			<div className="space-y-2">
				<div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
					설치 로그
				</div>
				<pre
					ref={logRef}
					className="max-h-[480px] min-h-[160px] overflow-auto rounded-[2px] border bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all"
				>
					{lines.length > 0 ? (
						lines.join("\n")
					) : (
						<span className="text-muted-foreground">
							{streaming ? "로그를 기다리는 중…" : "설치 로그가 없습니다."}
						</span>
					)}
				</pre>
			</div>
		</div>
	);
}
