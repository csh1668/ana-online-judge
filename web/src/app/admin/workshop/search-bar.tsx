"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";

export function WorkshopSearchBar() {
	const router = useRouter();
	const params = useSearchParams();
	const [value, setValue] = useState(params.get("q") ?? "");
	const [isPending, startTransition] = useTransition();

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				const next = new URLSearchParams(params.toString());
				if (value.trim()) next.set("q", value.trim());
				else next.delete("q");
				startTransition(() => router.push(`/admin/workshop?${next.toString()}`));
			}}
			className="flex gap-2 items-center max-w-md"
		>
			<Input
				placeholder="제목 또는 생성자 username 검색"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				disabled={isPending}
			/>
		</form>
	);
}
