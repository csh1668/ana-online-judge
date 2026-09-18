import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Language } from "@/db/schema";
import { LANGUAGES, type LanguageConfig } from "@/lib/languages";

export const metadata: Metadata = {
	title: "채점 정보",
	description: "채점 환경 및 지원 언어 정보",
};

function formatTimeFactor([multiplier, bonus]: [number, number]) {
	if (multiplier === 1 && bonus === 0) return "기본";
	const parts: string[] = [];
	if (multiplier !== 1) parts.push(`×${multiplier}`);
	if (bonus > 0) parts.push(`+${bonus}초`);
	return parts.join(" ");
}

function formatMemoryFactor([multiplier, bonus]: [number, number]) {
	if (multiplier === 1 && bonus === 0) return "기본";
	const parts: string[] = [];
	if (multiplier !== 1) parts.push(`×${multiplier}`);
	if (bonus > 0) parts.push(`+${bonus}MB`);
	return parts.join(" ");
}

function LanguageCard({ lang }: { lang: LanguageConfig }) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{lang.label}</CardTitle>
				{lang.version && <CardDescription className="text-xs">{lang.version}</CardDescription>}
			</CardHeader>
			<CardContent className="space-y-3 text-sm">
				<div className="grid grid-cols-3 gap-x-4 gap-y-2">
					<div>
						<p className="text-muted-foreground text-xs">소스 파일</p>
						<code className="text-xs">{lang.sourceFile}</code>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">시간 배율</p>
						<p className="text-xs">{formatTimeFactor(lang.timeLimitFactor)}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">메모리 배율</p>
						<p className="text-xs">{formatMemoryFactor(lang.memoryLimitFactor)}</p>
					</div>
				</div>
				{lang.compileCommand && (
					<div>
						<p className="text-muted-foreground text-xs mb-1">컴파일 명령어</p>
						<pre className="bg-muted px-3 py-2 rounded-[2px] text-xs overflow-x-auto">
							{lang.compileCommand}
						</pre>
					</div>
				)}
				<div>
					<p className="text-muted-foreground text-xs mb-1">실행 명령어</p>
					<pre className="bg-muted px-3 py-2 rounded-[2px] text-xs overflow-x-auto">
						{lang.runCommand}
					</pre>
				</div>
			</CardContent>
		</Card>
	);
}

export default function JudgeInfoPage() {
	const languageEntries = Object.entries(LANGUAGES) as [Language, (typeof LANGUAGES)[Language]][];

	return (
		<PageShell breadcrumb={[{ label: "채점 정보" }]}>
			<Card>
				<PageHeader title="채점 정보" description="채점 환경 및 지원 언어 정보" />
				<CardContent className="space-y-4 text-sm text-muted-foreground">
					<h3 className="text-sm font-semibold text-foreground">채점 환경</h3>
					<div>
						<h3 className="text-sm font-semibold text-foreground mb-1">샌드박스</h3>
						<p>
							모든 코드는{" "}
							<code className="bg-muted px-1 py-0.5 rounded-[2px] text-xs">isolate</code>{" "}
							샌드박스에서 실행됩니다 (cgroups v2 기반). 네트워크 접근, 파일시스템 접근 등이 제한된
							격리 환경에서 안전하게 실행됩니다.
						</p>
					</div>
					<div>
						<h3 className="text-sm font-semibold text-foreground mb-1">채점 방식</h3>
						<ul className="list-disc list-inside space-y-1">
							<li>
								<strong>ICPC</strong> — 표준 입출력 비교. 프로그램의 출력을 정답과 비교하여
								채점합니다.
							</li>
							<li>
								<strong>Special Judge</strong> — testlib.h 기반 커스텀 체커를 사용하여 채점합니다.
								여러 정답이 가능한 문제에 사용됩니다.
							</li>
						</ul>
					</div>
				</CardContent>
			</Card>

			<div>
				<h2 className="text-lg font-semibold tracking-tight">지원 언어</h2>
				<p className="text-sm text-muted-foreground mb-4">
					시간/메모리 제한은 문제에 명시된 기본 제한에 언어별 배율이 적용됩니다
				</p>
				<div className="grid gap-4 sm:grid-cols-2">
					{languageEntries.map(([key, lang]) => (
						<LanguageCard key={key} lang={lang} />
					))}
				</div>
			</div>
		</PageShell>
	);
}
