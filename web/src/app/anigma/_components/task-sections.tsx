import { Calculator, FileCode, Trophy, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function TaskSections() {
	return (
		<>
			{/* Task 1 Section */}
			<section className="py-16 bg-background">
				<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
					<Card className="border-2 border-purple-200 dark:border-purple-800">
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-900/30">
									<FileCode className="h-6 w-6 text-purple-600 dark:text-purple-400" />
								</div>
								<div>
									<CardTitle className="text-2xl">Task 1: 입력 파일 제출</CardTitle>
									<CardDescription className="text-base mt-1">
										제공된 코드에서 결함을 유발하는 입력을 찾으세요
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-6 md:grid-cols-2">
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<Zap className="h-5 w-5 text-purple-600" />
										목표
									</h3>
									<p className="text-muted-foreground">
										문제에서 제공하는 코드와 채점 서버 내부의 정답 코드가 다른 출력을 내는 입력
										파일을 찾아 제출하세요.
									</p>
								</div>
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<Trophy className="h-5 w-5 text-purple-600" />
										점수
									</h3>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Badge variant="default" className="bg-green-600">
												정답
											</Badge>
											<span className="font-semibold text-lg">30점</span>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant="secondary">오답</Badge>
											<span>0점</span>
										</div>
									</div>
								</div>
							</div>
							<Separator />
							<div className="bg-muted/50 p-4 rounded-lg">
								<h4 className="font-semibold mb-2">채점 방식</h4>
								<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
									<li>
										제출한 입력 파일을 문제에서 제공하는 코드와 채점 서버 내부의 정답 코드를 각각
										실행
									</li>
									<li>
										두 코드의 출력이 <strong>다르면</strong> 정답 (30점)
									</li>
									<li>
										두 코드의 출력이 <strong>같으면</strong> 오답 (0점)
									</li>
								</ol>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

			{/* Task 2 Section */}
			<section className="py-16 bg-muted/30">
				<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
					<Card className="border-2 border-blue-200 dark:border-blue-800">
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
									<Calculator className="h-6 w-6 text-blue-600 dark:text-blue-400" />
								</div>
								<div>
									<CardTitle className="text-2xl">Task 2: 코드 제출 + 편집 거리 보너스</CardTitle>
									<CardDescription className="text-base mt-1">
										zip 파일로 코드를 제출하고 편집 거리에 따라 보너스 점수를 받으세요
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="grid gap-6 md:grid-cols-2">
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<Zap className="h-5 w-5 text-blue-600" />
										목표
									</h3>
									<p className="text-muted-foreground">
										Makefile이 포함된 zip 파일로 코드를 제출하세요. 모든 테스트케이스를 통과하면
										기본 점수를 받고, 원본 코드와의 편집 거리가 작을수록 더 많은 보너스를 받습니다.
									</p>
								</div>
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<Trophy className="h-5 w-5 text-blue-600" />
										점수 구성
									</h3>
									<div className="space-y-2">
										<div className="flex items-center gap-2">
											<Badge variant="default" className="bg-blue-600">
												기본 점수
											</Badge>
											<span className="font-semibold">50점</span>
										</div>
										<div className="flex items-center gap-2">
											<Badge variant="default" className="bg-purple-600">
												보너스
											</Badge>
											<span className="font-semibold">최대 20점</span>
										</div>
										<div className="flex items-center gap-2 mt-3">
											<Badge variant="outline" className="text-lg px-3 py-1">
												총점
											</Badge>
											<span className="font-bold text-xl">최대 70점</span>
										</div>
									</div>
								</div>
							</div>
							<Separator />
							<div className="bg-muted/50 p-4 rounded-lg space-y-4">
								<div>
									<h4 className="font-semibold mb-2">채점 방식</h4>
									<ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
										<li>zip 파일에 Makefile이 있어야 합니다 (build, run 타겟 필수)</li>
										<li>
											<code>make build</code>로 컴파일
										</li>
										<li>
											모든 테스트케이스에 대해 <code>make run file=input.txt</code> 실행
										</li>
										<li>모든 테스트케이스 통과 시 기본 50점 획득</li>
										<li>
											원본 코드와의 편집 거리(Levenshtein Distance) 계산
											<ul className="list-disc list-inside ml-4 mt-1 space-y-0.5">
												<li>
													편집 거리 계산에는 다음 확장자를 가진 소스 파일만 포함됩니다:{" "}
													<code className="bg-muted px-1 rounded">cpp</code>,{" "}
													<code className="bg-muted px-1 rounded">c</code>,{" "}
													<code className="bg-muted px-1 rounded">h</code>,{" "}
													<code className="bg-muted px-1 rounded">hpp</code>,{" "}
													<code className="bg-muted px-1 rounded">cc</code>,{" "}
													<code className="bg-muted px-1 rounded">cc</code>,{" "}
													<code className="bg-muted px-1 rounded">cxx</code>,{" "}
													<code className="bg-muted px-1 rounded">java</code>,{" "}
													<code className="bg-muted px-1 rounded">py</code>
												</li>
												<li>
													zip 파일 내 모든 하위 디렉토리를 재귀적으로 탐색하여 해당 확장자 파일을
													읽습니다
												</li>
											</ul>
										</li>
									</ol>
								</div>
								<Separator />
								<div>
									<h4 className="font-semibold mb-3">보너스 점수 계산</h4>
									<div className="space-y-3 text-sm">
										<div className="bg-background p-3 rounded border">
											<p className="font-mono text-xs mb-2">보너스 = 20 × (ratio ^ 1.5)</p>
											<p className="text-muted-foreground mb-2">
												where ratio = (R_max - edit_distance) / (R_max - R_min)
											</p>
											<ul className="list-disc list-inside space-y-1 text-muted-foreground">
												<li>
													<strong>R_max</strong>: 모든 참가자의 Best Submission 중 최대 편집 거리
												</li>
												<li>
													<strong>R_min</strong>: 모든 참가자의 Best Submission 중 최소 편집 거리
												</li>
												<li>
													<strong>edit_distance</strong>: 현재 제출의 편집 거리
												</li>
											</ul>
										</div>
										<div className="space-y-2">
											<p className="font-semibold">예시:</p>
											<ul className="list-disc list-inside space-y-1 text-muted-foreground">
												<li>R_max = 100, R_min = 10, edit_distance = 10 → 보너스 20점 (최대)</li>
												<li>R_max = 100, R_min = 10, edit_distance = 55 → 보너스 약 10점</li>
												<li>R_max = 100, R_min = 10, edit_distance = 100 → 보너스 0점</li>
											</ul>
										</div>
									</div>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>
		</>
	);
}
