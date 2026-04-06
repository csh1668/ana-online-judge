"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LANGUAGES } from "@/lib/languages";
import type { LanguageStatsItem } from "@/lib/services/user-stats";

const COLORS = [
	"hsl(210, 76%, 55%)",
	"hsl(142, 55%, 45%)",
	"hsl(38, 92%, 55%)",
	"hsl(0, 72%, 55%)",
	"hsl(262, 52%, 55%)",
	"hsl(180, 55%, 45%)",
	"hsl(25, 85%, 55%)",
	"hsl(330, 65%, 55%)",
];

export function ProfileLanguageChart({ data }: { data: LanguageStatsItem[] }) {
	if (data.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg">언어별 분포</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-muted-foreground text-sm text-center py-8">
						아직 풀이 기록이 없습니다
					</p>
				</CardContent>
			</Card>
		);
	}

	const chartData = data.map((item) => ({
		name: LANGUAGES[item.language as keyof typeof LANGUAGES]?.label ?? item.language,
		value: item.count,
	}));

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">언어별 분포</CardTitle>
			</CardHeader>
			<CardContent>
				<ResponsiveContainer width="100%" height={200}>
					<PieChart>
						<Pie
							data={chartData}
							cx="50%"
							cy="50%"
							innerRadius={50}
							outerRadius={80}
							paddingAngle={2}
							dataKey="value"
						>
							{chartData.map((entry, index) => (
								<Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
							))}
						</Pie>
						<Tooltip formatter={(value) => [`${value}문제`, ""]} />
					</PieChart>
				</ResponsiveContainer>
				<div className="flex flex-wrap gap-3 mt-4 justify-center">
					{chartData.map((item, index) => (
						<div key={item.name} className="flex items-center gap-1.5 text-sm">
							<div
								className="h-3 w-3 rounded-full"
								style={{
									backgroundColor: COLORS[index % COLORS.length],
								}}
							/>
							<span>{item.name}</span>
							<span className="text-muted-foreground">({item.value})</span>
						</div>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
