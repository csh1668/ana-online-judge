"use client";

import { useRouter, useSearchParams } from "next/navigation";
import {
	SourceTreeSelect,
	usePublicSourceTreeSelectFetchers,
} from "@/components/sources/source-tree-select";

export function SourcesFilterButton() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const current = searchParams.get("sourceId");
	const fetchers = usePublicSourceTreeSelectFetchers();

	return (
		<SourceTreeSelect
			mode="single"
			value={current ? Number.parseInt(current, 10) : null}
			onChange={(id) => {
				const params = new URLSearchParams(searchParams.toString());
				if (id === null) params.delete("sourceId");
				else params.set("sourceId", id.toString());
				params.delete("page");
				router.push(`/problems?${params.toString()}`);
			}}
			placeholder="출처로 필터"
			{...fetchers}
		/>
	);
}
