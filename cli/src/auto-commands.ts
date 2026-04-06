import fs from "node:fs";
import path from "node:path";
import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { ApiClient } from "./client.js";

// --- Types (mirroring api-contract.ts) ---

interface ParamDef {
	name: string;
	type: "string" | "number" | "boolean";
	required: boolean;
	default?: unknown;
	enum?: string[];
}

interface EndpointContract {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	description: string;
	pathParams: string[];
	queryParams: ParamDef[];
	bodyParams: ParamDef[];
	isCustom: boolean;
}

// --- Contract fetching ---

let cachedContracts: EndpointContract[] | null = null;

async function fetchContracts(client: ApiClient): Promise<EndpointContract[]> {
	if (cachedContracts) return cachedContracts;
	cachedContracts = await client.get<EndpointContract[]>("/meta/endpoints");
	return cachedContracts;
}

// --- Dynamic command registration ---

/**
 * Convert endpoint path to CLI command name.
 * "problems" → "problems list" (GET), "problems create" (POST)
 * "problems/:id" → "problems get" (GET), "problems update" (PUT), "problems delete" (DELETE)
 * "problems/:id/testcases" → "problems testcases list" (GET), etc.
 * "contests/:id/participants/:userId" → "contests participants remove"
 */
export function endpointToCommandInfo(ep: EndpointContract): { group: string; action: string } {
	const parts = ep.path.split("/").filter((p) => !p.startsWith(":"));
	// group is the first segment, rest form the action
	const group = parts[0];
	const subParts = parts.slice(1);

	const methodAction: Record<string, string> = {
		GET: "list",
		POST: "create",
		PUT: "update",
		DELETE: "delete",
	};

	let action: string;
	if (subParts.length === 0) {
		// Top-level: problems, users, contests, etc.
		if (ep.pathParams.length > 0) {
			// problems/:id → get/update/delete
			action =
				ep.method === "GET"
					? "get"
					: ep.method === "PUT"
						? "update"
						: ep.method === "DELETE"
							? "delete"
							: "create";
		} else {
			action = methodAction[ep.method];
		}
	} else {
		// Nested: problems/:id/testcases, contests/:id/freeze, etc.
		const subAction = subParts.join("-");
		if (ep.pathParams.length > subParts.length + 1) {
			// Has sub-resource param: contests/:id/participants/:userId
			action =
				ep.method === "DELETE"
					? `${subAction}-remove`
					: ep.method === "GET"
						? `${subAction}-get`
						: `${subAction}-${methodAction[ep.method]}`;
		} else if (ep.method === "GET" && ep.queryParams.some((p) => p.name === "page")) {
			action = `${subAction}-list`;
		} else if (ep.method === "GET") {
			action = `${subAction}-get`;
		} else if (ep.method === "POST") {
			action = `${subAction}`;
		} else {
			action = `${subAction}-${methodAction[ep.method]}`;
		}
	}

	return { group, action };
}

function paramToFlag(p: ParamDef): string {
	const kebab = p.name.replace(/([A-Z])/g, "-$1").toLowerCase();
	return `--${kebab}`;
}

function buildApiPath(pathTemplate: string, pathArgs: Record<string, string>): string {
	let result = pathTemplate;
	for (const [key, value] of Object.entries(pathArgs)) {
		result = result.replace(`:${key}`, value);
	}
	return `/${result}`;
}

function coerceValue(value: string, type: string): unknown {
	if (type === "number") return Number(value);
	if (type === "boolean") return value === "true";
	return value;
}

function formatOutput(data: unknown): void {
	if (Array.isArray(data)) {
		if (data.length === 0) {
			console.log(chalk.dim("(empty)"));
			return;
		}
		// Table format for arrays of objects
		if (typeof data[0] === "object" && data[0] !== null) {
			const keys = Object.keys(data[0] as Record<string, unknown>);
			const displayKeys = keys.slice(0, 8); // Limit columns
			const table = new Table({ head: displayKeys });
			for (const item of data) {
				const row = displayKeys.map((k) => {
					const v = (item as Record<string, unknown>)[k];
					if (v === null || v === undefined) return chalk.dim("-");
					if (typeof v === "boolean") return v ? chalk.green("Yes") : chalk.red("No");
					if (typeof v === "object") return JSON.stringify(v).slice(0, 30);
					return String(v).slice(0, 40);
				});
				table.push(row);
			}
			console.log(table.toString());
			return;
		}
	}

	if (typeof data === "object" && data !== null) {
		const obj = data as Record<string, unknown>;
		// If it has a list-like field (submissions, problems, etc.), show as table
		const listKey = Object.keys(obj).find(
			(k) => Array.isArray(obj[k]) && k !== "testcaseResults"
		);
		if (listKey && Array.isArray(obj[listKey])) {
			formatOutput(obj[listKey]);
			if (obj.total !== undefined) {
				console.log(chalk.dim(`Total: ${obj.total}`));
			}
			return;
		}
	}

	console.log(JSON.stringify(data, null, 2));
}

export async function registerAutoCommands(program: Command): Promise<void> {
	const client = new ApiClient();
	let contracts: EndpointContract[];

	try {
		contracts = await fetchContracts(client);
	} catch (error) {
		console.error(
			chalk.red("Failed to fetch API schema. Is the server running?"),
			error instanceof Error ? error.message : ""
		);
		process.exit(1);
	}

	// Group endpoints by first path segment
	const groups = new Map<string, { command: Command; endpoints: EndpointContract[] }>();

	for (const ep of contracts) {
		if (ep.isCustom) continue; // Skip custom handlers (file upload/download)
		if (ep.path === "meta/endpoints") continue; // Skip meta

		const { group, action } = endpointToCommandInfo(ep);

		if (!groups.has(group)) {
			const cmd = program.command(group).description(`${group} management`);
			groups.set(group, { command: cmd, endpoints: [] });
		}

		const g = groups.get(group)!;
		g.endpoints.push(ep);

		// Build the subcommand
		const pathParamArgs = ep.pathParams.map((p) => `<${p}>`).join(" ");
		const cmdName = pathParamArgs ? `${action} ${pathParamArgs}` : action;

		const sub = g.command
			.command(cmdName)
			.description(`[${ep.method}] ${ep.description}`);

		// Add query param options (for GET)
		for (const p of ep.queryParams) {
			const flag = paramToFlag(p);
			const desc = p.enum ? `(${p.enum.join("|")})` : `(${p.type})`;
			if (p.default !== undefined) {
				sub.option(`${flag} <value>`, `${p.name} ${desc}`, String(p.default));
			} else if (p.required) {
				sub.requiredOption(`${flag} <value>`, `${p.name} ${desc}`);
			} else {
				sub.option(`${flag} <value>`, `${p.name} ${desc}`);
			}
		}

		// --body-file is offered for POST/PUT endpoints that carry a long string field
		// (content/code). When available, it can supply required body fields, so those
		// fields become non-required at the option level.
		const hasContent =
			(ep.method === "POST" || ep.method === "PUT") &&
			ep.bodyParams.some((p) => p.name === "content" || p.name === "code");

		// Add body param options (for POST/PUT)
		for (const p of ep.bodyParams) {
			const flag = paramToFlag(p);
			const desc = p.enum ? `(${p.enum.join("|")})` : `(${p.type})`;
			const isBodyFileable = hasContent && (p.name === "content" || p.name === "code");
			if (p.required && !isBodyFileable) {
				sub.requiredOption(`${flag} <value>`, `${p.name} ${desc}`);
			} else {
				sub.option(`${flag} <value>`, `${p.name} ${desc}`);
			}
		}

		if (hasContent) {
			sub.option("--body-file <path>", "Read body fields from JSON file");
		}

		// Action handler
		sub.action(async (...args: unknown[]) => {
			const actionClient = new ApiClient();

			// Parse args: path params come first, then options
			const pathValues: Record<string, string> = {};
			let optIdx = 0;
			for (const pp of ep.pathParams) {
				pathValues[pp] = args[optIdx] as string;
				optIdx++;
			}
			const opts = args[optIdx] as Record<string, string>;

			const apiPath = buildApiPath(ep.path, pathValues);

			try {
				let result: unknown;

				if (ep.method === "GET") {
					const queryParts: string[] = [];
					for (const p of ep.queryParams) {
						const flagName = p.name;
						const kebab = p.name.replace(/([A-Z])/g, "-$1").toLowerCase();
						const val = opts[camelize(kebab)] ?? opts[flagName];
						if (val !== undefined) {
							queryParts.push(`${p.name}=${encodeURIComponent(val)}`);
						}
					}
					const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
					result = await actionClient.get(`${apiPath}${qs}`);
				} else if (ep.method === "DELETE") {
					const queryParts: string[] = [];
					for (const p of ep.queryParams) {
						const val = opts[camelize(paramToFlag(p).slice(2))];
						if (val !== undefined) {
							queryParts.push(`${p.name}=${encodeURIComponent(val)}`);
						}
					}
					const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
					result = await actionClient.delete(`${apiPath}${qs}`);
				} else {
					// POST/PUT — build body from options
					const body: Record<string, unknown> = {};

					// Load from file if specified
					if (opts.bodyFile) {
						const fileContent = fs.readFileSync(opts.bodyFile, "utf-8");
						Object.assign(body, JSON.parse(fileContent));
					}

					for (const p of ep.bodyParams) {
						const kebab = p.name.replace(/([A-Z])/g, "-$1").toLowerCase();
						const val = opts[camelize(kebab)];
						if (val !== undefined) {
							body[p.name] = coerceValue(val, p.type);
						}
					}

					result =
						ep.method === "POST"
							? await actionClient.post(apiPath, body)
							: await actionClient.put(apiPath, body);
				}

				formatOutput(result);
			} catch (error) {
				console.error(
					chalk.red("Error:"),
					error instanceof Error ? error.message : String(error)
				);
				process.exit(1);
			}
		});
	}

	// Add manual commands for custom endpoints (file upload/download)
	addCustomCommands(program, contracts);
}

function addCustomCommands(program: Command, contracts: EndpointContract[]): void {
	const customEndpoints = contracts.filter((ep) => ep.isCustom);
	if (customEndpoints.length === 0) return;

	// File download
	const filesGroup = program.commands.find((c) => c.name() === "files") ??
		program.command("files").description("files management");

	filesGroup
		.command("download <storagePath>")
		.description("Download a file from storage")
		.option("-o, --output <path>", "Output file path")
		.action(async (storagePath: string, opts: { output?: string }) => {
			const client = new ApiClient();
			const buffer = await client.downloadFile(
				`/files/download?path=${encodeURIComponent(storagePath)}`
			);
			const output = opts.output || storagePath.split("/").pop() || "file";
			fs.writeFileSync(output, buffer);
			console.log(chalk.green(`Downloaded → ${output} (${buffer.length} bytes)`));
		});

	// Testcase upload
	const problemsGroup = program.commands.find((c) => c.name() === "problems") ??
		program.command("problems").description("problems management");

	problemsGroup
		.command("testcases-upload <problemId>")
		.description("Upload a testcase (input + output files)")
		.requiredOption("-i, --input <path>", "Input file")
		.requiredOption("-o, --output <path>", "Output file")
		.option("-s, --score <n>", "Score", "0")
		.option("--visible", "Make visible (default: hidden)")
		.action(async (problemId: string, opts: Record<string, string>) => {
			const client = new ApiClient();
			const formData = new FormData();
			const inputBuf = fs.readFileSync(opts.input);
			const outputBuf = fs.readFileSync(opts.output);
			formData.append("inputFile", new Blob([inputBuf]), path.basename(opts.input));
			formData.append("outputFile", new Blob([outputBuf]), path.basename(opts.output));
			formData.append("score", opts.score || "0");
			formData.append("isHidden", opts.visible ? "false" : "true");

			const result = await client.postFormData(`/problems/${problemId}/testcases`, formData);
			console.log(chalk.green("Testcase uploaded:"), JSON.stringify(result, null, 2));
		});
}

/** Convert kebab-case to camelCase */
function camelize(str: string): string {
	return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
