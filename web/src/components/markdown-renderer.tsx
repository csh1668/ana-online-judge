"use client";

import "katex/dist/katex.min.css";

import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";

const sanitizeSchema = {
	...defaultSchema,
	attributes: {
		...defaultSchema.attributes,
		"*": [...(defaultSchema.attributes?.["*"] || []), "style", "className", "class"],
	},
	tagNames: [...(defaultSchema.tagNames || []), "style"],
};

import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
	content: string;
	className?: string;
	/**
	 * 인라인 모드. 단락/헤딩 래핑 없이 텍스트 + 수식만 렌더한다.
	 * 제목처럼 블록 요소가 바람직하지 않은 곳에 사용.
	 */
	inline?: boolean;
}

export function MarkdownRenderer({ content, className, inline = false }: MarkdownRendererProps) {
	if (inline) {
		return (
			<span className={className}>
				<ReactMarkdown
					remarkPlugins={[remarkGfm, remarkMath]}
					rehypePlugins={[
						rehypeRaw,
						[rehypeSanitize, sanitizeSchema],
						rehypeKatex,
						rehypeHighlight,
					]}
					components={{
						p: ({ children }) => <>{children}</>,
						h1: ({ children }) => <>{children}</>,
						h2: ({ children }) => <>{children}</>,
						h3: ({ children }) => <>{children}</>,
						h4: ({ children }) => <>{children}</>,
						h5: ({ children }) => <>{children}</>,
						h6: ({ children }) => <>{children}</>,
					}}
				>
					{content}
				</ReactMarkdown>
			</span>
		);
	}
	return (
		<div className={cn("prose prose-neutral dark:prose-invert max-w-none", className)}>
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkMath]}
				rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex, rehypeHighlight]}
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
					pre: ({ children, ...props }) => {
						// children이 <code> 엘리먼트가 아닌 경우(원시 HTML <pre>)는 그대로 렌더
						const codeChild = children as React.ReactElement<{
							className?: string;
							children?: React.ReactNode;
						}>;
						const isCodeChild =
							codeChild &&
							typeof codeChild === "object" &&
							"props" in codeChild &&
							codeChild.props != null;

						if (!isCodeChild) {
							return (
								<pre
									className="bg-muted p-4 rounded-md overflow-x-auto my-4 font-mono text-sm"
									{...props}
								>
									{children}
								</pre>
							);
						}

						const className = codeChild.props?.className || "";
						const language = className.replace(/language-/, "") || undefined;

						return (
							<CodeBlock language={language}>
								<code className={cn("font-mono", className)}>{codeChild.props?.children}</code>
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
					a: ({ href, children }) => {
						// 파일 다운로드 링크인지 확인
						const isFileDownload = href?.startsWith("/api/files/");
						const fileName = isFileDownload && typeof children === "string" ? children : undefined;

						return (
							<a
								href={href}
								className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
								target="_blank"
								rel="noopener noreferrer"
								{...(isFileDownload && fileName ? { download: fileName } : {})}
							>
								{children}
							</a>
						);
					},

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
					img: ({ src, alt, width, height, style }) => (
						// biome-ignore lint/performance/noImgElement: src can be blob
						<img
							src={src}
							alt={alt || ""}
							width={width}
							height={height}
							style={{ maxWidth: "100%", height: "auto", ...(style as React.CSSProperties) }}
							className="inline-block rounded-lg my-4"
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
