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
		<dl className="grid grid-cols-3 gap-px overflow-hidden rounded-[2px] border border-border bg-border text-center text-sm sm:grid-cols-6">
			{items.map((item) => (
				<div key={item.label} className="bg-card px-2 py-2">
					<dt className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
						{item.label}
					</dt>
					<dd className="mt-0.5 font-semibold tabular-nums">{item.value}</dd>
				</div>
			))}
		</dl>
	);
}
