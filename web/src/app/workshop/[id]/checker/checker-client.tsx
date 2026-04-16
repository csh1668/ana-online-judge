"use client";

import {
	resetWorkshopCheckerToPreset,
	saveWorkshopCheckerSource,
} from "@/actions/workshop/checker";
import type { WorkshopCheckerPreset } from "@/lib/workshop/bundled";
import {
	type LanguageOption,
	type PresetOption,
	SingleSourceEditor,
} from "../_components/single-source-editor";
import { monacoLangFor } from "../_components/source-input";

type PresetRow = {
	id: WorkshopCheckerPreset;
	label: string;
	description: string;
};

type Props = {
	problemId: number;
	initialLanguage: "cpp" | "python";
	initialSource: string;
	presets: PresetRow[];
};

const LANGUAGES: LanguageOption[] = [
	{ value: "cpp", label: "C++" },
	{ value: "python", label: "Python (2차)", disabled: true },
];

export function CheckerClient({ problemId, initialLanguage, initialSource, presets }: Props) {
	const presetOptions: PresetOption[] = presets.map((p) => ({
		id: p.id,
		label: p.label,
		description: p.description,
	}));

	return (
		<SingleSourceEditor
			initialLanguage={initialLanguage}
			initialSource={initialSource}
			hasPersisted={true}
			languages={LANGUAGES}
			presets={presetOptions}
			acceptExts={[".cpp", ".cc", ".cxx", ".h", ".hpp", ".py"]}
			monacoLanguageFor={monacoLangFor}
			editorHeightClass="h-[65vh]"
			onSave={async ({ language, source }) => {
				await saveWorkshopCheckerSource(problemId, {
					language: language as "cpp" | "python",
					source,
				});
			}}
			onApplyPreset={async (id) => {
				const state = await resetWorkshopCheckerToPreset(problemId, id as WorkshopCheckerPreset);
				return { language: state.language, source: state.source };
			}}
		/>
	);
}
