"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
	content: string;
	className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
	return (
		<div className={cn("prose prose-neutral dark:prose-invert max-w-none", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeKatex, rehypeHighlight]}
				components={{
					// 제목 스타일링
					h1: ({ children }) => (
						<h1 className="text-2xl font-bold mt-6 mb-4 border-b pb-2">{children}</h1>
					),
					h2: ({ children }) => (
						<h2 className="text-xl font-semibold mt-6 mb-3 border-b pb-2">{children}</h2>
					),
					h3: ({ children }) => <h3 className="text-lg font-semibold mt-6 mb-2">{children}</h3>,
					h4: ({ children }) => <h4 className="text-base font-semibold mt-4 mb-2">{children}</h4>,

					// 단락
					p: ({ children }) => <p className="my-4 leading-7">{children}</p>,

					// 코드 블록
					pre: ({ children }) => {
						// children에서 언어 정보 추출
						const codeChild = children as React.ReactElement<{
							className?: string;
							children?: React.ReactNode;
						}>;
						const className = codeChild?.props?.className || "";
						const language = className.replace(/language-/, "") || undefined;

						return (
							<CodeBlock language={language}>
								<code className={cn("font-mono", className)}>{codeChild?.props?.children}</code>
							</CodeBlock>
						);
					},
					code: ({ className, children, ...props }) => {
						const isInline = !className;
						if (isInline) {
							return (
								<code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono" {...props}>
									{children}
								</code>
							);
						}
						// 블록 코드는 pre에서 처리하므로 여기서는 그냥 반환
						return (
							<code className={cn("font-mono", className)} {...props}>
								{children}
							</code>
						);
					},

					// 리스트
					ul: ({ children }) => <ul className="list-disc pl-6 my-4 space-y-1">{children}</ul>,
					ol: ({ children }) => <ol className="list-decimal pl-6 my-4 space-y-1">{children}</ol>,
					li: ({ children }) => <li className="leading-7">{children}</li>,

					// 링크
					a: ({ href, children }) => (
						<a
							href={href}
							className="text-primary hover:underline"
							target="_blank"
							rel="noopener noreferrer"
						>
							{children}
						</a>
					),

					// 인용
					blockquote: ({ children }) => (
						<blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-4 text-muted-foreground">
							{children}
						</blockquote>
					),

					// 테이블
					table: ({ children }) => (
						<div className="overflow-x-auto my-4">
							<table className="w-full border-collapse border border-border">{children}</table>
						</div>
					),
					thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
					th: ({ children }) => (
						<th className="border border-border px-4 py-2 text-left font-semibold">{children}</th>
					),
					td: ({ children }) => <td className="border border-border px-4 py-2">{children}</td>,

					// 수평선
					hr: () => <hr className="my-8 border-border" />,

					// 이미지
					img: ({ src, alt }) => (
						<img
							src={src}
							alt={alt || ""}
							className="max-w-full h-auto rounded-lg my-4"
							loading="lazy"
						/>
					),

					// 강조
					strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
					em: ({ children }) => <em className="italic">{children}</em>,
				}}
			>
				{content}
			</ReactMarkdown>
		</div>
	);
}
