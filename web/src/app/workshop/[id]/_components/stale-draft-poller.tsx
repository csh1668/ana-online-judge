"use client";

import { useEffect, useState } from "react";
import { getStaleDraftInfo } from "@/actions/workshop/snapshots";
import { StaleDraftWarning, type StaleInfo } from "./stale-draft-warning";

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls stale-draft status so a teammate's snapshot commit surfaces as a banner
 * without a page reload (Polygon-style commit notification, pull-based).
 */
export function StaleDraftPoller({
	problemId,
	initialStale,
}: {
	problemId: number;
	initialStale: StaleInfo | null;
}) {
	const [stale, setStale] = useState<StaleInfo | null>(initialStale);

	// router.refresh() 후 서버가 내려준 최신 값이 권위 — 로컬 폴링 상태를 재동기화한다.
	useEffect(() => {
		setStale(initialStale);
	}, [initialStale]);

	useEffect(() => {
		const timer = setInterval(async () => {
			try {
				setStale(await getStaleDraftInfo(problemId));
			} catch {
				// keep the last known state on transient errors
			}
		}, POLL_INTERVAL_MS);
		return () => clearInterval(timer);
	}, [problemId]);

	return <StaleDraftWarning problemId={problemId} stale={stale} />;
}
