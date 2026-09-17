"use client";

import { formatDateTime } from "@/lib/format-date";

interface ContestTimeProps {
	date: Date | string;
}

/** 서버 직렬화된 ISO 문자열도 받아 브라우저 타임존으로 렌더 */
export function ContestTime({ date }: ContestTimeProps) {
	return <>{formatDateTime(date)}</>;
}
