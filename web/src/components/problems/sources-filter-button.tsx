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
	const currentParsed = current ? Number.parseInt(current, 10) : Number.NaN;
	const currentValue = Number.isFinite(currentParsed) ? currentParsed : null;
	const fetchers = usePublicSourceTreeSelectFetchers();

	return (
		<SourceTreeSelect
			mode="single"
			value={currentValue}
			onChange={(id) => {
				const params = new URLSearchParams(searchParams.toString());
				if (id === null) params.delete("sourceId");
				else params.set("sourceId", id.toString());
				params.delete("page");
				const qs = params.toString();
				router.push(qs ? `/problems?${qs}` : "/problems");
			}}
			placeholder="출처로 필터"
			{...fetchers}
		/>
	);
}
