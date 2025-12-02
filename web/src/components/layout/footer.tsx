import { Code2 } from "lucide-react";
import Link from "next/link";

export function Footer() {
	return (
		<footer className="border-t bg-muted/30">
			<div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
				<div className="flex flex-col items-center justify-between gap-4 md:flex-row">
					{/* Logo & Description */}
					<div className="flex flex-col items-center gap-2 md:items-start">
						<Link href="/" className="flex items-center gap-2">
							<Code2 className="h-6 w-6 text-primary" />
							<span className="font-bold">ANA Online Judge</span>
						</Link>
						<p className="text-sm text-muted-foreground text-center md:text-left">
							교내 프로그래밍 대회를 위한 온라인 저지 시스템
						</p>
					</div>

					{/* Links */}
					<div className="flex gap-6 text-sm text-muted-foreground">
						<Link href="/problems" className="hover:text-foreground transition-colors">
							문제
						</Link>
						<Link href="/submissions" className="hover:text-foreground transition-colors">
							제출 현황
						</Link>
						<Link
							href="https://github.com"
							target="_blank"
							rel="noopener noreferrer"
							className="hover:text-foreground transition-colors"
						>
							GitHub
						</Link>
					</div>
				</div>

				{/* Copyright */}
				<div className="mt-8 border-t pt-6 text-center">
					<p className="text-sm text-muted-foreground">
						© {new Date().getFullYear()} ANA Online Judge. All rights reserved.
					</p>
				</div>
			</div>
		</footer>
	);
}




