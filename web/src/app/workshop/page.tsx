import Link from "next/link";
import { redirect } from "next/navigation";
import { listMyWorkshopProblems } from "@/actions/workshop/problems";
import { Button } from "@/components/ui/button";

export default async function WorkshopListPage() {
	let problems: Awaited<ReturnType<typeof listMyWorkshopProblems>>;
	try {
		problems = await listMyWorkshopProblems();
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		if (err instanceof Error && err.message.includes("권한")) {
			return (
				<div className="container mx-auto p-6">
					<h1 className="text-2xl font-bold mb-4">창작마당</h1>
					<p className="text-muted-foreground">
						창작마당 접근 권한이 없습니다. 관리자에게 문의하세요.
					</p>
				</div>
			);
		}
		throw err;
	}

	return (
		<div className="container mx-auto p-6">
			<div className="flex items-center justify-between mb-6">
				<h1 className="text-2xl font-bold">창작마당</h1>
				<Button asChild>
					<Link href="/workshop/new">새 문제 만들기</Link>
				</Button>
			</div>
			{problems.length === 0 ? (
				<p className="text-muted-foreground">
					아직 만든 문제가 없습니다. "새 문제 만들기"로 시작하세요.
				</p>
			) : (
				<ul className="space-y-2">
					{problems.map((p) => (
						<li key={p.id}>
							<Link href={`/workshop/${p.id}`} className="block p-4 border rounded hover:bg-accent">
								<div className="font-medium">{p.title}</div>
								<div className="text-xs text-muted-foreground mt-1">
									{p.problemType} · {p.timeLimit}ms · {p.memoryLimit}MB
								</div>
							</Link>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
