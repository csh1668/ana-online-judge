import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { HeroSection } from "./_components/hero-section";
import { RulesSection } from "./_components/rules-section";
import { ScoringSection } from "./_components/scoring-section";
import { TaskSections } from "./_components/task-sections";

export default function AnigmaPage() {
	return (
		<div className="flex flex-col min-h-screen">
			<HeroSection />
			<TaskSections />
			<ScoringSection />
			<RulesSection />

			{/* Summary Section */}
			<section className="py-16 bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10">
				<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
					<Card className="border-2 border-primary/20">
						<CardHeader>
							<CardTitle className="text-2xl text-center">요약</CardTitle>
						</CardHeader>
						<CardContent>
							<div className="grid gap-6 md:grid-cols-2">
								<div className="space-y-3">
									<h3 className="font-semibold text-lg">Task 1</h3>
									<ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
										<li>입력 파일 제출</li>
										<li>정답 시 30점</li>
									</ul>
								</div>
								<div className="space-y-3">
									<h3 className="font-semibold text-lg">Task 2</h3>
									<ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
										<li>zip 파일로 코드 제출</li>
										<li>테스트케이스 통과 시 기본 50점</li>
										<li>편집 거리에 따라 최대 20점 보너스</li>
										<li>총 최대 70점</li>
									</ul>
								</div>
							</div>
							<Separator className="my-6" />
							<div className="text-center">
								<Button size="lg" asChild>
									<Link href="/contests">
										대회 참가하기
										<ArrowRight className="ml-2 h-4 w-4" />
									</Link>
								</Button>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</div>
	);
}
