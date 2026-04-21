"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

function findLastExampleNumber(content: string): number {
	let max = 0;
	for (const match of content.matchAll(/## 예제 입력 (\d+)/g)) {
		const n = parseInt(match[1], 10);
		if (!Number.isNaN(n) && n > max) max = n;
	}
	return max;
}

function buildExampleBlock(n: number, input: string, output: string): string {
	const trimmedInput = input.replace(/^\n+|\n+$/g, "");
	const trimmedOutput = output.replace(/^\n+|\n+$/g, "");
	return [
		`## 예제 입력 ${n}`,
		"```",
		trimmedInput,
		"```",
		"",
		`## 예제 출력 ${n}`,
		"```",
		trimmedOutput,
		"```",
	].join("\n");
}

function appendExample(content: string, block: string): string {
	const trimmed = content.replace(/\s+$/, "");
	if (trimmed.length === 0) return `${block}\n`;
	return `${trimmed}\n\n${block}\n`;
}

type Props = {
	currentContent: string;
	onAppend: (nextContent: string) => void;
};

export function AddExampleDialog({ currentContent, onAppend }: Props) {
	const [open, setOpen] = useState(false);
	const [input, setInput] = useState("");
	const [output, setOutput] = useState("");

	const nextNumber = findLastExampleNumber(currentContent) + 1;

	function reset() {
		setInput("");
		setOutput("");
	}

	function handleSubmit() {
		if (!input.trim() || !output.trim()) return;
		const block = buildExampleBlock(nextNumber, input, output);
		onAppend(appendExample(currentContent, block));
		reset();
		setOpen(false);
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(next) => {
				setOpen(next);
				if (!next) reset();
			}}
		>
			<DialogTrigger asChild>
				<Button type="button" variant="secondary" size="sm">
					+ 테스트케이스 추가 (예제 {nextNumber})
				</Button>
			</DialogTrigger>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>예제 {nextNumber} 추가</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<div>
						<Label>입력</Label>
						<Textarea
							value={input}
							onChange={(e) => setInput(e.target.value)}
							placeholder="예제 입력 내용을 붙여넣으세요"
							className="min-h-[140px] font-mono"
						/>
					</div>
					<div>
						<Label>출력</Label>
						<Textarea
							value={output}
							onChange={(e) => setOutput(e.target.value)}
							placeholder="예제 출력 내용을 붙여넣으세요"
							className="min-h-[140px] font-mono"
						/>
					</div>
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => setOpen(false)}>
						취소
					</Button>
					<Button type="button" onClick={handleSubmit} disabled={!input.trim() || !output.trim()}>
						본문 끝에 추가
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
