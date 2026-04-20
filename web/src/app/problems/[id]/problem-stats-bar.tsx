interface ProblemStatsBarProps {
	timeLimit: number;
	memoryLimit: number;
	stats: {
		totalSubmissions: number;
		acceptedSubmissions: number;
		acceptedUsers: number;
		acceptRate: string;
	};
}

export function ProblemStatsBar({ timeLimit, memoryLimit, stats }: ProblemStatsBarProps) {
	const items = [
		{ label: "시간 제한", value: `${timeLimit / 1000}s` },
		{ label: "메모리 제한", value: `${memoryLimit}MB` },
		{ label: "제출", value: String(stats.totalSubmissions) },
		{ label: "정답", value: String(stats.acceptedSubmissions) },
		{ label: "맞힌 사람", value: String(stats.acceptedUsers) },
		{ label: "정답 비율", value: `${stats.acceptRate}%` },
	];

	return (
		<div className="grid grid-cols-6 divide-x rounded-lg border text-center text-sm">
			{items.map((item) => (
				<div key={item.label} className="px-2 py-2">
					<div className="text-xs text-muted-foreground">{item.label}</div>
					<div className="font-semibold mt-0.5">{item.value}</div>
				</div>
			))}
		</div>
	);
}
