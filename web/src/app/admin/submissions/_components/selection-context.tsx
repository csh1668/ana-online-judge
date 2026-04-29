"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type SelectionMode = "rows" | "filter" | "none";

type Ctx = {
	mode: SelectionMode;
	rowIds: Set<number>;
	toggleRow: (id: number, checked: boolean) => void;
	togglePage: (pageIds: number[], checked: boolean) => void;
	switchToFilterMode: () => void;
	clear: () => void;
};

const SelectionCtx = createContext<Ctx | null>(null);

export function SelectionProvider({ children }: { children: React.ReactNode }) {
	const [mode, setMode] = useState<SelectionMode>("none");
	const [rowIds, setRowIds] = useState<Set<number>>(new Set());

	const value = useMemo<Ctx>(
		() => ({
			mode,
			rowIds,
			toggleRow: (id, checked) => {
				setRowIds((prev) => {
					const next = new Set(prev);
					if (checked) next.add(id);
					else next.delete(id);
					setMode(next.size === 0 ? "none" : "rows");
					return next;
				});
			},
			togglePage: (pageIds, checked) => {
				setRowIds((prev) => {
					const next = new Set(prev);
					for (const id of pageIds) {
						if (checked) next.add(id);
						else next.delete(id);
					}
					setMode(next.size === 0 ? "none" : "rows");
					return next;
				});
			},
			switchToFilterMode: () => {
				setMode("filter");
				setRowIds(new Set());
			},
			clear: () => {
				setMode("none");
				setRowIds(new Set());
			},
		}),
		[mode, rowIds]
	);

	return <SelectionCtx.Provider value={value}>{children}</SelectionCtx.Provider>;
}

export function useSelection() {
	const ctx = useContext(SelectionCtx);
	if (!ctx) throw new Error("useSelection must be used within SelectionProvider");
	return ctx;
}
