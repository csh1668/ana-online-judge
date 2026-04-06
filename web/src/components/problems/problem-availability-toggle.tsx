"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export function ProblemAvailabilityToggle() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const includeUnavailable = searchParams.get("includeUnavailable") === "1";

	const handleToggle = () => {
		const params = new URLSearchParams(searchParams);
		if (includeUnavailable) {
			params.delete("includeUnavailable");
		} else {
			params.set("includeUnavailable", "1");
		}
		params.set("page", "1");
		router.push(`?${params.toString()}`);
	};

	return (
		<button
			type="button"
			onClick={handleToggle}
			className={cn(
				"px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap",
				includeUnavailable
					? "bg-primary text-primary-foreground"
					: "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
			)}
			title="채점 준비 중인 문제도 함께 표시합니다"
		>
			채점 준비 중 포함
		</button>
	);
}
