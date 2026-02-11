import { Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function ScoringSection() {
	return (
		<section className="py-16 bg-background">
			<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
				<div className="text-center mb-12">
					<h2 className="text-3xl font-bold tracking-tight">스코어보드 시스템</h2>
					<p className="mt-4 text-lg text-muted-foreground">ANIGMA 대회의 등수 매기는 방식</p>
				</div>
				<Card className="border-2">
					<CardHeader>
						<div className="flex items-center gap-3">
							<div className="p-3 rounded-lg bg-primary/10">
								<Users className="h-6 w-6 text-primary" />
							</div>
							<div>
								<CardTitle className="text-2xl">등수 결정 방식</CardTitle>
								<CardDescription className="text-base mt-1">
									총점과 마지막 제출 시간으로 순위가 결정됩니다
								</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent className="space-y-6">
						<div className="grid gap-6 md:grid-cols-2">
							<div className="space-y-4">
								<h3 className="font-semibold text-lg">총점 계산</h3>
								<div className="space-y-2 text-sm">
									<div className="flex items-start gap-2">
										<Badge variant="outline" className="mt-0.5">
											Task 1
										</Badge>
										<span>각 문제당 최대 30점</span>
									</div>
									<div className="flex items-start gap-2">
										<Badge variant="outline" className="mt-0.5">
											Task 2
										</Badge>
										<span>각 문제당 최대 70점 (기본 50점 + 보너스 최대 20점)</span>
									</div>
									<div className="mt-4 p-3 bg-muted/50 rounded">
										<p className="font-semibold mb-1">총점 = Task 1 점수 + Task 2 점수</p>
										<p className="text-xs text-muted-foreground">
											각 문제의 Task 1과 Task 2 점수를 합산합니다
										</p>
									</div>
								</div>
							</div>
							<div className="space-y-4">
								<h3 className="font-semibold text-lg">Best Submission 선정</h3>
								<div className="space-y-2 text-sm">
									<p className="text-muted-foreground">
										스코어보드에는 각 유저의 <strong>Best Submission</strong>이 표시됩니다:
									</p>
									<div className="bg-muted/50 p-3 rounded space-y-2">
										<div className="flex items-start gap-2">
											<span className="font-semibold">Task 2</span>
											<ul className="list-disc list-inside space-y-1 text-muted-foreground">
												<li>정답인 제출</li>
												<li>
													편집 거리가 <strong>가장 작은</strong> 제출
												</li>
												<li>
													시간이 <strong>가장 빠른</strong> 제출
												</li>
											</ul>
										</div>
									</div>
								</div>
							</div>
						</div>
						<Separator />
						<div className="bg-muted/50 p-4 rounded-lg">
							<h4 className="font-semibold mb-3">순위 결정 우선순위</h4>
							<ol className="list-decimal list-inside space-y-2 text-sm">
								<li>
									<strong>총점</strong>이 높은 순서
								</li>
								<li>
									<strong>마지막 제출 시간</strong>이 빠른 순서
								</li>
							</ol>
						</div>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
