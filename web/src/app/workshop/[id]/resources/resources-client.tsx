"use client";

import { useEffect, useState } from "react";
import {
	createWorkshopResourceFromText,
	deleteWorkshopResource,
	readWorkshopResourceText,
	renameWorkshopResource,
	updateWorkshopResourceText,
	uploadWorkshopResource,
} from "@/actions/workshop/resources";
import { type ManagerRow, MultiSourceManager } from "../_components/multi-source-manager";

type Row = ManagerRow;

// Resources have no language metadata; Monaco syntax is inferred from filename.
function monacoLangFromName(name: string): string {
	const ext = name.split(".").pop()?.toLowerCase();
	switch (ext) {
		case "h":
		case "hpp":
		case "cpp":
		case "cc":
		case "cxx":
			return "cpp";
		case "c":
			return "c";
		case "py":
			return "python";
		case "rs":
			return "rust";
		case "go":
			return "go";
		case "js":
			return "javascript";
		case "ts":
			return "typescript";
		case "java":
			return "java";
		default:
			return "plaintext";
	}
}

export function ResourcesClient({
	problemId,
	initialResources,
}: {
	problemId: number;
	initialResources: Row[];
}) {
	const [rows, setRows] = useState<Row[]>(initialResources);
	useEffect(() => setRows(initialResources), [initialResources]);

	return (
		<MultiSourceManager<Row>
			kind="리소스"
			rows={rows}
			languages={[]}
			monacoLanguageFor={(langOrName) => monacoLangFromName(langOrName)}
			acceptExts={[
				".h",
				".hpp",
				".c",
				".cpp",
				".cc",
				".cxx",
				".py",
				".js",
				".ts",
				".java",
				".go",
				".rs",
				".txt",
				".md",
			]}
			onCreate={async (payload) => {
				if (payload.mode === "file" && payload.file) {
					const fd = new FormData();
					fd.append("name", payload.name);
					fd.append("file", payload.file);
					await uploadWorkshopResource(problemId, fd);
				} else {
					await createWorkshopResourceFromText(problemId, {
						name: payload.name,
						text: payload.inlineSource,
					});
				}
			}}
			onReadSource={async (id) => {
				const { name, text } = await readWorkshopResourceText(problemId, id);
				// Language slot carries the filename so Monaco picks the right syntax
				// (resources have no separate language field).
				return { text, name, language: name };
			}}
			onUpdate={async (payload) => {
				const row = rows.find((r) => r.id === payload.id);
				if (row && row.name !== payload.name) {
					await renameWorkshopResource(problemId, payload.id, payload.name);
				}
				if (payload.source.length > 0) {
					await updateWorkshopResourceText(problemId, payload.id, payload.source);
				}
			}}
			onDelete={async (id) => {
				await deleteWorkshopResource(problemId, id);
			}}
			deleteWarning={() => "이 파일을 참조하는 제너레이터/체커는 컴파일 실패할 수 있습니다."}
		/>
	);
}
