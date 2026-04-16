/**
 * Generator-script parser — spec §6.
 *
 * Grammar (line-oriented):
 *   script     := line*
 *   line       := blank | comment | top_stmt | for_header | for_body_stmt
 *   blank      := /^\s*$/
 *   comment    := /^\s*#.*$/
 *   top_stmt   := /^[^\s#].*$/  (no leading whitespace except inside `for` body)
 *   for_header := /^for\s+([A-Za-z_][A-Za-z_0-9]*)\s+in\s+(-?\d+)\.\.(-?\d+):\s*$/
 *   for_body_stmt := /^  \S.*$/ (exactly 2-space indent, no nested `for`)
 *
 * A generator statement is:
 *   ident (arg)*
 *   arg := literal | expr
 *   expr := "[" var (("*"|"+"|"-"|"/") int)? "]"
 *
 * `manual` is a distinguished keyword statement with no args.
 *
 * Output is a flat list of ParsedStep in the order they should be executed
 * (for blocks are expanded here — the runner sees only flat steps).
 */

export type ParsedStep =
	| { kind: "manual"; line: number }
	| {
			kind: "generated";
			generatorName: string;
			args: string[];
			line: number; // original script line (1-based)
			loopVar?: string; // for diagnostics only
			loopValue?: number;
	  };

export type ParseError = {
	line: number; // 1-based
	message: string;
};

export class WorkshopScriptParseError extends Error {
	errors: ParseError[];
	constructor(errors: ParseError[]) {
		super(errors.map((e) => `Line ${e.line}: ${e.message}`).join("\n") || "Parse error");
		this.name = "WorkshopScriptParseError";
		this.errors = errors;
	}
}

const FOR_HEADER_RE = /^for\s+([A-Za-z_][A-Za-z_0-9]*)\s+in\s+(-?\d+)\.\.(-?\d+):\s*$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z_0-9-]*$/;
const EXPR_RE = /^\[([A-Za-z_][A-Za-z_0-9]*)(?:([*+\-/])(-?\d+))?\]$/;
// Any `[...]` token not matching EXPR_RE is flagged — catches typos.
const ANY_EXPR_RE = /^\[.*\]$/;

const MAX_FOR_RANGE = 10_000;

type ForContext = {
	variable: string;
	start: number;
	end: number;
	headerLine: number;
};

/**
 * Parse the script text. Validates generator name references against
 * `knownGeneratorNames` — an empty set skips the check, a non-empty set
 * enforces name presence and throws a structured error otherwise.
 */
export function parseGeneratorScript(
	source: string,
	knownGeneratorNames: Set<string>
): ParsedStep[] {
	const errors: ParseError[] = [];
	const rawLines = source.split(/\r?\n/);
	const out: ParsedStep[] = [];

	let i = 0;
	while (i < rawLines.length) {
		const lineNo = i + 1;
		const text = rawLines[i];

		// Blank line / comment-only line
		if (/^\s*$/.test(text) || /^\s*#/.test(text)) {
			i++;
			continue;
		}

		// Top-level statements MUST start at column 0. Anything else at top
		// level is a stray indentation.
		if (/^\s/.test(text)) {
			errors.push({
				line: lineNo,
				message:
					"Unexpected indentation (only `for` bodies may be indented, with exactly 2 spaces).",
			});
			i++;
			continue;
		}

		const forMatch = FOR_HEADER_RE.exec(text);
		if (forMatch) {
			const [, variable, startStr, endStr] = forMatch;
			const start = Number.parseInt(startStr, 10);
			const end = Number.parseInt(endStr, 10);
			if (!Number.isFinite(start) || !Number.isFinite(end)) {
				errors.push({ line: lineNo, message: "Invalid range bounds." });
				i++;
				continue;
			}
			if (end < start) {
				errors.push({
					line: lineNo,
					message: `for-range ${start}..${end} is empty (end < start).`,
				});
				i++;
				continue;
			}
			const count = end - start + 1;
			if (count > MAX_FOR_RANGE) {
				errors.push({
					line: lineNo,
					message: `for-range too large (${count} > ${MAX_FOR_RANGE}).`,
				});
				i++;
				continue;
			}

			const body: { line: number; text: string }[] = [];
			let j = i + 1;
			while (j < rawLines.length) {
				const bodyText = rawLines[j];
				if (/^\s*$/.test(bodyText) || /^\s*#/.test(bodyText)) {
					j++;
					continue;
				}
				if (!bodyText.startsWith("  ")) break; // body ends
				if (bodyText.startsWith("   ") && !bodyText.startsWith("    ")) {
					errors.push({
						line: j + 1,
						message: "Invalid indentation (for-body requires exactly 2 spaces).",
					});
					j++;
					continue;
				}
				const stripped = bodyText.slice(2);
				if (stripped.startsWith(" ")) {
					errors.push({
						line: j + 1,
						message:
							"Invalid indentation (for-body requires exactly 2 spaces, nested `for` not supported).",
					});
					j++;
					continue;
				}
				if (FOR_HEADER_RE.test(stripped)) {
					errors.push({
						line: j + 1,
						message: "Nested `for` blocks are not supported (MVP).",
					});
					j++;
					continue;
				}
				body.push({ line: j + 1, text: stripped });
				j++;
			}
			if (body.length === 0) {
				errors.push({ line: lineNo, message: "Empty for-body." });
			}

			const ctx: ForContext = { variable, start, end, headerLine: lineNo };
			for (let v = start; v <= end; v++) {
				for (const bodyLine of body) {
					const step = parseStmt(
						bodyLine.text,
						bodyLine.line,
						knownGeneratorNames,
						{
							...ctx,
							currentValue: v,
						},
						errors
					);
					if (step) out.push(step);
				}
			}
			i = j;
			continue;
		}

		// Flat top-level statement
		const step = parseStmt(text, lineNo, knownGeneratorNames, null, errors);
		if (step) out.push(step);
		i++;
	}

	if (errors.length > 0) {
		throw new WorkshopScriptParseError(errors);
	}
	return out;
}

type LoopEnv = (ForContext & { currentValue: number }) | null;

function parseStmt(
	text: string,
	lineNo: number,
	knownGeneratorNames: Set<string>,
	loop: LoopEnv,
	errors: ParseError[]
): ParsedStep | null {
	const tokens = tokenize(text);
	if (tokens.length === 0) return null;

	const head = tokens[0];

	if (head === "manual") {
		if (tokens.length > 1) {
			errors.push({
				line: lineNo,
				message: "`manual` does not accept arguments.",
			});
			return null;
		}
		return { kind: "manual", line: lineNo };
	}

	if (!IDENT_RE.test(head)) {
		errors.push({ line: lineNo, message: `Invalid generator name: "${head}".` });
		return null;
	}
	if (knownGeneratorNames.size > 0 && !knownGeneratorNames.has(head)) {
		errors.push({ line: lineNo, message: `Unknown generator: "${head}".` });
		return null;
	}

	const args: string[] = [];
	for (const tok of tokens.slice(1)) {
		if (ANY_EXPR_RE.test(tok)) {
			const m = EXPR_RE.exec(tok);
			if (!m) {
				errors.push({
					line: lineNo,
					message: `Invalid expression: "${tok}" (expected [var], [var*N], [var+N], [var-N], [var/N]).`,
				});
				return null;
			}
			const [, variable, op, rhsStr] = m;
			if (!loop) {
				errors.push({
					line: lineNo,
					message: `Expression "${tok}" used outside a for-block.`,
				});
				return null;
			}
			if (variable !== loop.variable) {
				errors.push({
					line: lineNo,
					message: `Unknown loop variable "${variable}" (expected "${loop.variable}").`,
				});
				return null;
			}
			const lhs = loop.currentValue;
			let value: number;
			if (!op) {
				value = lhs;
			} else {
				const rhs = Number.parseInt(rhsStr, 10);
				switch (op) {
					case "+":
						value = lhs + rhs;
						break;
					case "-":
						value = lhs - rhs;
						break;
					case "*":
						value = lhs * rhs;
						break;
					case "/":
						if (rhs === 0) {
							errors.push({ line: lineNo, message: "Division by zero in expression." });
							return null;
						}
						value = Math.trunc(lhs / rhs);
						break;
					default:
						errors.push({ line: lineNo, message: `Invalid operator "${op}".` });
						return null;
				}
			}
			args.push(String(value));
		} else {
			args.push(tok);
		}
	}

	return {
		kind: "generated",
		generatorName: head,
		args,
		line: lineNo,
		loopVar: loop?.variable,
		loopValue: loop?.currentValue,
	};
}

/**
 * Whitespace-split tokenizer. Quoted arguments are NOT supported in the MVP —
 * generator args are expected to be integers or short identifiers. Adding
 * shell-like quoting can happen in a later phase without breaking this contract.
 */
function tokenize(text: string): string[] {
	return text
		.trim()
		.split(/\s+/)
		.filter((t) => t.length > 0);
}

/**
 * Convenience: returns all distinct generator names referenced in a parsed
 * script. Useful for pre-run validation (e.g. render a warning badge in the
 * UI if the user typed a name that doesn't exist).
 */
export function collectReferencedGenerators(steps: ParsedStep[]): Set<string> {
	const out = new Set<string>();
	for (const s of steps) {
		if (s.kind === "generated") out.add(s.generatorName);
	}
	return out;
}
