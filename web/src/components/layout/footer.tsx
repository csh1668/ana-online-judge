import Link from "next/link";
import { publicEnv } from "@/lib/env/publicEnv";

export function Footer() {
	const buildTime = new Date(publicEnv.NEXT_PUBLIC_BUILD_TIME);
	const buildTimeString = buildTime.toLocaleDateString("ko-KR", {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		timeZone: "Asia/Seoul",
	});

	return (
		<footer className="border-t">
			<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="flex flex-col items-center gap-3 text-center">
					<div className="flex gap-5 text-sm text-muted-foreground">
						<Link href="/problems" className="hover:text-foreground transition-colors">
							문제
						</Link>
						<Link href="/contests" className="hover:text-foreground transition-colors">
							대회
						</Link>
						<Link href="/judge-info" className="hover:text-foreground transition-colors">
							채점 정보
						</Link>
						<Link href="/sources" className="hover:text-foreground transition-colors">
							출처
						</Link>
						<Link href="/tags" className="hover:text-foreground transition-colors">
							알고리즘 분류
						</Link>
						<Link
							href="https://github.com/csh1668/ana-online-judge"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition-colors"
						>
							GitHub
						</Link>
					</div>
					<p className="text-sm text-muted-foreground">
						© {new Date().getFullYear()} ANA Online Judge
					</p>
					<p className="text-xs text-muted-foreground">마지막 업데이트: {buildTimeString}</p>
					<p className="text-xs text-muted-foreground">
						만든이:{" "}
						<Link
							href="https://github.com/csh1668"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition-colors underline underline-offset-2"
						>
							조서현 (csh1668)
						</Link>
					</p>
				</div>
			</div>
		</footer>
	);
}
