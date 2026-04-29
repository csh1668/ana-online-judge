"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

export function AdminSearchInput({
	paramKey = "q",
	placeholder = "검색...",
	className,
}: {
	paramKey?: string;
	placeholder?: string;
	className?: string;
}) {
	const router = useRouter();
	const searchParams = useSearchParams();
	const urlValue = searchParams.get(paramKey) ?? "";
	const [value, setValue] = useState(urlValue);
	const [, startTransition] = useTransition();
	// 마지막으로 우리가 URL에 직접 쓴 값. URL 외부 변경 vs 자기 변경을 구분.
	const lastWritten = useRef(urlValue);

	useEffect(() => {
		if (urlValue === lastWritten.current) return;
		lastWritten.current = urlValue;
		setValue(urlValue);
	}, [urlValue]);

	useEffect(() => {
		if (value === urlValue) return;
		const t = setTimeout(() => {
			const next = new URLSearchParams(searchParams.toString());
			if (value) next.set(paramKey, value);
			else next.delete(paramKey);
			next.set("page", "1");
			lastWritten.current = value;
			startTransition(() => router.replace(`?${next.toString()}`));
		}, 300);
		return () => clearTimeout(t);
	}, [value, urlValue, searchParams, paramKey, router]);

	return (
		<div className={`relative ${className ?? ""}`}>
			<Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
			<Input
				type="search"
				placeholder={placeholder}
				className="pl-8"
				value={value}
				onChange={(e) => setValue(e.target.value)}
			/>
		</div>
	);
}
