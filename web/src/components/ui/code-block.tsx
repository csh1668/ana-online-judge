"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
	children: React.ReactNode;
	className?: string;
	language?: string;
}

export function CodeBlock({ children, className, language }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		const text = extractTextFromChildren(children);

		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch (err) {
			console.error("Failed to copy:", err);
		}
	};

	return (
		<div className="relative group my-4">
			{language && (
				<div className="absolute top-0 left-4 px-2 py-0.5 text-xs text-muted-foreground bg-muted rounded-b border-x border-b border-border">
					{language}
				</div>
			)}
			<button
				type="button"
				onClick={handleCopy}
				className={cn(
					"absolute top-2 right-2 p-2 rounded-md transition-all",
					"bg-muted/80 hover:bg-muted border border-border",
					"opacity-0 group-hover:opacity-100 focus:opacity-100",
					"text-muted-foreground hover:text-foreground"
				)}
				aria-label={copied ? "복사됨" : "코드 복사"}
			>
				{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
			</button>
			<pre
				className={cn(
					"bg-muted p-4 rounded-lg overflow-x-auto text-sm",
					language && "pt-8",
					className
				)}
			>
				{children}
			</pre>
		</div>
	);
}

// children에서 텍스트 추출하는 헬퍼 함수
function extractTextFromChildren(children: React.ReactNode): string {
	if (typeof children === "string") {
		return children;
	}

	if (typeof children === "number") {
		return String(children);
	}

	if (Array.isArray(children)) {
		return children.map(extractTextFromChildren).join("");
	}

	if (children && typeof children === "object" && "props" in children) {
		const element = children as React.ReactElement<{ children?: React.ReactNode }>;
		return extractTextFromChildren(element.props.children);
	}

	return "";
}
