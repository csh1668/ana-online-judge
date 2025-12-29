import { ArrowRight, Calculator, FileCode, Trophy, Users, Zap } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
                            </span>
                            {" "}대회 형식
                        </h1>
                        <p className="mt-6 text-lg leading-8 text-muted-foreground max-w-3xl mx-auto">
                            ANIGMA는 두 가지 Task로 구성된 특별한 대회 형식입니다.
                            Task 1에서는 입력 파일을 제출하고, Task 2에서는 코드를 제출하여
                            편집 거리(Edit Distance)에 따라 보너스 점수를 받을 수 있습니다.
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
                                        코드 A와 코드 B의 출력이 다른 입력을 찾으세요
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
                                        문제에서 제공하는 <strong>코드 A</strong>와 <strong>코드 B</strong>가
                                        다른 출력을 내는 입력 파일을 찾아 제출하세요.
                                    </p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                                        <Trophy className="h-5 w-5 text-purple-600" />
                                        점수
                                    </h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="default" className="bg-green-600">정답</Badge>
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
                                    <li>제출한 입력 파일을 코드 A와 코드 B에 각각 실행</li>
                                    <li>두 코드의 출력이 <strong>다르면</strong> 정답 (30점)</li>
                                    <li>두 코드의 출력이 <strong>같으면</strong> 오답 (0점)</li>
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
                                        ZIP 파일로 코드를 제출하고 편집 거리에 따라 보너스 점수를 받으세요
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
                                        Makefile이 포함된 ZIP 파일로 코드를 제출하세요.
                                        모든 테스트케이스를 통과하면 기본 점수를 받고,
                                        원본 코드와의 편집 거리가 작을수록 더 많은 보너스를 받습니다.
                                    </p>
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                                        <Trophy className="h-5 w-5 text-blue-600" />
                                        점수 구성
                                    </h3>
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="default" className="bg-blue-600">기본 점수</Badge>
                                            <span className="font-semibold">50점</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="default" className="bg-purple-600">보너스</Badge>
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
                                        <li>ZIP 파일에 Makefile이 있어야 합니다 (build, run 타겟 필수)</li>
                                        <li><code>make build</code>로 컴파일</li>
                                        <li>모든 테스트케이스에 대해 <code>make run file=input.txt</code> 실행</li>
                                        <li>모든 테스트케이스 통과 시 기본 50점 획득</li>
                                        <li>원본 코드와의 편집 거리(Levenshtein Distance) 계산</li>
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
                                                <li><strong>R_max</strong>: 모든 참가자의 best submission 중 최대 편집 거리</li>
                                                <li><strong>R_min</strong>: 모든 참가자의 best submission 중 최소 편집 거리</li>
                                                <li><strong>edit_distance</strong>: 현재 제출의 편집 거리</li>
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
                        <p className="mt-4 text-lg text-muted-foreground">
                            ANIGMA 대회의 등수 매기는 방식
                        </p>
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
                                        총점과 페널티로 순위가 결정됩니다
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
                                            <Badge variant="outline" className="mt-0.5">Task 1</Badge>
                                            <span>각 문제당 최대 30점</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <Badge variant="outline" className="mt-0.5">Task 2</Badge>
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
                                            스코어보드에는 각 유저의 <strong>best submission</strong>이 표시됩니다:
                                        </p>
                                        <div className="bg-muted/50 p-3 rounded space-y-2">
                                            <div className="flex items-start gap-2">
                                                <span className="font-semibold">Task 2:</span>
                                                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                                    <li>편집 거리가 <strong>가장 작은</strong> 제출 중</li>
                                                    <li>점수가 <strong>가장 높은</strong> 제출</li>
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
                                        <strong>총점</strong>이 높은 순서 (내림차순)
                                    </li>
                                    <li>
                                        총점이 같으면 <strong>페널티</strong>가 적은 순서 (오름차순)
                                    </li>
                                    <li>
                                        총점과 페널티가 모두 같으면 같은 등수
                                    </li>
                                </ol>
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
                                        <li>코드 A와 B의 출력이 달라야 정답</li>
                                        <li>정답 시 30점</li>
                                    </ul>
                                </div>
                                <div className="space-y-3">
                                    <h3 className="font-semibold text-lg">Task 2</h3>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                                        <li>ZIP 파일로 코드 제출</li>
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

