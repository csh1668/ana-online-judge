"use client";

import { Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

export function WorkshopSearch() {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const [search, setSearch] = useState(searchParams.get("q") || "");

	useEffect(() => {
		setSearch(searchParams.get("q") || "");
	}, [searchParams]);

	useEffect(() => {
		const timer = setTimeout(() => {
			const currentSearch = searchParams.get("q") || "";
			if (search !== currentSearch) {
				const params = new URLSearchParams(searchParams);
				if (search) {
					params.set("q", search);
				} else {
					params.delete("q");
				}
				const query = params.toString();
				router.replace(query ? `${pathname}?${query}` : pathname);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [search, router, pathname, searchParams]);

	return (
		<div className="relative flex-1 max-w-sm">
			<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input
				type="search"
				placeholder="제목 검색..."
				className="pl-8"
				value={search}
				onChange={(e) => setSearch(e.target.value)}
			/>
		</div>
	);
}
