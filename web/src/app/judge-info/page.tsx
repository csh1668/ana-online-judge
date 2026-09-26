import type { Metadata } from "next";
import { getJudgeInfoLanguages, type JudgeInfoLanguage } from "@/actions/languages/queries";
import { PageHeader } from "@/components/layout/page-header";
import { PageShell } from "@/components/layout/page-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "채점 정보",
	description: "채점 환경 및 지원 언어 정보",
};

// 언어 목록은 DB(관리자 설정)에서 오므로 빌드 시 정적 생성하지 않는다.
export const dynamic = "force-dynamic";

function formatTimeFactor(multiplier: number, bonus: number) {
	if (multiplier === 1 && bonus === 0) return "기본";
	const parts: string[] = [];
	if (multiplier !== 1) parts.push(`×${multiplier}`);
	if (bonus > 0) parts.push(`+${bonus}초`);
	return parts.join(" ");
}

function formatMemoryFactor(multiplier: number, bonus: number) {
	if (multiplier === 1 && bonus === 0) return "기본";
	const parts: string[] = [];
	if (multiplier !== 1) parts.push(`×${multiplier}`);
	if (bonus > 0) parts.push(`+${bonus}MB`);
	return parts.join(" ");
}

function LanguageCard({ lang }: { lang: JudgeInfoLanguage }) {
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
						<p className="text-xs">{formatTimeFactor(lang.timeMultiplier, lang.timeBonusSec)}</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs">메모리 배율</p>
						<p className="text-xs">
							{formatMemoryFactor(lang.memoryMultiplier, lang.memoryBonusMb)}
						</p>
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

export default async function JudgeInfoPage() {
	const languages = await getJudgeInfoLanguages();

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
					{languages.map((lang) => (
						<LanguageCard key={lang.id} lang={lang} />
					))}
				</div>
			</div>
		</PageShell>
	);
}
