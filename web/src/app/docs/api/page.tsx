import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { generateContracts } from "@/lib/services/api-contract";
import { publicEndpoints } from "@/lib/services/public-api-registry";
import { EndpointCard } from "./endpoint-card";

export const metadata: Metadata = {
	title: "API 문서",
	description: "ANA Online Judge 공용 API 레퍼런스",
};

export const dynamic = "force-dynamic";

function buildAnchorId(method: string, path: string): string {
	return `ep-${method.toLowerCase()}-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "")}`;
}

const OPEN_HASH_TARGET_SCRIPT = `
(function () {
	function openTarget() {
		var hash = window.location.hash.slice(1);
		if (!hash) return;
		var el = document.getElementById(hash);
		if (el && el.tagName === 'DETAILS' && !el.open) {
			el.open = true;
		}
	}
	document.addEventListener('click', function (e) {
		var target = e.target;
		if (!(target instanceof Element)) return;
		var anchor = target.closest('a[href^="#ep-"]');
		if (!anchor) return;
		var href = anchor.getAttribute('href');
		if (!href) return;
		var el = document.getElementById(href.slice(1));
		if (el && el.tagName === 'DETAILS' && !el.open) {
			el.open = true;
		}
	});
	window.addEventListener('hashchange', openTarget);
	openTarget();
})();
`;

export default function ApiDocsPage() {
	const contracts = generateContracts(publicEndpoints);

	return (
		<PageShell breadcrumb={[{ label: "API 문서" }]}>
			<Card>
				<PageHeader title="API 문서" description="공용 REST API 레퍼런스" />
				<CardContent>
					<div className="grid gap-8 lg:grid-cols-[220px_1fr]">
						<aside className="hidden lg:block">
							<nav
								aria-label="API endpoint 목록"
								className="sticky top-4 border border-border bg-card p-3"
							>
								<p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
									Endpoints
								</p>
								<ul className="space-y-0.5 text-sm">
									{contracts.map((ep) => {
										const id = buildAnchorId(ep.method, ep.path);
										return (
											<li key={id}>
												<a
													href={`#${id}`}
													className="flex items-center gap-2 rounded-[2px] px-2 py-1 hover:bg-muted"
												>
													<span className="w-9 shrink-0 font-mono text-[10px] font-semibold uppercase text-accent">
														{ep.method}
													</span>
													<span className="truncate font-mono text-xs">{ep.path}</span>
												</a>
											</li>
										);
									})}
								</ul>
							</nav>
						</aside>

						<div className="space-y-3">
							{contracts.map((ep) => {
								const id = buildAnchorId(ep.method, ep.path);
								return <EndpointCard key={id} ep={ep} anchorId={id} />;
							})}
						</div>
					</div>
				</CardContent>
			</Card>

			<script dangerouslySetInnerHTML={{ __html: OPEN_HASH_TARGET_SCRIPT }} />
		</PageShell>
	);
}
