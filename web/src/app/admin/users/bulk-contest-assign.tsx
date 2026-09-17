"use client";

import { Loader2, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkAssignContestByUsernames } from "@/actions/contest-accounts";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format-date";

interface ContestOption {
	id: number;
	title: string;
	startTime: Date;
	endTime: Date;
}

interface BulkContestAssignProps {
	contests: ContestOption[];
}

type AssignResult = Awaited<ReturnType<typeof bulkAssignContestByUsernames>>;

function formatRange(start: Date, end: Date) {
	return `${formatDate(start)} ~ ${formatDate(end)}`;
}

export function BulkContestAssign({ contests }: BulkContestAssignProps) {
	const [input, setInput] = useState("");
	const [contestId, setContestId] = useState<string>("");
	const [result, setResult] = useState<AssignResult | null>(null);
	const [isPending, startTransition] = useTransition();

	const handleAssign = () => {
		if (!input.trim()) {
			toast.error("사용자명을 입력해주세요.");
			return;
		}
		if (!contestId) {
			toast.error("대회를 선택해주세요.");
			return;
		}

		startTransition(async () => {
			try {
				const res = await bulkAssignContestByUsernames(input, Number(contestId));
				setResult(res);
				if (res.missing.length === 0) {
					toast.success(`${res.assigned.length}명을 대회 계정으로 지정했습니다.`);
					setInput("");
				} else if (res.assigned.length > 0) {
					toast.warning(
						`${res.assigned.length}명 지정, ${res.missing.length}명은 찾지 못했습니다.`
					);
				} else {
					toast.error("입력한 사용자명이 모두 존재하지 않습니다.");
				}
			} catch (err) {
				toast.error(err instanceof Error ? err.message : "지정 중 오류가 발생했습니다.");
			}
		});
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<Users className="h-4 w-4" />
				<span>대상 username을 한 줄에 하나씩(또는 쉼표 구분) 입력하세요.</span>
			</div>

			<div className="grid gap-3 sm:grid-cols-[1fr_280px]">
				<Textarea
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder={"alice\nbob\ncharlie"}
					rows={6}
					className="font-mono text-sm"
					disabled={isPending}
				/>
				<div className="space-y-3">
					<Select value={contestId} onValueChange={setContestId} disabled={isPending}>
						<SelectTrigger>
							<SelectValue placeholder="대회 선택" />
						</SelectTrigger>
						<SelectContent>
							{contests.length === 0 ? (
								<div className="px-2 py-1.5 text-sm text-muted-foreground">등록된 대회 없음</div>
							) : (
								contests.map((c) => (
									<SelectItem key={c.id} value={String(c.id)}>
										<div className="flex flex-col">
											<span>{c.title}</span>
											<span className="text-xs text-muted-foreground font-mono">
												#{c.id} · {formatRange(c.startTime, c.endTime)}
											</span>
										</div>
									</SelectItem>
								))
							)}
						</SelectContent>
					</Select>
					<Button onClick={handleAssign} disabled={isPending} className="w-full">
						{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						선택한 사용자에게 지정
					</Button>
				</div>
			</div>

			{result && (
				<div className="space-y-2 text-sm">
					{result.assigned.length > 0 && (
						<div>
							<p className="font-medium">지정 완료: {result.assigned.length}명</p>
							<p className="text-xs text-muted-foreground font-mono break-words">
								{result.assigned.join(", ")}
							</p>
						</div>
					)}
					{result.missing.length > 0 && (
						<div>
							<p className="font-medium text-destructive">
								찾을 수 없음: {result.missing.length}명
							</p>
							<p className="text-xs text-destructive font-mono break-words">
								{result.missing.join(", ")}
							</p>
						</div>
					)}
				</div>
			)}
		</div>
	);
}
