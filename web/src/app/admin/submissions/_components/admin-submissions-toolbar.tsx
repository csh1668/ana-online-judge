"use client";

import {
	AdminDateRange,
	AdminFilterSelect,
	AdminMultiFilter,
	AdminProblemSearch,
	AdminUserMultiSearch,
} from "@/components/admin";
import { getLanguageOptions } from "@/lib/languages";

const VERDICT_OPTIONS = [
	{ value: "accepted", label: "AC" },
	{ value: "wrong_answer", label: "WA" },
	{ value: "time_limit_exceeded", label: "TLE" },
	{ value: "memory_limit_exceeded", label: "MLE" },
	{ value: "runtime_error", label: "RE" },
	{ value: "compile_error", label: "CE" },
	{ value: "presentation_error", label: "PE" },
	{ value: "partial", label: "Partial" },
	{ value: "output_limit_exceeded", label: "OLE" },
	{ value: "system_error", label: "SE" },
	{ value: "skipped", label: "Skipped" },
	{ value: "fail", label: "Fail" },
	{ value: "pending", label: "Pending" },
	{ value: "judging", label: "Judging" },
];

const LANGUAGE_OPTIONS = getLanguageOptions();

export function AdminSubmissionsToolbar() {
	return (
		<div className="space-y-3 rounded-[2px] border bg-card p-3">
			<div className="flex flex-wrap items-center gap-2">
				<AdminUserMultiSearch />
				<AdminProblemSearch />
				<AdminDateRange />
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<AdminFilterSelect
					paramKey="contestId"
					placeholder="대회"
					options={[
						{ value: "any", label: "전체" },
						{ value: "none", label: "비대회" },
					]}
					allLabel="전체"
				/>
				<AdminFilterSelect
					paramKey="visibility"
					placeholder="가시성"
					options={[
						{ value: "public", label: "공개" },
						{ value: "private", label: "비공개" },
						{ value: "public_on_ac", label: "AC 시 공개" },
					]}
				/>
			</div>
			<div className="flex flex-col gap-2">
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground w-12">판정</span>
					<AdminMultiFilter paramKey="verdicts" options={VERDICT_OPTIONS} />
				</div>
				<div className="flex items-center gap-2">
					<span className="text-xs text-muted-foreground w-12">언어</span>
					<AdminMultiFilter paramKey="languages" options={LANGUAGE_OPTIONS} />
				</div>
			</div>
		</div>
	);
}
