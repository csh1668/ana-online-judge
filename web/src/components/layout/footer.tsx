import Link from "next/link";
import { publicEnv } from "@/lib/env/publicEnv";
import { formatDateTime } from "@/lib/format-date";

export function Footer() {
	const buildTimeString = formatDateTime(new Date(publicEnv.NEXT_PUBLIC_BUILD_TIME), {
		timeZone: "Asia/Seoul",
	});

	return (
		<footer className="border-t">
			<div className="page-container py-6">
				<div className="flex flex-col items-center gap-3 text-center">
					<div className="flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
						<Link href="/problems" className="hover:text-foreground transition-colors">
							문제
						</Link>
						<Link href="/contests" className="hover:text-foreground transition-colors">
							대회
						</Link>
						<Link href="/judge-info" className="hover:text-foreground transition-colors">
							채점 정보
						</Link>
						<Link href="/status" className="hover:text-foreground transition-colors">
							채점 상태
						</Link>
						<Link href="/sources" className="hover:text-foreground transition-colors">
							문제 출처
						</Link>
						<Link href="/tags" className="hover:text-foreground transition-colors">
							알고리즘 분류
						</Link>
						<Link href="/docs/api" className="hover:text-foreground transition-colors">
							API 문서
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
						© {new Date().getFullYear()} ANA Online Judge · 충남대학교 알고리즘 동아리{" "}
						<Link
							href="https://anacnu.kr"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition-colors underline underline-offset-2"
						>
							ANA
						</Link>{" "}
						운영
					</p>
					<p className="text-xs text-muted-foreground">
						마지막 업데이트: {buildTimeString} ·{" "}
						<Link
							href="/updates"
							className="hover:text-foreground transition-colors underline underline-offset-2"
						>
							업데이트 내역
						</Link>
					</p>
					<p className="text-xs text-muted-foreground">
						만든이:{" "}
						<Link
							href="https://github.com/csh1668"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition-colors underline underline-offset-2"
						>
							조서현
						</Link>{" "}
						문의:{" "}
						<Link
							href="mailto:csh1668@gmail.com"
							className="hover:text-foreground transition-colors underline underline-offset-2"
						>
							csh1668@gmail.com
						</Link>
					</p>
					<p className="text-xs text-muted-foreground">
						티어 시스템과 아이콘은{" "}
						<Link
							href="https://solved.ac"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition-colors underline underline-offset-2"
						>
							solved.ac
						</Link>
						의 저작이며, ANA Online Judge는 solved.ac와 무관한 서비스입니다.
					</p>
				</div>
			</div>
		</footer>
	);
}
