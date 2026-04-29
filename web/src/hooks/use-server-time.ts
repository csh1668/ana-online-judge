"use client";

import { useEffect, useState } from "react";

const RESYNC_INTERVAL_MS = 5 * 60 * 1000;
const TICK_INTERVAL_MS = 1000;

async function fetchOffset(): Promise<number | null> {
	try {
		const before = Date.now();
		const res = await fetch("/api/server-time", { cache: "no-store" });
		const after = Date.now();
		if (!res.ok) return null;
		const data = (await res.json()) as { now: number };
		const rtt = after - before;
		const estimatedClientTimeAtServerResponse = before + rtt / 2;
		return data.now - estimatedClientTimeAtServerResponse;
	} catch {
		return null;
	}
}

export function useServerTime() {
	const [offset, setOffset] = useState<number | null>(null);
	const [now, setNow] = useState<number>(() => Date.now());

	useEffect(() => {
		let cancelled = false;

		async function sync() {
			const o = await fetchOffset();
			if (!cancelled && o !== null) setOffset(o);
		}

		sync();
		const resyncId = setInterval(sync, RESYNC_INTERVAL_MS);
		const onVisible = () => {
			if (document.visibilityState === "visible") sync();
		};
		document.addEventListener("visibilitychange", onVisible);

		return () => {
			cancelled = true;
			clearInterval(resyncId);
			document.removeEventListener("visibilitychange", onVisible);
		};
	}, []);

	useEffect(() => {
		const tickId = setInterval(() => {
			setNow(Date.now());
		}, TICK_INTERVAL_MS);
		return () => clearInterval(tickId);
	}, []);

	return {
		serverNow: offset === null ? now : now + offset,
		isSynced: offset !== null,
	};
}
