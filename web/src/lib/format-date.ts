import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

type DateInput = Date | string | number;

interface FormatOptions {
	/** 지정하지 않으면 실행 환경(서버/브라우저)의 기본 타임존 */
	timeZone?: string;
}

function toDate(input: DateInput): Date {
	return input instanceof Date ? input : new Date(input);
}

function parts(input: DateInput, withTime: boolean, opts?: FormatOptions) {
	const fmt = new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
		timeZone: opts?.timeZone,
	});
	const map = new Map(fmt.formatToParts(toDate(input)).map((p) => [p.type, p.value]));
	const get = (t: Intl.DateTimeFormatPartTypes) => map.get(t) ?? "";
	return {
		year: get("year"),
		month: get("month"),
		day: get("day"),
		// 일부 엔진은 hour12:false에서 자정을 "24"로 낸다
		hour: get("hour") === "24" ? "00" : get("hour"),
		minute: get("minute"),
	};
}

/** `2026. 04. 29. 19:33` — 사이트 전체의 기본 일시 표기 */
export function formatDateTime(input: DateInput, opts?: FormatOptions): string {
	const p = parts(input, true, opts);
	return `${p.year}. ${p.month}. ${p.day}. ${p.hour}:${p.minute}`;
}

/** `2026. 04. 29.` */
export function formatDate(input: DateInput, opts?: FormatOptions): string {
	const p = parts(input, false, opts);
	return `${p.year}. ${p.month}. ${p.day}.`;
}

/** `3분 전`, `2일 후` */
export function formatRelative(input: DateInput): string {
	return formatDistanceToNow(toDate(input), { addSuffix: true, locale: ko });
}
