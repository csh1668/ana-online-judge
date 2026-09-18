import { notFound, redirect } from "next/navigation";
import { getWorkshopProblemWithDraft } from "@/actions/workshop/problems";
import { getWorkshopTransformer } from "@/actions/workshop/transformer";
import { TransformerClient } from "./transformer-client";

export const dynamic = "force-dynamic";

/**
 * Starting point shown when a draft has no transformer saved yet (two_step
 * drafts have no bundled default -- see workshop-transformer.ts).
 */
const DEFAULT_TRANSFORMER_TEMPLATE = `#include "aoj_transformer.h"

// phase: 1 또는 2. 1회차에는 raw_stage1()이 빈 문자열이다.
void transform(int phase) {
	if (phase == 1) {
		// 1단계: 원본 입력을 그대로 다음 단계로 전달하는 예시
		std::cout << raw_input();
	} else {
		// 2단계: 1단계 유저 출력(stage1)을 검증하고 페이로드를 만든다
		std::string stage1 = raw_stage1();
		if (stage1.empty()) {
			quitf(_pe, "1단계 출력이 비어 있습니다");
		}

		// 검증 로직 예시
		// if (조건 위반) quitf(_wa, "설명: %s", stage1.c_str());

		std::cout << stage1;
	}
}
`;

export default async function WorkshopTransformerPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = await params;
	if (!/^\d+$/.test(id)) notFound();
	const problemId = Number.parseInt(id, 10);
	if (!Number.isFinite(problemId) || problemId <= 0) notFound();

	let data: Awaited<ReturnType<typeof getWorkshopProblemWithDraft>>;
	try {
		data = await getWorkshopProblemWithDraft(problemId);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		notFound();
	}
	const { problem, draft } = data;

	let transformer: Awaited<ReturnType<typeof getWorkshopTransformer>> | null = null;
	try {
		transformer = await getWorkshopTransformer(problem.id);
	} catch (err) {
		if (err instanceof Error && err.message.includes("로그인")) redirect("/login");
		// 아직 변환기가 저장되지 않은 드래프트 -- 빈 상태에서 새로 작성을 시작한다.
		transformer = null;
	}

	return (
		<div className="space-y-6">
			{draft.problemType !== "two_step" && (
				<p className="text-sm text-muted-foreground">
					이 문제는 투스탭이 아닙니다 — 변환기는 문제 유형이 투스탭일 때만 채점에 사용됩니다.
				</p>
			)}
			<p className="text-sm text-muted-foreground">
				변환기는 테스트케이스당 1회차·2회차에 각각 한 번씩 호출됩니다. 호출 인자는{" "}
				<code className="font-mono">input.txt stage1.txt phase.txt</code> 세 개이며, 표준출력이 다음
				단계의 표준입력 전체가 됩니다. 1회차 호출에서는{" "}
				<code className="font-mono">stage1.txt</code>가 빈 파일입니다. 종료 코드 0은 통과, 1은 오답,
				2는 형식 오류, 3은 출제자 버그입니다. C++은 aoj_transformer.h, Python은 aoj_checker.py의
				Transformer 클래스를 사용하며, 페이로드는 각각 std::cout / print로 직접 씁니다. 체커는
				투스탭과 별개이며 선택 사항입니다 — 없으면 정답과 문자열 비교합니다.
			</p>
			<TransformerClient
				problemId={problem.id}
				initialLanguage={transformer?.language ?? "cpp"}
				initialSource={transformer?.source ?? DEFAULT_TRANSFORMER_TEMPLATE}
				initialVersion={transformer?.version ?? draft.version}
				hasPersisted={transformer !== null}
			/>
		</div>
	);
}
