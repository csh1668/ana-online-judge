import type { ReactNode } from "react";

export default function ScoreboardLayout({ children }: { children: ReactNode }) {
	return <div className="min-h-screen w-full bg-background">{children}</div>;
}
