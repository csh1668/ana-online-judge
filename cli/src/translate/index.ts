import { Command } from "commander";
import chalk from "chalk";
import { ApiClient, getGeminiKey } from "../client.js";
import { loadCharacterPool, pickRandomNames } from "./characters.js";
import { GeminiTranslator } from "./gemini.js";
import { runPipeline, printSummary } from "./pipeline.js";
import type { LanguageCode, Translations } from "./types.js";

const SUPPORTED_TARGET: LanguageCode = "ko";
const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_CONCURRENCY = 5;

interface TranslateOpts {
	to: string;
	from: string;
	model: string;
	concurrency: string;
	force: boolean;
	dryRun: boolean;
	allMissing: boolean;
	characters?: string;
	prompt?: string;
	limit?: string;
}

export function registerTranslateCommand(program: Command): void {
	program
		.command("translate")
		.description("LLM(Google Gemini)으로 문제 본문을 한국어로 번역해 저장")
		.argument("[ids...]", "번역할 problem id 목록 (--all-missing 사용 시 비워둠)")
		.option("--to <lang>", "타깃 언어 (현재 ko만 지원)", "ko")
		.option("--from <lang>", "원문 언어 강제 (auto면 problems.translations.original 사용)", "auto")
		.option("--model <id>", "Gemini 모델 ID", DEFAULT_MODEL)
		.option("--concurrency <n>", "동시 실행 개수", String(DEFAULT_CONCURRENCY))
		.option("--force", "이미 ko 번역이 있어도 덮어쓰기", false)
		.option("--dry-run", "LLM 호출만 하고 결과를 stdout에 출력 (DB 저장 안 함)", false)
		.option("--all-missing", "한국어 번역이 없는 모든 문제 일괄 처리", false)
		.option("--characters <path>", "인물 풀 텍스트 파일 경로 (한 줄에 한 명, 기본: ~/.aoj-characters.txt)")
		.option("--prompt <path>", "시스템 프롬프트 마크다운 경로 (기본: 내장)")
		.option("--limit <n>", "--all-missing 사용 시 최대 처리 개수")
		.action(runTranslate);
}

async function runTranslate(rawIds: string[], opts: TranslateOpts): Promise<void> {
	if (opts.to !== SUPPORTED_TARGET) {
		console.error(chalk.red(`현재 --to는 ${SUPPORTED_TARGET}만 지원합니다.`));
		process.exit(1);
	}
	if (opts.allMissing && rawIds.length > 0) {
		console.error(chalk.red("--all-missing과 명시적 id는 동시에 사용할 수 없습니다."));
		process.exit(1);
	}
	if (!opts.allMissing && rawIds.length === 0) {
		console.error(chalk.red("문제 id를 지정하거나 --all-missing 옵션을 사용하세요."));
		process.exit(1);
	}

	const apiClient = new ApiClient();
	const geminiKey = getGeminiKey();

	const concurrency = Number.parseInt(opts.concurrency, 10);
	if (!Number.isFinite(concurrency) || concurrency < 1) {
		console.error(chalk.red(`잘못된 --concurrency 값: ${opts.concurrency}`));
		process.exit(1);
	}

	const translator = new GeminiTranslator({
		apiKey: geminiKey,
		model: opts.model,
		promptPath: opts.prompt,
	});

	const characterPool = loadCharacterPool(opts.characters);
	if (characterPool.length === 0) {
		console.error(
			chalk.yellow(
				"인물 풀이 비어 있음 (translate-characters.json 없음). LLM이 한국식 일반 이름으로 자체 치환합니다.",
			),
		);
	} else {
		console.error(chalk.dim(`인물 풀 로드: ${characterPool.length}명. 매 호출마다 무작위 5명 선택.`));
	}

	const ids = opts.allMissing
		? await collectMissingKoreanIds(
				apiClient,
				opts.limit ? Number.parseInt(opts.limit, 10) : undefined,
			)
		: rawIds.map((s) => Number.parseInt(s, 10)).filter((n) => Number.isFinite(n));

	if (ids.length === 0) {
		console.error(chalk.yellow("처리할 문제가 없습니다."));
		return;
	}

	console.error(
		chalk.bold(`총 ${ids.length}개 문제 번역 시작 (model=${opts.model}, concurrency=${concurrency})`),
	);

	const result = await runPipeline(
		ids,
		(id) => processOne(id, { apiClient, translator, characterPool, opts }),
		{ concurrency, totalCount: ids.length },
	);

	printSummary(result);
	if (result.failures.length > 0) process.exit(1);
}

interface ProcessContext {
	apiClient: ApiClient;
	translator: GeminiTranslator;
	characterPool: string[];
	opts: TranslateOpts;
}

async function processOne(
	problemId: number,
	ctx: ProcessContext,
): Promise<
	| { status: "ok"; output: { title: string; content: string }; tookMs: number }
	| { status: "skip"; reason: string }
	| { status: "fail"; reason: string }
> {
	let translations: Translations;
	try {
		translations = await ctx.apiClient.get<Translations>(`/problems/${problemId}/translations`);
	} catch (err) {
		return { status: "fail", reason: `GET translations: ${describe(err)}` };
	}

	if (!ctx.opts.force && translations.entries[SUPPORTED_TARGET]) {
		return { status: "skip", reason: "이미 ko 번역 있음 (--force로 덮어쓰기)" };
	}

	const sourceLang =
		ctx.opts.from === "auto" ? translations.original : (ctx.opts.from as LanguageCode);
	const sourceEntry = translations.entries[sourceLang];
	if (!sourceEntry) {
		return { status: "fail", reason: `원문 언어 ${sourceLang} 본문이 없음` };
	}

	const characterNames = pickRandomNames(ctx.characterPool, 5);

	const startedAt = Date.now();
	let output: { title: string; content: string };
	try {
		output = await ctx.translator.translate({
			problemId,
			sourceLang,
			sourceTitle: sourceEntry.title,
			sourceContent: sourceEntry.content,
			characterNames,
		});
	} catch (err) {
		return { status: "fail", reason: `Gemini: ${describe(err)}` };
	}
	const tookMs = Date.now() - startedAt;

	if (ctx.opts.dryRun) {
		console.log("\n" + "=".repeat(60));
		console.log(`# Problem ${problemId} (dry-run)`);
		console.log(`Source: ${sourceLang} → ko (chars: ${characterNames.join(", ") || "(none)"})`);
		console.log("---");
		console.log(`Title: ${output.title}`);
		console.log("---");
		console.log(output.content);
		return { status: "ok", output, tookMs };
	}

	try {
		await ctx.apiClient.post(`/problems/${problemId}/translations/${SUPPORTED_TARGET}`, {
			title: output.title,
			content: output.content,
		});
	} catch (err) {
		return { status: "fail", reason: `POST translations: ${describe(err)}` };
	}

	return { status: "ok", output, tookMs };
}

async function collectMissingKoreanIds(
	apiClient: ApiClient,
	limit?: number,
): Promise<number[]> {
	const collected: number[] = [];
	let page = 1;
	const perPage = 100;
	while (true) {
		const resp = await apiClient.get<{
			problems: Array<{ id: number }>;
			total: number;
		}>(`/problems?page=${page}&limit=${perPage}`);
		if (resp.problems.length === 0) break;
		for (const p of resp.problems) {
			try {
				const tr = await apiClient.get<Translations>(`/problems/${p.id}/translations`);
				if (!tr.entries[SUPPORTED_TARGET]) {
					collected.push(p.id);
					if (limit !== undefined && collected.length >= limit) return collected;
				}
			} catch {
				// 번역 조회 실패는 무시 (404 등)
			}
		}
		if (page * perPage >= resp.total) break;
		page++;
	}
	return collected;
}

function describe(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}
