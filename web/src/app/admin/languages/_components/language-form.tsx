"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { createLanguageAction, updateLanguageAction } from "@/actions/admin/languages";
import { Button } from "@/components/ui/button";
import type { LanguageAdminRow } from "@/lib/services/languages";
import {
	type FieldBinding,
	FormSection,
	SwitchField,
	TextAreaField,
	TextField,
} from "./language-form-fields";
import {
	errorMessage,
	type LanguageFormValues,
	toFormValues,
	toPayload,
} from "./language-form-values";

type Props = { mode: "create" } | { mode: "edit"; language: LanguageAdminRow };

export function LanguageForm(props: Props) {
	const language = props.mode === "edit" ? props.language : undefined;
	const router = useRouter();
	const [values, setValues] = useState<LanguageFormValues>(() => toFormValues(language));
	const [saving, setSaving] = useState(false);
	const isBuiltin = !!language && language.installScript === null;

	const b: FieldBinding = {
		values,
		setValue: (key, value) => setValues((prev) => ({ ...prev, [key]: value })),
		disabled: saving,
	};

	const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setSaving(true);
		try {
			const payload = toPayload(values);
			if (props.mode === "edit") {
				await updateLanguageAction(props.language.id, payload);
				toast.success("언어 설정을 저장했습니다.");
				router.refresh();
				setSaving(false);
			} else {
				const row = await createLanguageAction({ id: values.id.trim(), ...payload });
				toast.success("언어를 추가했습니다.");
				router.push(`/admin/languages/${row.id}`);
			}
		} catch (err) {
			toast.error(errorMessage(err, "저장에 실패했습니다."));
			setSaving(false);
		}
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-6">
			<FormSection title="기본">
				<div className="grid gap-4 sm:grid-cols-2">
					<TextField
						b={b}
						name="id"
						label="ID"
						required
						mono
						disabled={props.mode === "edit"}
						placeholder="예: kotlin"
						hint="소문자·숫자·_+- 최대 32자. 생성 후 변경할 수 없습니다."
					/>
					<TextField b={b} name="label" label="표시 이름" required placeholder="예: Kotlin" />
					<TextField b={b} name="version" label="버전" placeholder="예: 2.0.21" />
					<TextField
						b={b}
						name="aliases"
						label="별칭"
						placeholder="예: kt, kts"
						hint="쉼표로 구분합니다."
					/>
					<TextField b={b} name="sortOrder" label="정렬 순서" type="number" step="1" />
				</div>
				<SwitchField
					b={b}
					name="enabled"
					label="활성"
					hint="설치가 완료된 활성 언어만 제출 언어 목록에 나타납니다."
				/>
			</FormSection>

			<FormSection title="편집기">
				<div className="grid gap-4 sm:grid-cols-3">
					<TextField
						b={b}
						name="sourceFile"
						label="소스 파일명"
						required
						mono
						placeholder="Main.kt"
					/>
					<TextField b={b} name="fileExtension" label="확장자" required mono placeholder="kt" />
					<TextField b={b} name="monacoLanguage" label="Monaco 언어" mono placeholder="kotlin" />
				</div>
				<TextAreaField b={b} name="defaultCode" label="기본 코드" rows={8} />
			</FormSection>

			<FormSection title="실행 명령">
				<div className="grid gap-4 sm:grid-cols-2">
					<TextField b={b} name="compileCommand" label="컴파일 명령" mono />
					<TextField b={b} name="runCommand" label="실행 명령" required mono />
					<TextField b={b} name="displayCompileCommand" label="표시용 컴파일 명령" mono />
					<TextField b={b} name="displayRunCommand" label="표시용 실행 명령" mono />
					<TextField b={b} name="clientCompileCommand" label="클라이언트 컴파일 명령" mono />
					<TextField b={b} name="clientRunCommand" label="클라이언트 실행 명령" mono />
				</div>
				<SwitchField b={b} name="producesSingleBinary" label="단일 실행 파일 생성" />
				<TextAreaField
					b={b}
					name="env"
					label="환경 변수"
					rows={4}
					placeholder="JAVA_TOOL_OPTIONS=-Xss64m"
					hint="한 줄에 하나씩 KEY=VALUE 형식으로 입력합니다."
				/>
			</FormSection>

			<FormSection title="배율">
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
					<TextField b={b} name="timeMultiplier" label="시간 배율" type="number" step="0.001" />
					<TextField b={b} name="timeBonusMs" label="추가 시간 (ms)" type="number" step="1" />
					<TextField b={b} name="memoryMultiplier" label="메모리 배율" type="number" step="0.001" />
					<TextField b={b} name="memoryBonusMb" label="추가 메모리 (MB)" type="number" step="1" />
				</div>
			</FormSection>

			<FormSection title="호스트 컴파일">
				<SwitchField
					b={b}
					name="compileOnHost"
					label="호스트에서 컴파일"
					hint="isolate 밖에서 컴파일합니다. 신뢰할 수 있는 툴체인에만 사용하세요."
				/>
				{values.compileOnHost && (
					<TextAreaField b={b} name="compileScript" label="컴파일 스크립트" rows={8} />
				)}
			</FormSection>

			<FormSection title="설치 스크립트">
				{isBuiltin ? (
					<p className="text-sm text-muted-foreground">
						이미지 내장 언어입니다. 툴체인이 judge 이미지에 포함되어 있어 설치 스크립트가 없습니다.
					</p>
				) : (
					<TextAreaField
						b={b}
						name="installScript"
						label="설치 스크립트"
						rows={12}
						placeholder={"#!/bin/sh\nset -e\n"}
						hint={
							<>
								<code className="font-mono">$AOJ_PREFIX</code> 아래에만 설치하세요. 명령어에서는{" "}
								<code className="font-mono">{"{prefix}"}</code>로 참조합니다. 비워 두면 이미지 내장
								언어로 취급됩니다.
							</>
						}
					/>
				)}
			</FormSection>

			<div className="flex justify-end gap-2">
				<Button type="button" variant="outline" onClick={() => router.back()} disabled={saving}>
					취소
				</Button>
				<Button type="submit" disabled={saving}>
					{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					{saving ? "저장 중..." : props.mode === "edit" ? "저장" : "언어 추가"}
				</Button>
			</div>
		</form>
	);
}
