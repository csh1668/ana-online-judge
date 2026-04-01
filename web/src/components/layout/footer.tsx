import Link from "next/link";

export function Footer() {
	return (
		<footer className="border-t">
			<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
				<div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
					<p className="text-sm text-muted-foreground">
						© {new Date().getFullYear()} ANA Online Judge
					</p>
					<div className="flex gap-5 text-sm text-muted-foreground">
						<Link href="/problems" className="hover:text-foreground transition-colors">
							문제
						</Link>
						<Link href="/contests" className="hover:text-foreground transition-colors">
							대회
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
				</div>
			</div>
		</footer>
	);
}
