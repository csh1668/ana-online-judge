#!/usr/bin/env node
// 디자인 시스템 grep 가드. 사용법: pnpm lint:design [--rules id1,id2] [files...]
// files가 없으면 src/app, src/components 전체. 경로는 web/ 기준.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const SRC = join(ROOT, "src");

const args = process.argv.slice(2);
let onlyRules = null;
const fileArgs = [];
for (let i = 0; i < args.length; i++) {
	if (args[i] === "--rules") onlyRules = new Set(args[++i].split(","));
	else fileArgs.push(args[i]);
}

const PALETTE =
	"(emerald|rose|amber|orange|purple|pink|red|yellow|green|blue|gray|slate|zinc|indigo|teal|cyan|lime|violet|fuchsia|sky|neutral|stone)";

/** @type {{id:string, re:RegExp, msg:string, scope?:"app", allowIf?:RegExp, nextLine?:RegExp}[]} */
const LINE_RULES = [
	{
		id: "raw-palette",
		re: new RegExp(`\\b(bg|text|border|from|to|via|ring|fill|stroke|divide|outline)-${PALETTE}-[0-9]{2,3}\\b`),
		msg: "raw Tailwind 팔레트 — 시맨틱/verdict 토큰 사용",
	},
	{
		id: "black-white",
		re: /\b(bg-black|text-white)\b/,
		msg: "bg-primary/40, text-primary-foreground 등 토큰 사용",
	},
	{ id: "radius", re: /\brounded-(md|lg|xl|2xl|3xl)\b/, msg: "rounded-[2px] 사용" },
	{
		id: "rounded-full",
		re: /\brounded-full\b/,
		msg: "아바타·스위치·라디오·status dot(size-2) 외 금지",
		allowIf: /\b(size|h)-(1\.5|2|2\.5|3)\b|Avatar|Switch|Radio/,
	},
	{
		id: "blur-gradient",
		re: /backdrop-blur|shadow-xs|bg-background\/95|bg-gradient-to-/,
		msg: "blur/gradient 금지 (표 스크롤 힌트는 CSS 유틸로만)",
	},
	{
		id: "table-wrapper",
		re: /className="(?=[^"]*\bborder\b)(?=[^"]*\brounded-)[^"]*"/,
		nextLine: /^\s*<Table\b/,
		msg: "Table 래퍼 div 금지 — Table 컨테이너가 테두리를 그림",
	},
	{
		id: "card-header-override",
		re: /<CardHeader className="[^"]*\b(pb-\d+(\.\d+)?|space-y-\d+|flex-row)\b/,
		msg: "CardHeader 보정 금지 — PageHeader 사용",
		scope: "app",
	},
	{
		id: "page-title-3xl",
		re: /<h1 className="[^"]*\btext-3xl\b/,
		msg: "페이지 제목은 PageHeader(text-2xl)",
		scope: "app",
	},
	{
		id: "locale-string",
		re: /toLocale(Date|Time)?String\("ko-KR"/,
		msg: "@/lib/format-date 사용",
	},
];

function loadAllow() {
	const p = join(ROOT, "scripts/lint-design.allow.txt");
	if (!existsSync(p)) return [];
	return readFileSync(p, "utf8")
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith("#"))
		.map((l) => {
			const [rule, ...rest] = l.split(/\s+/);
			return { rule, prefix: rest.join(" ") };
		});
}
const ALLOW = loadAllow();
const allowed = (rule, rel) =>
	ALLOW.some((a) => (a.rule === "*" || a.rule === rule) && rel.startsWith(a.prefix));

function walk(dir, out) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		const st = statSync(p);
		if (st.isDirectory()) walk(p, out);
		else if (/\.(tsx|ts|css)$/.test(name)) out.push(p);
	}
	return out;
}

const files =
	fileArgs.length > 0
		? fileArgs.map((f) => resolve(ROOT, f)).filter((f) => existsSync(f) && statSync(f).isFile())
		: [...walk(join(SRC, "app"), []), ...walk(join(SRC, "components"), [])];

const violations = [];
const active = (id) => !onlyRules || onlyRules.has(id);

for (const file of files) {
	const rel = relative(SRC, file).replace(/\\/g, "/"); // "app/…", "components/…"
	if (!rel.startsWith("app/") && !rel.startsWith("components/")) continue;
	const lines = readFileSync(file, "utf8").split("\n");
	for (const rule of LINE_RULES) {
		if (!active(rule.id)) continue;
		if (rule.scope === "app" && !rel.startsWith("app/")) continue;
		if (allowed(rule.id, rel)) continue;
		lines.forEach((line, i) => {
			if (!rule.re.test(line)) return;
			if (rule.allowIf?.test(line)) return;
			if (rule.nextLine && !(lines[i + 1] && rule.nextLine.test(lines[i + 1]))) return;
			violations.push(`src/${rel}:${i + 1}: [${rule.id}] ${rule.msg}`);
		});
	}

	// page-shell: page.tsx 자신 또는 조상 layout.tsx 중 하나에 PageShell이 있어야 한다
	if (active("page-shell") && /^app\/.*page\.tsx$/.test(rel) && !allowed("page-shell", rel)) {
		let ok = /\bPageShell\b/.test(lines.join("\n"));
		let dir = dirname(file);
		while (!ok && dir.length >= join(SRC, "app").length) {
			const layout = join(dir, "layout.tsx");
			if (existsSync(layout) && /\bPageShell\b/.test(readFileSync(layout, "utf8"))) ok = true;
			if (dir === join(SRC, "app")) break;
			dir = dirname(dir);
		}
		if (!ok) violations.push(`src/${rel}:1: [page-shell] PageShell 누락 (페이지 또는 조상 layout)`);
	}
}

if (violations.length > 0) {
	console.error(violations.join("\n"));
	console.error(`\n✖ lint:design — ${violations.length} violation(s)`);
	process.exit(1);
}
console.log(`✔ lint:design — ${files.length} file(s), 0 violations`);
