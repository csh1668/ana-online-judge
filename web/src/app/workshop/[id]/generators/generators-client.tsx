"use client";

import { useEffect, useState } from "react";
import {
	deleteWorkshopGenerator,
	getWorkshopGeneratorTemplate,
	readWorkshopGeneratorSource,
	saveWorkshopGeneratorSource,
	uploadWorkshopGenerator,
} from "@/actions/workshop/generators";
import { Badge } from "@/components/ui/badge";
import {
	type LanguageOption,
	type ManagerRow,
	MultiSourceManager,
} from "../_components/multi-source-manager";
import { monacoLangFor } from "../_components/source-input";

type Row = ManagerRow & {
	language: string;
};

const LANGUAGES: LanguageOption[] = [
	{ value: "c", label: "C" },
	{ value: "cpp", label: "C++" },
	{ value: "python", label: "Python" },
	{ value: "java", label: "Java" },
	{ value: "rust", label: "Rust" },
	{ value: "go", label: "Go" },
	{ value: "javascript", label: "JavaScript" },
];

const TEMPLATES = [
	{ id: "cpp", label: "C++ 템플릿", description: "testlib.h registerGen 예시" },
	{ id: "python", label: "Python 템플릿", description: "argparse 기반 seed 처리" },
];

function extensionFor(lang: string): string {
	switch (lang) {
		case "cpp":
			return "cpp";
		case "c":
			return "c";
		case "python":
			return "py";
		case "java":
			return "java";
		case "rust":
			return "rs";
		case "go":
			return "go";
		case "javascript":
			return "js";
		default:
			return "txt";
	}
}

export function GeneratorsClient({ problemId, initial }: { problemId: number; initial: Row[] }) {
	const [rows, setRows] = useState<Row[]>(initial);
	useEffect(() => setRows(initial), [initial]);

	return (
		<MultiSourceManager<Row>
			kind="제너레이터"
			rows={rows}
			languages={LANGUAGES}
			defaultLanguage="cpp"
			templates={TEMPLATES}
			acceptExts={[".c", ".cpp", ".cc", ".cxx", ".py", ".java", ".rs", ".go", ".js"]}
			monacoLanguageFor={monacoLangFor}
			renderRowMeta={(r) => <Badge variant="outline">{r.language}</Badge>}
			onFetchTemplate={async (id) => {
				const { content } = await getWorkshopGeneratorTemplate(id as "cpp" | "python");
				return { content, language: id };
			}}
			onCreate={async (payload) => {
				const fd = new FormData();
				fd.append("name", payload.name);
				fd.append("language", payload.language);
				if (payload.mode === "file" && payload.file) {
					fd.append("file", payload.file);
				} else {
					const filename = `${payload.name}.${extensionFor(payload.language)}`;
					fd.append("file", new File([payload.inlineSource], filename, { type: "text/plain" }));
				}
				await uploadWorkshopGenerator(problemId, fd);
			}}
			onReadSource={async (id) => {
				const { content } = await readWorkshopGeneratorSource(problemId, id);
				const row = rows.find((r) => r.id === id);
				return { text: content, language: row?.language };
			}}
			onUpdate={async (payload) => {
				await saveWorkshopGeneratorSource(problemId, payload.id, payload.source);
			}}
			onDelete={async (id) => {
				await deleteWorkshopGenerator(problemId, id);
			}}
			deleteWarning={() => "이 제너레이터를 참조하는 스크립트 줄은 실행할 수 없게 됩니다."}
		/>
	);
}
