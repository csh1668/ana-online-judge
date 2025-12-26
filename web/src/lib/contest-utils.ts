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
