"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { ReviewBundleItem } from "@/lib/services/workshop-groups";

export function ReviewCard({ item }: { item: ReviewBundleItem }) {
	const [statementOpen, setStatementOpen] = useState(true);
	const [validatorOpen, setValidatorOpen] = useState(true);
	const [checkerOpen, setCheckerOpen] = useState(true);

	return (
		<section
			id={`problem-${item.problemId}`}
			className="rounded-lg border bg-card p-5 space-y-4 scroll-mt-24"
		>
			<header className="flex items-start justify-between gap-3 border-b pb-3">
				<div>
					<h3 className="text-lg font-semibold">
						#{item.problemId} {item.title}
					</h3>
					<p className="text-sm text-muted-foreground">
						작성자: {item.creator.name} ({item.creator.username}) · {item.problemType} ·{" "}
						{item.timeLimit}ms / {item.memoryLimit}MB
					</p>
				</div>
				<div className="flex items-center gap-2">
					{item.publishedProblemId !== null && (
						<span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-950 dark:text-blue-300">
							출판됨 #{item.publishedProblemId}
						</span>
					)}
					<Button asChild variant="outline" size="sm">
						<Link href={`/workshop/${item.problemId}`}>편집 →</Link>
					</Button>
				</div>
			</header>

			{!item.hasSnapshot && (
				<p className="text-sm text-muted-foreground italic">
					아직 커밋된 스냅샷이 없습니다. 본문은 현재 작업 상태(description)를 표시합니다.
				</p>
			)}

			<details
				open={statementOpen}
				onToggle={(e) => setStatementOpen((e.target as HTMLDetailsElement).open)}
			>
				<summary className="cursor-pointer text-sm font-medium select-none">지문</summary>
				<div className="mt-2 max-w-none whitespace-pre-wrap font-mono text-xs bg-muted/30 p-3 rounded">
					{item.statementMarkdown || "(빈 지문)"}
				</div>
			</details>

			{item.validator && (
				<details
					open={validatorOpen}
					onToggle={(e) => setValidatorOpen((e.target as HTMLDetailsElement).open)}
				>
					<summary className="cursor-pointer text-sm font-medium select-none">
						Validator ({item.validator.language})
					</summary>
					<pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-3 text-xs">
						<code>{item.validator.sourceCode}</code>
					</pre>
				</details>
			)}

			{item.checker && (
				<details
					open={checkerOpen}
					onToggle={(e) => setCheckerOpen((e.target as HTMLDetailsElement).open)}
				>
					<summary className="cursor-pointer text-sm font-medium select-none">
						Checker ({item.checker.language})
					</summary>
					<pre className="mt-2 overflow-x-auto rounded bg-muted/50 p-3 text-xs">
						<code>{item.checker.sourceCode}</code>
					</pre>
				</details>
			)}
		</section>
	);
}
