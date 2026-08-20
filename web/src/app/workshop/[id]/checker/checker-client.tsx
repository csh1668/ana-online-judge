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
	initialVersion: number;
	presets: PresetRow[];
};

const LANGUAGES: LanguageOption[] = [
	{ value: "cpp", label: "C++" },
	{ value: "python", label: "Python (2차)", disabled: true },
];

export function CheckerClient({
	problemId,
	initialLanguage,
	initialSource,
	initialVersion,
	presets,
}: Props) {
	const presetOptions: PresetOption[] = presets.map((p) => ({
		id: p.id,
		label: p.label,
		description: p.description,
	}));

	return (
		<SingleSourceEditor
			initialLanguage={initialLanguage}
			initialSource={initialSource}
			initialVersion={initialVersion}
			hasPersisted={true}
			languages={LANGUAGES}
			presets={presetOptions}
			acceptExts={[".cpp", ".cc", ".cxx", ".h", ".hpp", ".py"]}
			monacoLanguageFor={monacoLangFor}
			editorHeightClass="h-[65vh]"
			onSave={async ({ language, source, expectedVersion }) => {
				const state = await saveWorkshopCheckerSource(problemId, {
					language: language as "cpp" | "python",
					source,
					expectedVersion,
				});
				return { version: state.version };
			}}
			onApplyPreset={async (id, expectedVersion) => {
				const state = await resetWorkshopCheckerToPreset(
					problemId,
					id as WorkshopCheckerPreset,
					expectedVersion
				);
				return { language: state.language, source: state.source, version: state.version };
			}}
		/>
	);
}
