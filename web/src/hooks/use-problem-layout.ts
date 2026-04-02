"use client";

import { useCallback, useEffect, useState } from "react";

type LayoutMode = "single" | "split";

const STORAGE_KEY = "problem-layout-mode";

export function useProblemLayout() {
	const [mode, setModeState] = useState<LayoutMode>("single");
	const [isNarrow, setIsNarrow] = useState(false);

	useEffect(() => {
		const saved = localStorage.getItem(STORAGE_KEY) as LayoutMode | null;
		if (saved === "single" || saved === "split") {
			setModeState(saved);
		}

		const mql = window.matchMedia("(max-width: 1023px)");
		setIsNarrow(mql.matches);
		const handler = (e: MediaQueryListEvent) => setIsNarrow(e.matches);
		mql.addEventListener("change", handler);
		return () => mql.removeEventListener("change", handler);
	}, []);

	const setMode = useCallback((m: LayoutMode) => {
		setModeState(m);
		localStorage.setItem(STORAGE_KEY, m);
	}, []);

	const effectiveMode = isNarrow ? "single" : mode;

	return { mode: effectiveMode, setMode, isNarrow };
}
