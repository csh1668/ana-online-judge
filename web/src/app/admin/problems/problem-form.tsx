"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
	addProblemStaff,
	createProblem,
	deleteTranslation,
	promoteOriginal,
	updateProblem,
	upsertTranslation,
} from "@/actions/admin";
import { setProblemSourcesAction } from "@/actions/sources/linking";
import { TranslationTabs } from "@/components/problems/translation-tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { Language, LanguageCode, ProblemType, Translations } from "@/db/schema";
import {
	JUDGE_PRIORITY_LABELS,
	JUDGE_PRIORITY_LEVELS,
	type JudgePriority,
} from "@/lib/judge-priority";
import { getLanguageList } from "@/lib/languages";
import { DEFAULT_STATEMENT_CONTENT } from "@/lib/utils/default-statement";
import { LANGUAGE_DISPLAY_NAMES, nowIso } from "@/lib/utils/translations";
import { type PendingSourceEntry, PendingSourcesPicker } from "./pending-sources-picker";
import { PendingStaffPicker, type StaffUser } from "./pending-staff-picker";

interface ProblemFormProps {
	problem?: {
		id: number;
		translations: Translations;
		displayTitle: string;
		timeLimit: number;
		memoryLimit: number;
		maxScore: number;
		isPublic: boolean;
		judgeAvailable: boolean;
		hasSubtasks: boolean;
		problemType: ProblemType;
		checkerPath: string | null;
		validatorPath: string | null;
		referenceCodePath: string | null;
		solutionCodePath: string | null;
		allowedLanguages: string[] | null;
		useFullJudge: boolean;
		passThreshold: number | null;
		showCheckerOutput: boolean;
		judgePriority: number;
	};
	testcaseCount?: number;
}

function createDefaultTranslations(): Translations {
	const now = nowIso();
	return {
		original: "ko",
		entries: {
			ko: {
				title: "",
				content: DEFAULT_STATEMENT_CONTENT,
				createdAt: now,
				updatedAt: now,
			},
		},
	};
}

export function ProblemForm({ problem, testcaseCount }: ProblemFormProps) {
	const router = useRouter();
	const languages = getLanguageList();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [translations, setTranslations] = useState<Translations>(
		problem?.translations ?? createDefaultTranslations()
	);
	const [initialTranslations] = useState<Translations>(
		problem?.translations ?? createDefaultTranslations()
	);
	const [problemType, setProblemType] = useState<ProblemType>(problem?.problemType || "icpc");

	const DEFAULT_MAX_SCORE = 100;
	const [allowedLanguages, setAllowedLanguages] = useState<Language[]>(
		(problem?.allowedLanguages as Language[]) || []
	);
	const [referenceCodeFile, setReferenceCodeFile] = useState<File | null>(null);
	const [solutionCodeFile, setSolutionCodeFile] = useState<File | null>(null);
	const [maxScore, setMaxScore] = useState<number>(problem?.maxScore || DEFAULT_MAX_SCORE);
	const hasSubtasks = problem?.hasSubtasks ?? false;
	const [useFullJudge, setUseFullJudge] = useState<boolean>(problem?.useFullJudge ?? false);
	const [passThreshold, setPassThreshold] = useState<number | null>(problem?.passThreshold ?? null);
	const [showCheckerOutput, setShowCheckerOutput] = useState<boolean>(
		problem?.showCheckerOutput ?? false
	);
	const [judgePriority, setJudgePriority] = useState<JudgePriority>(
		(problem?.judgePriority as JudgePriority) ?? 0
	);
	const [pendingAuthors, setPendingAuthors] = useState<StaffUser[]>([]);
	const [pendingReviewers, setPendingReviewers] = useState<StaffUser[]>([]);
	const [pendingSources, setPendingSources] = useState<PendingSourceEntry[]>([]);

	const isEditing = !!problem;

	async function handlePromoteOriginal(lang: LanguageCode) {
		if (isEditing && problem) {
			try {
				const updated = await promoteOriginal(problem.id, lang);
				setTranslations(updated);
			} catch (err) {
				setError(err instanceof Error ? err.message : "원문 지정 중 오류가 발생했습니다.");
			}
		} else {
			setTranslations({ ...translations, original: lang });
		}
	}

	async function handleDeleteLanguage(lang: LanguageCode) {
		if (isEditing && problem) {
			try {
				const updated = await deleteTranslation(problem.id, lang);
				setTranslations(updated);
			} catch (err) {
				setError(err instanceof Error ? err.message : "번역 삭제 중 오류가 발생했습니다.");
			}
		} else {
			const { [lang]: _removed, ...rest } = translations.entries;
			setTranslations({ ...translations, entries: rest });
		}
	}

	async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setIsSubmitting(true);
		setError(null);

		const formData = new FormData(event.currentTarget);
		const customIdValue = formData.get("customId") as string;
		const customId = customIdValue ? parseInt(customIdValue, 10) : undefined;

		interface CreateData {
			id?: number;
			translations: Translations;
			timeLimit: number;
			memoryLimit: number;
			maxScore: number;
			isPublic: boolean;
			judgeAvailable: boolean;
			problemType?: "icpc" | "special_judge" | "anigma" | "interactive";
			useFullJudge: boolean;
			passThreshold: number | null;
			showCheckerOutput: boolean;
			judgePriority: number;
			allowedLanguages?: string[] | null;
			referenceCodeFile?: File | null;
			solutionCodeFile?: File | null;
		}

		interface UpdateData {
			timeLimit: number;
			memoryLimit: number;
			maxScore: number;
			isPublic: boolean;
			judgeAvailable: boolean;
			problemType?: "icpc" | "special_judge" | "anigma" | "interactive";
			useFullJudge: boolean;
			passThreshold: number | null;
			showCheckerOutput: boolean;
			judgePriority: number;
			allowedLanguages?: string[] | null;
			referenceCodeFile?: File | null;
			solutionCodeFile?: File | null;
		}

		const commonFields = {
			timeLimit: parseInt(formData.get("timeLimit") as string, 10),
			memoryLimit: parseInt(formData.get("memoryLimit") as string, 10),
			maxScore,
			isPublic: formData.get("isPublic") === "on",
			judgeAvailable: formData.get("judgeAvailable") === "on",
			problemType,
			useFullJudge,
			passThreshold: useFullJudge ? passThreshold : null,
			// 체커 출력 공개는 스페셜 저지/인터랙티브에만 의미가 있으므로 그 외 유형은 강제 false.
			showCheckerOutput:
				problemType === "special_judge" || problemType === "interactive"
					? showCheckerOutput
					: false,
			judgePriority,
			allowedLanguages: allowedLanguages.length > 0 ? allowedLanguages : null,
		};

		const referenceCodeAttachment =
			problemType === "anigma" && referenceCodeFile ? referenceCodeFile : undefined;
		const solutionCodeAttachment =
			problemType === "anigma" && solutionCodeFile ? solutionCodeFile : undefined;

		try {
			if (isEditing && problem) {
				const updateData: UpdateData = {
					...commonFields,
				};
				if (referenceCodeAttachment) updateData.referenceCodeFile = referenceCodeAttachment;
				if (solutionCodeAttachment) updateData.solutionCodeFile = solutionCodeAttachment;
				await updateProblem(problem.id, updateData);

				// 현재 state의 모든 언어에 대해 upsertTranslation 호출 (멱등).
				const langs = Object.keys(translations.entries) as LanguageCode[];
				for (const lang of langs) {
					const entry = translations.entries[lang];
					if (!entry) continue;
					await upsertTranslation(problem.id, lang, {
						title: entry.title,
						content: entry.content,
					});
				}

				// 원문이 변경되었다면 promoteOriginal 호출 (멱등).
				if (initialTranslations.original !== translations.original) {
					await promoteOriginal(problem.id, translations.original);
				}

				router.push("/admin/problems");
			} else {
				const createData: CreateData = {
					id: customId,
					translations,
					...commonFields,
				};
				if (referenceCodeAttachment) createData.referenceCodeFile = referenceCodeAttachment;
				if (solutionCodeAttachment) createData.solutionCodeFile = solutionCodeAttachment;
				const newProblem = await createProblem(createData);

				try {
					for (const s of pendingAuthors) {
						const target = s.kind === "user" ? { userId: s.id } : { externalName: s.name };
						await addProblemStaff(newProblem.id, "author", target);
					}
					for (const s of pendingReviewers) {
						const target = s.kind === "user" ? { userId: s.id } : { externalName: s.name };
						await addProblemStaff(newProblem.id, "reviewer", target);
					}
					if (pendingSources.length > 0) {
						await setProblemSourcesAction(
							newProblem.id,
							pendingSources.map((e) => ({
								sourceId: e.sourceId,
								problemNumber: e.problemNumber.trim() === "" ? null : e.problemNumber.trim(),
							}))
						);
					}
				} catch (extraErr) {
					const baseMsg =
						extraErr instanceof Error ? extraErr.message : "알 수 없는 오류가 발생했습니다.";
					setError(
						`문제는 생성되었으나 부가 정보 저장에 실패했습니다. 수정 페이지에서 다시 시도하세요. (${baseMsg})`
					);
					router.push(`/admin/problems/${newProblem.id}`);
					return;
				}

				router.push(`/admin/problems/${newProblem.id}/testcases`);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : "저장 중 오류가 발생했습니다.");
		} finally {
			setIsSubmitting(false);
		}
	}

	return (
		<form onSubmit={onSubmit}>
			<Card>
				<CardHeader>
					<CardTitle>{isEditing ? "문제 수정" : "문제 정보"}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-6">
					{error && (
						<div className="bg-destructive/15 text-destructive text-sm p-3 rounded-md">{error}</div>
					)}

					{!isEditing && (
						<div className="space-y-2">
							<Label htmlFor="customId">문제 ID (선택사항)</Label>
							<Input
								id="customId"
								name="customId"
								type="number"
								placeholder="비워두면 자동 할당됩니다"
								min={1}
								disabled={isSubmitting}
							/>
							<p className="text-xs text-muted-foreground">
								문제 ID를 지정하지 않으면 자동으로 증가하는 번호가 할당됩니다.
							</p>
						</div>
					)}

					{!isEditing && Object.keys(translations.entries).length === 1 && (
						<div className="space-y-2">
							<Label htmlFor="initialLanguage">원문 언어</Label>
							<Select
								value={translations.original}
								onValueChange={(v) => {
									const newLang = v as LanguageCode;
									const currentLangs = Object.keys(translations.entries) as LanguageCode[];
									if (currentLangs.length !== 1) return;
									const [oldLang] = currentLangs;
									if (oldLang === newLang) return;
									const entry = translations.entries[oldLang];
									if (!entry) return;
									setTranslations({
										original: newLang,
										entries: { [newLang]: entry },
									});
								}}
								disabled={isSubmitting}
							>
								<SelectTrigger id="initialLanguage" className="w-64">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{(Object.keys(LANGUAGE_DISPLAY_NAMES) as LanguageCode[]).map((lang) => (
										<SelectItem key={lang} value={lang}>
											{LANGUAGE_DISPLAY_NAMES[lang]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								문제 본문을 처음 작성할 언어. 번역은 아래 탭에서 언제든 추가할 수 있습니다.
							</p>
						</div>
					)}

					<div className="space-y-2">
						<Label>번역</Label>
						<TranslationTabs
							value={translations}
							onChange={setTranslations}
							onPromoteOriginal={handlePromoteOriginal}
							onDeleteLanguage={handleDeleteLanguage}
							problemId={problem?.id}
						/>
					</div>

					{!isEditing && (
						<>
							<PendingSourcesPicker
								entries={pendingSources}
								onChange={setPendingSources}
								disabled={isSubmitting}
							/>
							<PendingStaffPicker
								authors={pendingAuthors}
								reviewers={pendingReviewers}
								onChange={(next) => {
									setPendingAuthors(next.authors);
									setPendingReviewers(next.reviewers);
								}}
								disabled={isSubmitting}
							/>
						</>
					)}

					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="timeLimit">시간 제한 (ms)</Label>
							<Input
								id="timeLimit"
								name="timeLimit"
								type="number"
								defaultValue={problem?.timeLimit || 1000}
								min={100}
								max={100000}
								required
								disabled={isSubmitting}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="memoryLimit">메모리 제한 (MB)</Label>
							<Input
								id="memoryLimit"
								name="memoryLimit"
								type="number"
								defaultValue={problem?.memoryLimit || 256}
								min={4}
								max={2048}
								required
								disabled={isSubmitting}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="maxScore">최대 점수</Label>
							<Input
								id="maxScore"
								name="maxScore"
								type="number"
								value={maxScore}
								onChange={(e) => setMaxScore(parseInt(e.target.value, 10) || 0)}
								min={1}
								max={1000}
								required
								disabled={isSubmitting || hasSubtasks}
							/>
							{hasSubtasks && (
								<p className="text-xs text-muted-foreground">
									서브테스크 문제는 Σ 테스트케이스 점수로 자동 계산됩니다.
								</p>
							)}
							{problemType === "anigma" && (
								<p className="text-xs text-muted-foreground">ANIGMA: 무조건 100점 만점으로 설정</p>
							)}
						</div>
						<div className="space-y-2">
							<Label htmlFor="problemType">문제 유형</Label>
							<Select
								value={problemType}
								onValueChange={(value) => {
									const newType = value as ProblemType;
									setProblemType(newType);
									// 문제 유형 변경 시 max_score 기본값도 변경 (편집 중이 아닌 새 문제 생성 시만)
									if (!problem) {
										setMaxScore(DEFAULT_MAX_SCORE);
									}
								}}
								disabled={isSubmitting}
							>
								<SelectTrigger id="problemType">
									<SelectValue placeholder="문제 유형 선택" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="icpc">ICPC (일반)</SelectItem>
									<SelectItem value="special_judge">스페셜 저지</SelectItem>
									<SelectItem value="interactive">인터랙티브</SelectItem>
									<SelectItem value="anigma">ANIGMA</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="judgePriority">채점 우선순위</Label>
							<Select
								value={String(judgePriority)}
								onValueChange={(value) => setJudgePriority(Number(value) as JudgePriority)}
								disabled={isSubmitting}
							>
								<SelectTrigger id="judgePriority">
									<SelectValue placeholder="채점 우선순위 선택" />
								</SelectTrigger>
								<SelectContent>
									{[...JUDGE_PRIORITY_LEVELS].reverse().map((level) => (
										<SelectItem key={level} value={String(level)}>
											{JUDGE_PRIORITY_LABELS[level]}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							<p className="text-xs text-muted-foreground">
								채점 큐 배정 우선순위. 기본값(보통)이면 일반 큐, 높음/낮음은 별도 우선순위 큐로
								처리됩니다.
							</p>
						</div>
						<div className="space-y-2 col-span-2">
							<div className="flex items-center space-x-2">
								<Switch
									id="useFullJudge"
									checked={useFullJudge}
									onCheckedChange={(v) => {
										setUseFullJudge(v);
										if (!v) setPassThreshold(null);
									}}
									disabled={isSubmitting || hasSubtasks || problemType === "anigma"}
								/>
								<Label htmlFor="useFullJudge">전체 채점 사용</Label>
							</div>
							{useFullJudge && testcaseCount !== undefined && testcaseCount > 0 && (
								<div className="space-y-1">
									<Label htmlFor="passThreshold">통과 기준 (M) — 총 {testcaseCount}개 중</Label>
									<Input
										id="passThreshold"
										type="number"
										min={1}
										max={testcaseCount}
										value={passThreshold ?? testcaseCount}
										onChange={(e) => setPassThreshold(parseInt(e.target.value, 10) || null)}
										disabled={isSubmitting}
									/>
									<p className="text-xs text-muted-foreground">
										M개 이상 맞으면 정답 처리. 1 ≤ M ≤ {testcaseCount}.
									</p>
								</div>
							)}
							{useFullJudge && (testcaseCount === undefined || testcaseCount === 0) && (
								<p className="text-xs text-muted-foreground">
									테스트케이스 업로드 후 통과 기준을 설정할 수 있습니다.
								</p>
							)}
							{(hasSubtasks || problemType === "anigma") && (
								<p className="text-xs text-muted-foreground">
									{hasSubtasks ? "서브테스크" : "Anigma"} 문제에서는 전체 채점을 사용할 수 없습니다.
								</p>
							)}
						</div>
					</div>

					{(problemType === "special_judge" || problemType === "interactive") && (
						<div className="p-4 border rounded-md bg-muted/50 space-y-4">
							<p className="text-sm text-muted-foreground">
								{problemType === "interactive" ? "인터랙티브" : "스페셜 저지"} 문제입니다. 문제 저장
								후 &quot;설정&quot; 탭에서 체커를 업로드해주세요.
							</p>
							{problem?.checkerPath && (
								<p className="text-sm text-green-600">
									✓ 체커가 설정되어 있습니다: {problem.checkerPath}
								</p>
							)}
							<div className="space-y-2">
								<div className="flex items-center space-x-2">
									<Switch
										id="showCheckerOutput"
										checked={showCheckerOutput}
										onCheckedChange={setShowCheckerOutput}
										disabled={isSubmitting}
									/>
									<Label htmlFor="showCheckerOutput">체커 출력 제출자에게 공개</Label>
								</div>
								<p className="text-xs text-muted-foreground">
									끄면(기본값) 체커 출력은 관리자에게만 보입니다. 켜면 제출자도 자신의 제출 상세에서
									체커 출력을 볼 수 있습니다.
								</p>
							</div>
						</div>
					)}

					{problemType === "anigma" && (
						<div className="space-y-4">
							<div className="p-4 border rounded-md bg-secondary border-border">
								<p className="text-sm text-foreground font-medium mb-2">ANIGMA 문제</p>
								<ul className="text-sm text-foreground list-disc list-inside space-y-1">
									<li>Task 1 (30점): 사용자가 input 파일을 제출, A와 B의 출력이 달라야 정답</li>
									<li>Task 2 (50점): 사용자가 ZIP 파일을 제출, 테스트케이스 통과</li>
									<li>보너스 (최대 20점): 대회 제출 시 편집 거리 기반 동적 계산</li>
								</ul>
								<p className="text-xs text-muted-foreground mt-2">
									※ 비대회: max_score=70 (보너스 없음) / 대회: max_score=50 + 보너스 최대 20점
								</p>
							</div>

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label htmlFor="referenceCode">문제 제공 코드 A (ZIP 파일)</Label>
									<Input
										id="referenceCode"
										type="file"
										accept=".zip"
										onChange={(e) => {
											if (e.target.files?.[0]) {
												setReferenceCodeFile(e.target.files[0]);
											}
										}}
										disabled={isSubmitting}
										className="cursor-pointer"
									/>
									<p className="text-sm text-muted-foreground">
										Task 1에서 A로 사용될 코드 (Makefile 포함 ZIP)
									</p>
									{problem?.referenceCodePath && (
										<p className="text-sm text-green-600 dark:text-green-400">
											✓ 코드 A가 설정되어 있습니다
										</p>
									)}
								</div>

								<div className="space-y-2">
									<Label htmlFor="solutionCode">정답 코드 B (ZIP 파일)</Label>
									<Input
										id="solutionCode"
										type="file"
										accept=".zip"
										onChange={(e) => {
											if (e.target.files?.[0]) {
												setSolutionCodeFile(e.target.files[0]);
											}
										}}
										disabled={isSubmitting}
										className="cursor-pointer"
									/>
									<p className="text-sm text-muted-foreground">
										Task 1에서 B로 사용될 정답 코드 (Makefile 포함 ZIP)
									</p>
									{problem?.solutionCodePath && (
										<p className="text-sm text-green-600 dark:text-green-400">
											✓ 코드 B가 설정되어 있습니다
										</p>
									)}
								</div>
							</div>
						</div>
					)}

					<div className="space-y-2">
						<Label>허용 언어 (선택하지 않으면 모든 언어 허용)</Label>
						<div className="flex flex-wrap gap-4 p-4 border rounded-md">
							{languages.map((lang) => (
								<div key={lang.value} className="flex items-center space-x-2">
									<Checkbox
										id={`lang-${lang.value}`}
										checked={allowedLanguages.includes(lang.value)}
										onCheckedChange={(checked) => {
											if (checked) {
												setAllowedLanguages([...allowedLanguages, lang.value]);
											} else {
												setAllowedLanguages(allowedLanguages.filter((l) => l !== lang.value));
											}
										}}
										disabled={isSubmitting}
									/>
									<Label htmlFor={`lang-${lang.value}`} className="cursor-pointer font-normal">
										{lang.label}
									</Label>
								</div>
							))}
						</div>
					</div>

					<div className="flex gap-6">
						<div className="flex items-center space-x-2">
							<Switch
								id="isPublic"
								name="isPublic"
								defaultChecked={problem?.isPublic || false}
								disabled={isSubmitting}
							/>
							<Label htmlFor="isPublic">공개</Label>
						</div>

						<div className="flex items-center space-x-2">
							<Switch
								id="judgeAvailable"
								name="judgeAvailable"
								defaultChecked={problem?.judgeAvailable ?? true}
								disabled={isSubmitting}
							/>
							<Label htmlFor="judgeAvailable">채점 가능</Label>
						</div>
					</div>

					<div className="flex justify-end gap-2">
						<Button
							type="button"
							variant="outline"
							onClick={() => router.back()}
							disabled={isSubmitting}
						>
							취소
						</Button>
						<Button type="submit" disabled={isSubmitting}>
							{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{isEditing ? "수정" : "다음 (테스트케이스 추가)"}
						</Button>
					</div>
				</CardContent>
			</Card>
		</form>
	);
}
