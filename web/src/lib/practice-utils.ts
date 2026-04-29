export function getPracticeStatus(practice: { startTime: Date; endTime: Date }) {
	const now = new Date();
	if (now < practice.startTime) return "upcoming";
	if (now <= practice.endTime) return "running";
	return "finished";
}

export type PracticeStatus = ReturnType<typeof getPracticeStatus>;

export function getKstStartOfToday(now: Date = new Date()): Date {
	const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
	const kstNow = new Date(now.getTime() + KST_OFFSET_MS);
	kstNow.setUTCHours(0, 0, 0, 0);
	return new Date(kstNow.getTime() - KST_OFFSET_MS);
}

export const PRACTICE_MIN_DURATION_MINUTES = 30;
export const PRACTICE_MAX_DURATION_MINUTES = 7 * 24 * 60;
export const PRACTICE_MAX_PROBLEMS = 20;
export const PRACTICE_MIN_PROBLEMS = 1;
export const PRACTICE_DEFAULT_PENALTY = 20;
