"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createWorkshopProblem } from "@/actions/workshop/problems";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export function NewWorkshopProblemForm() {
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const [title, setTitle] = useState("");
	const [problemType, setProblemType] = useState<"icpc" | "special_judge">("icpc");
	const [timeLimit, setTimeLimit] = useState(1000);
	const [memoryLimit, setMemoryLimit] = useState(512);

	function onSubmit(e: React.FormEvent) {
		e.preventDefault();
		setError(null);
		startTransition(async () => {
			try {
				const created = await createWorkshopProblem({
					title,
					problemType,
					timeLimit,
					memoryLimit,
				});
				router.push(`/workshop/${created.id}`);
			} catch (err) {
				setError(err instanceof Error ? err.message : "문제 생성에 실패했습니다");
			}
		});
	}

	return (
		<form onSubmit={onSubmit} className="space-y-4">
			<div>
				<Label htmlFor="title">제목</Label>
				<Input
					id="title"
					value={title}
					onChange={(e) => setTitle(e.target.value)}
					required
					maxLength={200}
				/>
			</div>
			<div>
				<Label htmlFor="problemType">문제 타입</Label>
				<Select
					value={problemType}
					onValueChange={(v) => setProblemType(v as "icpc" | "special_judge")}
				>
					<SelectTrigger id="problemType">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="icpc">ICPC (stdout 비교)</SelectItem>
						<SelectItem value="special_judge">Special Judge (커스텀 체커)</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<div className="grid grid-cols-2 gap-4">
				<div>
					<Label htmlFor="timeLimit">시간 제한 (ms)</Label>
					<Input
						id="timeLimit"
						type="number"
						min={100}
						max={10000}
						value={timeLimit}
						onChange={(e) => setTimeLimit(Number.parseInt(e.target.value, 10))}
						required
					/>
				</div>
				<div>
					<Label htmlFor="memoryLimit">메모리 제한 (MB)</Label>
					<Input
						id="memoryLimit"
						type="number"
						min={16}
						max={2048}
						value={memoryLimit}
						onChange={(e) => setMemoryLimit(Number.parseInt(e.target.value, 10))}
						required
					/>
				</div>
			</div>
			{error && <p className="text-sm text-destructive">{error}</p>}
			<div className="flex justify-end gap-2">
				<Button type="button" variant="ghost" onClick={() => router.push("/workshop")}>
					취소
				</Button>
				<Button type="submit" disabled={pending || !title.trim()}>
					{pending ? "생성 중..." : "생성"}
				</Button>
			</div>
		</form>
	);
}
