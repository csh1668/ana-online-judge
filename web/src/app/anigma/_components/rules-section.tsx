import { AlertTriangle, Ban, Clock, Shield } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function RulesSection() {
	return (
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
										대회 계정의{" "}
										<strong className="text-destructive">
											공유, 양도, 중복 사용은 엄격히 금지
										</strong>
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
										단,{" "}
										<strong className="text-destructive">
											ChatGPT, GitHub Copilot, Bing AI 등 자동으로 소스 코드를 생성하는 AI 기반
											서비스의 사용은 금지
										</strong>
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
									<li>
										<strong>C</strong>: C17
									</li>
									<li>
										<strong>C++</strong>: C++20
									</li>
									<li>
										<strong>Java</strong>: JDK 17
									</li>
									<li>
										<strong>Python</strong>: 3.11.2
									</li>
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
									<li>
										본 대회는 <strong>출력 기반 채점</strong>으로 진행됩니다.
									</li>
									<li>
										입출력 형식은{" "}
										<strong>공백, 줄바꿈을 포함하여 문제에서 요구한 형식과 정확히 일치</strong>
										해야 합니다.
									</li>
									<li>
										<strong>
											입출력을 제외한 비즈니스 로직에 결함이 존재하므로 입출력 코드를 임의로
											수정하는 행위는 권장하지 않습니다.
										</strong>
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
										출력 결과에 <code className="bg-muted px-1 rounded">[Error]</code> 태그가 포함된
										모든 예외 처리는 의도된 예외 처리로 간주됩니다.
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
										문제 오류 또는 시스템 장애 발생 시 <strong>운영진에게 즉시 문의</strong>해야
										합니다.
									</li>
									<li>
										모든 최종 판단은 운영진에게 있으며, 필요 시 재채점 또는 규칙이 보완될 수
										있습니다.
									</li>
								</ul>
							</div>
						</div>
					</CardContent>
				</Card>
			</div>
		</section>
	);
}
