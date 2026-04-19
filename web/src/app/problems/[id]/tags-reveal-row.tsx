"use client";

import Link from "next/link";
import { useState } from "react";
import type { TagWithPath } from "@/lib/services/algorithm-tags";

interface TagsRevealRowProps {
	tags: TagWithPath[];
}

export function TagsRevealRow({ tags }: TagsRevealRowProps) {
	const [revealed, setRevealed] = useState(false);
	if (tags.length === 0) return null;
	return (
		<div className="flex gap-2 items-start">
			<dt className="text-muted-foreground shrink-0">알고리즘 분류</dt>
			<dd>
				{revealed ? (
					<div className="flex flex-wrap gap-1">
						{tags.map((tag) => (
							<Link
								key={tag.id}
								href={`/tags/${tag.id}`}
								className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs hover:bg-muted"
								title={tag.path.map((p) => p.name).join(" > ")}
							>
								{tag.name}
							</Link>
						))}
					</div>
				) : (
					<button
						type="button"
						onClick={() => setRevealed(true)}
						className="text-sm text-muted-foreground hover:text-foreground hover:underline cursor-pointer transition-colors"
					>
						보기
					</button>
				)}
			</dd>
		</div>
	);
}
