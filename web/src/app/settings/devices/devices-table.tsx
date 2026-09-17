"use client";

import { Button } from "@/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { revokeDeviceAction } from "./actions";

interface TokenRow {
	id: number;
	type: string;
	label: string | null;
	scopes: string[];
	expiresAt: Date;
	lastUsedAt: Date | null;
	createdAt: Date;
}

function fmt(d: Date | null): string {
	if (!d) return "—";
	return new Intl.DateTimeFormat("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(new Date(d));
}

export function DevicesTable({ tokens }: { tokens: TokenRow[] }) {
	if (tokens.length === 0) {
		return <p className="text-sm text-muted-foreground">연결된 앱이 없습니다.</p>;
	}
	return (
		<Table className="min-w-[860px]">
			<TableHeader>
				<TableRow>
					<TableHead>라벨</TableHead>
					<TableHead className="w-[100px]">타입</TableHead>
					<TableHead className="w-[160px]">마지막 사용</TableHead>
					<TableHead className="w-[160px]">만료</TableHead>
					<TableHead className="w-[160px]">발급일</TableHead>
					<TableHead className="w-[80px] text-right">액션</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{tokens.map((t) => (
					<TableRow key={t.id}>
						<TableCell className="font-medium truncate max-w-[260px]">{t.label ?? "—"}</TableCell>
						<TableCell>{t.type === "oauth_device" ? "외부 앱" : "PAT"}</TableCell>
						<TableCell className="text-muted-foreground text-sm">{fmt(t.lastUsedAt)}</TableCell>
						<TableCell className="text-muted-foreground text-sm">{fmt(t.expiresAt)}</TableCell>
						<TableCell className="text-muted-foreground text-sm">{fmt(t.createdAt)}</TableCell>
						<TableCell className="text-right">
							<form action={revokeDeviceAction}>
								<input type="hidden" name="tokenId" value={t.id} />
								<Button type="submit" variant="destructive" size="sm">
									회수
								</Button>
							</form>
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
