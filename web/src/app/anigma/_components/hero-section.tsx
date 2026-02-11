import { ArrowRight, FileCode } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function HeroSection() {
	return (
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
	);
}
