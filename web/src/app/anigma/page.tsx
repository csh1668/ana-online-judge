import {
	ArrowRight,
	Calculator,
	FileCode,
	Shield,
	Trophy,
	Users,
	Zap,
	AlertTriangle,
	Clock,
	Ban,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export default function AnigmaPage() {
	return (
		<div className="flex flex-col min-h-screen">
			{/* Hero Section */}
			<section className="relative overflow-hidden bg-gradient-to-br from-purple-500/10 via-blue-500/10 to-pink-500/10">
				<div className="absolute inset-0 bg-grid-pattern opacity-5" />
				<div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 relative">
					<div className="text-center">
						<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
							<FileCode className="h-5 w-5" />
							<span className="font-semibold">ANIGMA</span>
						</div>
						<h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
							<span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
								ANIGMA
							</span>{" "}
							대회 형식
						</h1>
						<p className="mt-6 text-lg leading-8 text-muted-foreground max-w-3xl mx-auto">
							ANIGMA는 두 가지 Task로 구성된 특별한 대회 형식입니다. Task 1에서는 입력 파일을
							제출하고, Task 2에서는 코드를 제출하여 편집 거리(Edit Distance)에 따라 보너스 점수를
							받을 수 있습니다.
						</p>
						<div className="mt-10">
							<Button size="lg" variant="outline" asChild>
								<Link href="/contests">
									대회 목록 보기
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>
				</div>
			</section>

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
										문제에서 제공하는 코드와 채점 서버 내부의 정답 코드가 다른
										출력을 내는 입력 파일을 찾아 제출하세요.
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
									<li>제출한 입력 파일을 문제에서 제공하는 코드와 채점 서버 내부의 정답 코드를 각각 실행</li>
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
													<code className="bg-muted px-1 rounded">cxx</code>,{" "}
													<code className="bg-muted px-1 rounded">java</code>,{" "}
													<code className="bg-muted px-1 rounded">py</code>
												</li>
												<li>zip 파일 내 모든 하위 디렉토리를 재귀적으로 탐색하여 해당 확장자 파일을 읽습니다</li>
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

			{/* Scoring System Section */}
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
													<li>
														정답인 제출
													</li>
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

			{/* Rules Section */}
			<section className="py-16 bg-background">
				<div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
					<div className="text-center mb-12">
						<h2 className="text-3xl font-bold tracking-tight">대회 규칙</h2>
						<p className="mt-4 text-lg text-muted-foreground">
							ANIGMA 대회 참가 시 반드시 준수해야 할 규칙입니다
						</p>
					</div>
					<Card className="border-2 border-orange-200 dark:border-orange-800">
						<CardHeader>
							<div className="flex items-center gap-3">
								<div className="p-3 rounded-lg bg-orange-100 dark:bg-orange-900/30">
									<Shield className="h-6 w-6 text-orange-600 dark:text-orange-400" />
								</div>
								<div>
									<CardTitle className="text-2xl">📌 대회 규칙</CardTitle>
									<CardDescription className="text-base mt-1">
										모든 참가자는 아래 규칙을 준수해야 합니다
									</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-6">
							<div className="space-y-6">
								{/* 1. 참가 및 계정 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">1.</span>
										참가 및 계정
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>
											참가자는 대회 입장 시 운영진으로부터 제공받은 <strong>대회 전용 계정</strong>을
											통해서만 참가해야 합니다.
										</li>
										<li>
											대회 계정의 <strong className="text-destructive">공유, 양도, 중복 사용은 엄격히 금지</strong>
											됩니다.
										</li>
									</ul>
								</div>

								<Separator />

								{/* 2. 문제 풀이 환경 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">2.</span>
										문제 풀이 환경
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>참가자는 본인 지참 노트북을 사용하여 문제 풀이를 진행합니다.</li>
										<li>인터넷 검색 및 IDE 사용은 허용됩니다.</li>
										<li>
											단, <strong className="text-destructive">ChatGPT, GitHub Copilot, Bing AI 등 자동으로 소스 코드를 생성하는 AI 기반 서비스의 사용은 금지</strong>
											됩니다.
										</li>
										<li>
											외부인과의 코드 공유, 실시간 소통(메신저, 전화, 화면 공유 등)은{" "}
											<strong className="text-destructive">부정행위로 간주</strong>됩니다.
										</li>
									</ul>
								</div>

								<Separator />

								{/* 3. 운영체제 및 실행 환경 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">3.</span>
										운영체제 및 실행 환경
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>
											<strong>Windows 사용자는 Makefile 실행 시 WSL 환경에서 실행</strong>해야 합니다.
										</li>
										<li>채점 서버 환경과 로컬 실행 환경은 차이가 있을 수 있습니다.</li>
									</ul>
								</div>

								<Separator />

								{/* 4. 지원하는 언어 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">4.</span>
										지원하는 언어
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li><strong>C</strong>: C17</li>
										<li><strong>C++</strong>: C++20</li>
										<li><strong>Java</strong>: JDK 17</li>
										<li><strong>Python</strong>: 3.11.2</li>
									</ul>
								</div>

								<Separator />

								{/* 5. 문제 구성 및 점수 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">5.</span>
										문제 구성 및 점수
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>
											각 문제는 <strong>Task 1 (30점), Task 2 (70점)</strong>으로 구성됩니다.
										</li>
										<li>Task는 단계별 채점 방식으로 진행됩니다.</li>
									</ul>
								</div>

								<Separator />

								{/* 6. 출력 및 채점 방식 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">6.</span>
										입출력 및 채점 방식
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>본 대회는 <strong>출력 기반 채점</strong>으로 진행됩니다.</li>
										<li>
											입출력 형식은 <strong>공백, 줄바꿈을 포함하여 문제에서 요구한 형식과 정확히 일치</strong>
											해야 합니다.
										</li>
										<li>
											<strong>입출력을 제외한 비즈니스 로직에 결함이 존재하므로 입출력 코드를 임의로 수정하는 행위는 권장하지 않습니다.</strong>
										</li>
									</ul>
								</div>

								<Separator />

								{/* 7. 예외 처리 관련 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<span className="text-primary">7.</span>
										예외 처리 관련
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>
											출력 결과에 <code className="bg-muted px-1 rounded">[Error]</code> 태그가 포함된 모든 예외 처리는 의도된 예외 처리로 간주됩니다.
										</li>
									</ul>
								</div>

								<Separator />

								{/* 8. 제출 및 시간 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<Clock className="h-5 w-5 text-primary" />
										<span className="text-primary">8.</span>
										제출 및 시간
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>
											대회 종료 시각 이후 제출된 결과물은 <strong>채점 대상에서 제외</strong>됩니다.
										</li>
										<li>제출 횟수는 별도의 제한이 없는 한 자유롭게 허용됩니다.</li>
									</ul>
								</div>

								<Separator />

								{/* 9. 부정행위 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<Ban className="h-5 w-5 text-destructive" />
										<span className="text-destructive">9.</span>
										부정행위
									</h3>
									<div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-3">
										<p className="text-sm font-semibold text-destructive mb-2">
											아래 행위는 부정행위로 간주되며, 운영진 판단에 따라 실격 처리될 수 있습니다:
										</p>
										<ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
											<li>계정 공유 또는 대리 참가</li>
											<li>코드 및 출력 결과 공유</li>
											<li>금지된 도구 사용</li>
											<li>운영진의 사전 허가 없는 외부 도움</li>
										</ul>
									</div>
								</div>

								<Separator />

								{/* 10. 기타 */}
								<div>
									<h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
										<AlertTriangle className="h-5 w-5 text-orange-600" />
										<span className="text-primary">10.</span>
										기타
									</h3>
									<ul className="list-disc list-inside space-y-2 text-sm text-muted-foreground ml-6">
										<li>
											문제 오류 또는 시스템 장애 발생 시 <strong>운영진에게 즉시 문의</strong>해야 합니다.
										</li>
										<li>
											모든 최종 판단은 운영진에게 있으며, 필요 시 재채점 또는 규칙이 보완될 수 있습니다.
										</li>
									</ul>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
			</section>

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
