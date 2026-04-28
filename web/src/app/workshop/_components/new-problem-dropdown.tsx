"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type Group = { id: number; name: string };

export function NewProblemDropdown({
	groups,
	personalDisabled,
	personalDisabledReason,
}: {
	groups: Group[];
	personalDisabled: boolean;
	personalDisabledReason?: string;
}) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button>
					새 문제 만들기
					<ChevronDown className="ml-1 h-4 w-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-64">
				<DropdownMenuItem asChild disabled={personalDisabled}>
					{personalDisabled ? (
						<span className="text-muted-foreground text-sm px-2 py-1.5">
							{personalDisabledReason ?? "한도 초과"}
						</span>
					) : (
						<Link href="/workshop/new">새 개인 문제</Link>
					)}
				</DropdownMenuItem>
				{groups.length > 0 && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuLabel>그룹에서 만들기</DropdownMenuLabel>
						{groups.map((g) => (
							<DropdownMenuItem key={g.id} asChild>
								<Link href={`/workshop/new?group=${g.id}`}>{g.name}</Link>
							</DropdownMenuItem>
						))}
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
