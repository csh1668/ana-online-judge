"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { HeatmapData } from "@/lib/services/user-stats";

const CELL_SIZE = 13;
const CELL_GAP = 3;
const WEEKS = 53;
const DAYS = 7;

const LEVELS = [
	"var(--color-muted)",
	"hsl(142, 43%, 54%)",
	"hsl(142, 55%, 40%)",
	"hsl(142, 68%, 28%)",
];

function getLevel(count: number): number {
	if (count === 0) return 0;
	if (count === 1) return 1;
	if (count <= 3) return 2;
	return 3;
}

export function ProfileHeatmap({ data }: { data: HeatmapData }) {
	const [tooltip, setTooltip] = useState<{
		x: number;
		y: number;
		date: string;
		count: number;
	} | null>(null);

	const { cells, months } = useMemo(() => {
		const map = new Map(data.map((d) => [d.date, d.count]));
		const today = new Date();
		const cells: { x: number; y: number; date: string; count: number }[] = [];

		const start = new Date(today);
		start.setFullYear(start.getFullYear() - 1);
		start.setDate(start.getDate() - start.getDay());

		const monthLabels: { label: string; x: number }[] = [];
		let lastMonth = -1;

		for (let week = 0; week < WEEKS; week++) {
			for (let day = 0; day < DAYS; day++) {
				const d = new Date(start);
				d.setDate(d.getDate() + week * 7 + day);
				if (d > today) continue;

				const dateStr = d.toISOString().slice(0, 10);
				const count = map.get(dateStr) ?? 0;
				const x = week * (CELL_SIZE + CELL_GAP);
				const y = day * (CELL_SIZE + CELL_GAP);

				cells.push({ x, y, date: dateStr, count });

				if (d.getMonth() !== lastMonth && day === 0) {
					lastMonth = d.getMonth();
					monthLabels.push({
						label: d.toLocaleDateString("ko-KR", { month: "short" }),
						x,
					});
				}
			}
		}

		return { cells, months: monthLabels };
	}, [data]);

	const svgWidth = WEEKS * (CELL_SIZE + CELL_GAP);
	const svgHeight = DAYS * (CELL_SIZE + CELL_GAP) + 20;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">풀이 히트맵</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="overflow-x-auto">
					<svg
						width={svgWidth}
						height={svgHeight}
						className="block"
						role="img"
						aria-label="풀이 히트맵"
					>
						{months.map((m) => (
							<text
								key={`${m.label}-${m.x}`}
								x={m.x}
								y={12}
								className="fill-muted-foreground"
								fontSize={11}
							>
								{m.label}
							</text>
						))}
						{cells.map((cell) => (
							// biome-ignore lint/a11y/noStaticElementInteractions: SVG rect tooltip
							<rect
								key={cell.date}
								x={cell.x}
								y={cell.y + 18}
								width={CELL_SIZE}
								height={CELL_SIZE}
								rx={2}
								fill={LEVELS[getLevel(cell.count)]}
								className="cursor-pointer"
								onMouseEnter={(e) => {
									const rect = e.currentTarget.getBoundingClientRect();
									setTooltip({
										x: rect.left,
										y: rect.top,
										date: cell.date,
										count: cell.count,
									});
								}}
								onMouseLeave={() => setTooltip(null)}
							/>
						))}
					</svg>
				</div>
				{tooltip && (
					<div
						className="fixed z-50 px-2 py-1 text-xs rounded bg-popover text-popover-foreground border shadow-md pointer-events-none"
						style={{ left: tooltip.x, top: tooltip.y - 30 }}
					>
						{tooltip.date}: {tooltip.count}문제 AC
					</div>
				)}
			</CardContent>
		</Card>
	);
}
