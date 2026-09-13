"use client";

import { saveWorkshopTransformer } from "@/actions/workshop/transformer";
import { type LanguageOption, SingleSourceEditor } from "../_components/single-source-editor";
import { monacoLangFor } from "../_components/source-input";

type Props = {
	problemId: number;
	initialLanguage: "cpp" | "python";
	initialSource: string;
	initialVersion: number;
	hasPersisted: boolean;
};

const LANGUAGES: LanguageOption[] = [
	{ value: "cpp", label: "C++" },
	{ value: "python", label: "Python" },
];

export function TransformerClient({
	problemId,
	initialLanguage,
	initialSource,
	initialVersion,
	hasPersisted,
}: Props) {
	return (
		<SingleSourceEditor
			initialLanguage={initialLanguage}
			initialSource={initialSource}
			initialVersion={initialVersion}
			hasPersisted={hasPersisted}
			languages={LANGUAGES}
			acceptExts={[".cpp", ".cc", ".cxx", ".h", ".hpp", ".py"]}
			monacoLanguageFor={monacoLangFor}
			editorHeightClass="h-[65vh]"
			onSave={async ({ language, source, expectedVersion }) => {
				const state = await saveWorkshopTransformer(problemId, {
					language: language as "cpp" | "python",
					source,
					expectedVersion,
				});
				return { version: state.version };
			}}
		/>
	);
}
