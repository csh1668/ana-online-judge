// Contest utility functions (non-Server Actions)

export function getContestStatus(contest: { startTime: Date; endTime: Date }) {
	const now = new Date();
	if (now < contest.startTime) {
		return "upcoming";
	}
	if (now >= contest.startTime && now <= contest.endTime) {
		return "running";
	}
	return "finished";
}

export type ContestStatus = ReturnType<typeof getContestStatus>;

export function formatDuration(ms: number): string {
	const totalSeconds = Math.max(0, Math.floor(ms / 1000));
	const days = Math.floor(totalSeconds / 86400);
	const hours = Math.floor((totalSeconds % 86400) / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	const pad = (n: number) => n.toString().padStart(2, "0");
	if (days > 0) return `${days}일 ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
	return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
