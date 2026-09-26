import "server-only";

import { createHash } from "node:crypto";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { type LanguageRow, languages } from "@/db/schema";
import { pushInstallLanguageJob, pushUninstallLanguageJob } from "@/lib/judge-queue";
import { getRedisClient } from "@/lib/redis";

export const LANGUAGE_ID_RE = /^[a-z0-9][a-z0-9_+-]{0,31}$/;
const SNAPSHOT_KEY = "judge:languages";
const SCRIPTS_KEY = "judge:languages:scripts";
const CHANGED_CHANNEL = "judge:languages:changed";

const numericStr = z
	.union([z.number(), z.string()])
	.transform((v) => String(v))
	.refine((v) => /^\d{1,3}(\.\d{1,3})?$/.test(v) && Number(v) > 0, "0.001~999.999 범위의 실수");

/** 기본값 없는 기준 스키마 — update(partial)용. zod 4에서는 .partial() 안에서도 .default()가 발동하므로 분리한다. */
const languageBaseSchema = z.object({
	id: z.string().regex(LANGUAGE_ID_RE),
	label: z.string().min(1).max(40),
	version: z.string().max(100),
	aliases: z.array(z.string().min(1).max(20)),
	sortOrder: z.number().int(),
	enabled: z.boolean(),
	sourceFile: z.string().min(1).max(64),
	fileExtension: z.string().min(1).max(16),
	monacoLanguage: z.string().max(32).nullable(),
	defaultCode: z.string().max(10_000),
	compileCommand: z.string().max(2000).nullable(),
	runCommand: z.string().min(1).max(2000),
	compileOnHost: z.boolean(),
	compileScript: z.string().max(100_000).nullable(),
	producesSingleBinary: z.boolean(),
	env: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*=.*$/)),
	displayCompileCommand: z.string().max(2000).nullable(),
	displayRunCommand: z.string().max(2000).nullable(),
	clientCompileCommand: z.string().max(2000).nullable(),
	clientRunCommand: z.string().max(2000).nullable(),
	timeMultiplier: numericStr,
	timeBonusMs: z.number().int().min(0).max(600_000),
	memoryMultiplier: numericStr,
	memoryBonusMb: z.number().int().min(0).max(65_536),
	installScript: z.string().max(200_000).nullable(),
});
const b = languageBaseSchema.shape;

/** create 전용 스키마 — 생략된 필드에 기본값을 채운다. */
export const languageInputSchema = languageBaseSchema.extend({
	version: b.version.default(""),
	aliases: b.aliases.default([]),
	sortOrder: b.sortOrder.default(0),
	enabled: b.enabled.default(false),
	monacoLanguage: b.monacoLanguage.default(null),
	defaultCode: b.defaultCode.default(""),
	compileCommand: b.compileCommand.default(null),
	compileOnHost: b.compileOnHost.default(false),
	compileScript: b.compileScript.default(null),
	producesSingleBinary: b.producesSingleBinary.default(true),
	env: b.env.default([]),
	displayCompileCommand: b.displayCompileCommand.default(null),
	displayRunCommand: b.displayRunCommand.default(null),
	clientCompileCommand: b.clientCompileCommand.default(null),
	clientRunCommand: b.clientRunCommand.default(null),
	timeMultiplier: b.timeMultiplier.default("1"),
	timeBonusMs: b.timeBonusMs.default(0),
	memoryMultiplier: b.memoryMultiplier.default("1"),
	memoryBonusMb: b.memoryBonusMb.default(0),
	installScript: b.installScript.default(null),
});
const languageUpdateSchema = languageBaseSchema.partial().omit({ id: true });
export type LanguageInput = z.infer<typeof languageInputSchema>;

export type LanguageAdminRow = LanguageRow & {
	currentHash: string | null;
	needsReinstall: boolean;
};

export type LanguageInstallResultWire = {
	language_id: string;
	state: "installed" | "failed" | "not_installed";
	hash: string | null;
	exit_code: number | null;
	message: string | null;
	finished_at: string;
};

/** Rust `SnapshotEntry` (judge/src/core/languages.rs)와 필드 1:1. */
export type SnapshotEntry = {
	id: string;
	aliases: string[];
	source_file: string;
	file_extension: string;
	compile_command: string | null;
	run_command: string;
	compile_on_host: boolean;
	compile_script: string | null;
	produces_single_binary: boolean;
	env: string[];
	time_multiplier: number;
	time_bonus_ms: number;
	memory_multiplier: number;
	memory_bonus_mb: number;
	install_hash: string | null;
};

export function computeInstallHash(script: string, version: string): string {
	return createHash("sha256").update(`${script}\n${version}`).digest("hex").slice(0, 12);
}

function decorate(row: LanguageRow): LanguageAdminRow {
	const currentHash = row.installScript ? computeInstallHash(row.installScript, row.version) : null;
	const needsReinstall =
		currentHash !== null && row.installState === "installed" && row.installedHash !== currentHash;
	return { ...row, currentHash, needsReinstall };
}

export async function listLanguages(opts?: {
	includeDeleted?: boolean;
}): Promise<LanguageAdminRow[]> {
	const rows = await db
		.select()
		.from(languages)
		.where(opts?.includeDeleted ? undefined : isNull(languages.deletedAt))
		.orderBy(asc(languages.sortOrder), asc(languages.id));
	return rows.map(decorate);
}

export async function getLanguage(id: string): Promise<LanguageAdminRow | null> {
	const [row] = await db.select().from(languages).where(eq(languages.id, id)).limit(1);
	return row ? decorate(row) : null;
}

async function queryActiveLanguages(): Promise<LanguageRow[]> {
	return db
		.select()
		.from(languages)
		.where(
			and(
				eq(languages.enabled, true),
				eq(languages.installState, "installed"),
				isNull(languages.deletedAt)
			)
		)
		.orderBy(asc(languages.sortOrder), asc(languages.id));
}

async function queryLanguageLabelMap(): Promise<Record<string, string>> {
	const rows = await db.select({ id: languages.id, label: languages.label }).from(languages);
	return Object.fromEntries(rows.map((r) => [r.id, r.label]));
}

export async function getActiveLanguages(): Promise<LanguageRow[]> {
	return queryActiveLanguages();
}

export async function getLanguageLabelMap(): Promise<Record<string, string>> {
	return queryLanguageLabelMap();
}

export function toSnapshotEntry(row: LanguageRow): SnapshotEntry {
	return {
		id: row.id,
		aliases: row.aliases,
		source_file: row.sourceFile,
		file_extension: row.fileExtension,
		compile_command: row.compileCommand,
		run_command: row.runCommand,
		compile_on_host: row.compileOnHost,
		compile_script: row.compileScript,
		produces_single_binary: row.producesSingleBinary,
		env: row.env,
		time_multiplier: Number(row.timeMultiplier),
		time_bonus_ms: row.timeBonusMs,
		memory_multiplier: Number(row.memoryMultiplier),
		memory_bonus_mb: row.memoryBonusMb,
		install_hash: row.installScript ? row.installedHash : null,
	};
}

export async function publishLanguageSnapshot(): Promise<void> {
	// judge는 스냅샷 순서대로 첫 매칭을 쓰므로(예: python/pypy 모두 .py) 순서를 결정적으로 고정한다.
	const rows = await db
		.select()
		.from(languages)
		.where(isNull(languages.deletedAt))
		.orderBy(asc(languages.sortOrder), asc(languages.id));
	const redis = await getRedisClient();
	const snapshot = JSON.stringify(rows.map(toSnapshotEntry));
	const scripts = rows.filter((r) => r.installScript);
	const multi = redis.multi().set(SNAPSHOT_KEY, snapshot).del(SCRIPTS_KEY);
	if (scripts.length > 0) {
		multi.hset(
			SCRIPTS_KEY,
			Object.fromEntries(scripts.map((r) => [r.id, r.installScript as string]))
		);
	}
	multi.publish(CHANGED_CHANNEL, String(Date.now()));
	const results = await multi.exec();
	if (!results) throw new Error("Language snapshot publish aborted");
	const failed = results.find(([err]) => err);
	if (failed) throw failed[0];
}

export async function createLanguage(input: LanguageInput): Promise<LanguageRow> {
	const data = languageInputSchema.parse(input);
	const [row] = await db
		.insert(languages)
		.values({ ...data, installState: data.installScript ? "not_installed" : "installed" })
		.returning();
	await publishLanguageSnapshot();
	return row;
}

export async function updateLanguage(
	id: string,
	input: Partial<LanguageInput>
): Promise<LanguageRow> {
	const data = languageUpdateSchema.parse(input);
	const [row] = await db
		.update(languages)
		.set({ ...data, updatedAt: new Date() })
		.where(eq(languages.id, id))
		.returning();
	if (!row) throw new Error("Language not found");
	await publishLanguageSnapshot();
	return row;
}

export async function softDeleteLanguage(id: string): Promise<void> {
	const row = await getLanguage(id);
	if (!row) throw new Error("Language not found");
	await db
		.update(languages)
		.set({ deletedAt: new Date(), enabled: false, updatedAt: new Date() })
		.where(eq(languages.id, id));
	await publishLanguageSnapshot();
	if (row.installScript) await pushUninstallLanguageJob({ languageId: id });
}

export async function restoreLanguage(id: string): Promise<void> {
	const row = await getLanguage(id);
	if (!row) throw new Error("Language not found");
	await db
		.update(languages)
		.set({
			deletedAt: null,
			enabled: false,
			installState: row.installScript ? "not_installed" : "installed",
			installedHash: null,
			updatedAt: new Date(),
		})
		.where(eq(languages.id, id));
	await publishLanguageSnapshot();
}

export async function requestInstall(id: string): Promise<{ hash: string }> {
	const row = await getLanguage(id);
	if (!row || row.deletedAt) throw new Error("Language not found");
	if (!row.installScript) throw new Error("Builtin language has no install script");
	if (row.installState === "installing") throw new Error("Language install already in progress");
	const hash = computeInstallHash(row.installScript, row.version);
	await db
		.update(languages)
		.set({ installState: "installing", installLog: null, updatedAt: new Date() })
		.where(eq(languages.id, id));
	const redis = await getRedisClient();
	await redis.del(`judge:install:${id}:log`, `judge:install:${id}:result`);
	await redis.hset(SCRIPTS_KEY, id, row.installScript);
	await pushInstallLanguageJob({ languageId: id, script: row.installScript, hash });
	return { hash };
}

export async function requestUninstall(id: string): Promise<void> {
	const row = await getLanguage(id);
	if (!row) throw new Error("Language not found");
	if (!row.installScript) throw new Error("Builtin language cannot be uninstalled");
	if (row.installState === "installing") throw new Error("Language install already in progress");
	await db
		.update(languages)
		.set({ enabled: false, installState: "installing", updatedAt: new Date() })
		.where(eq(languages.id, id));
	await publishLanguageSnapshot();
	const redis = await getRedisClient();
	await redis.del(`judge:install:${id}:log`, `judge:install:${id}:result`);
	await pushUninstallLanguageJob({ languageId: id });
}

export async function getInstallLog(id: string): Promise<string[]> {
	const redis = await getRedisClient();
	return redis.lrange(`judge:install:${id}:log`, 0, -1);
}

export async function applyInstallResult(r: LanguageInstallResultWire): Promise<void> {
	if (r.state === "installed") {
		if (!r.hash) {
			console.warn(`[languages] ignoring installed result without hash for ${r.language_id}`);
			return;
		}
		// 해시가 달라도 볼륨에 실제로 설치된 것은 r.hash이므로 그대로 반영한다.
		// needsReinstall(installedHash ≠ currentHash)로 UI에 재설치 필요가 표시된다.
		const row = await getLanguage(r.language_id);
		if (row?.currentHash && row.currentHash !== r.hash) {
			console.warn(
				`[languages] install result hash for ${r.language_id} (${r.hash}) differs from expected ${row.currentHash}; marking as needing reinstall`
			);
		}
	}
	const log = (await getInstallLog(r.language_id)).join("\n");
	const set =
		r.state === "installed"
			? {
					installState: "installed" as const,
					installedHash: r.hash,
					installedAt: new Date(),
					installLog: log,
				}
			: r.state === "not_installed"
				? { installState: "not_installed" as const, installedHash: null, installLog: log }
				: { installState: "failed" as const, installLog: `${log}\n${r.message ?? ""}`.trim() };
	await db
		.update(languages)
		.set({ ...set, updatedAt: new Date() })
		.where(eq(languages.id, r.language_id));
	await publishLanguageSnapshot();
}

/** 웹이 결과 publish를 놓쳤을 때 보정 — 관리자 목록 로드 시 호출. */
export async function reconcileInstallingLanguages(): Promise<void> {
	const rows = await db.select().from(languages).where(eq(languages.installState, "installing"));
	if (rows.length === 0) return;
	const redis = await getRedisClient();
	for (const row of rows) {
		const raw = await redis.get(`judge:install:${row.id}:result`);
		if (raw) await applyInstallResult(JSON.parse(raw) as LanguageInstallResultWire);
	}
}
