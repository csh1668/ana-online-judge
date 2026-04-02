"use client";

import { Columns2, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LayoutToggleProps {
	mode: "single" | "split";
	setMode: (mode: "single" | "split") => void;
	isNarrow: boolean;
}

export function LayoutToggle({ mode, setMode, isNarrow }: LayoutToggleProps) {
	if (isNarrow) return null;

	return (
		<div className="inline-flex items-center gap-1 rounded-lg border p-1">
			<Button
				variant={mode === "single" ? "default" : "ghost"}
				size="sm"
				className="h-7 px-2"
				onClick={() => setMode("single")}
			>
				<Square className="h-3.5 w-3.5" />
				{/* 단일 */}
			</Button>
			<Button
				variant={mode === "split" ? "default" : "ghost"}
				size="sm"
				className="h-7 px-2"
				onClick={() => setMode("split")}
			>
				<Columns2 className="h-3.5 w-3.5" />
				{/* 분할 */}
			</Button>
		</div>
	);
}
