"use client";

import { Textarea } from "@/components/ui/textarea";

interface InputPanelProps {
	value: string;
	onChange: (value: string) => void;
	label: string;
}

export function InputPanel({ value, onChange, label }: InputPanelProps) {
	return (
		<div className="h-full flex flex-col border rounded-md overflow-hidden bg-background">
			<div className="p-2 bg-muted/30 border-b text-xs font-semibold">{label}</div>
			<div className="flex-1 p-0">
				<Textarea
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="h-full w-full resize-none border-0 focus-visible:ring-0 rounded-none font-mono text-sm p-4"
					placeholder="프로그램 입력을 입력하세요..."
				/>
			</div>
		</div>
	);
}
