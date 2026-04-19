#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { saveConfig, loadConfig, ApiClient } from "./client.js";
import { registerAutoCommands, endpointToCommandInfo, fetchContracts } from "./auto-commands.js";
import { clearCachedContracts, CACHE_FILE } from "./cache.js";

interface HelpEndpoint {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	description: string;
	pathParams: string[];
	isCustom: boolean;
	queryParams: { name: string }[];
}

async function printHelpWithApiCommands(program: Command): Promise<void> {
	program.outputHelp();

	const config = loadConfig();
	if (!config) {
		console.log(
			chalk.dim("\n  API commands available after configuration: aoj config --url <url> --key <key>")
		);
		return;
	}

	try {
		const client = new ApiClient(config);
		const contracts = (await fetchContracts(client)) as unknown as HelpEndpoint[];

		// Group by first path segment, using real command names
		const groups = new Map<string, Map<string, string>>();
		for (const ep of contracts) {
			if (ep.isCustom || ep.path === "meta/endpoints") continue;
			// biome-ignore lint: endpointToCommandInfo only reads common fields
			const { group, action } = endpointToCommandInfo(ep as any);
			if (!groups.has(group)) groups.set(group, new Map());
			groups.get(group)!.set(action, ep.description);
		}

		console.log(chalk.bold("\nAPI Commands:"));
		const entries = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
		for (let i = 0; i < entries.length; i++) {
			const [group, subCommands] = entries[i];
			const isLast = i === entries.length - 1;
			const prefix = isLast ? "└─" : "├─";
			console.log(`  ${prefix} ${chalk.cyan(group)}`);

			if (subCommands.size > 0) {
				const subs = [...subCommands.entries()].sort(([a], [b]) => a.localeCompare(b));
				const branchPrefix = isLast ? "   " : "│  ";
				for (let j = 0; j < subs.length; j++) {
					const [name, desc] = subs[j];
					const subPrefix = j === subs.length - 1 ? "└─" : "├─";
					console.log(`  ${branchPrefix} ${subPrefix} ${chalk.dim(name)}  ${chalk.gray(desc)}`);
				}
			}
		}

		console.log(chalk.dim(`\n  Run ${chalk.reset("aoj <command> -h")} for details on each command.`));
	} catch {
		console.log(chalk.dim("\n  API commands unavailable (server not reachable)"));
	}
}

const program = new Command();

program
	.name("aoj")
	.description("ANA Online Judge CLI — Admin management tool")
	.version("0.1.0");

// Config command (always available, doesn't need server)
program
	.command("config")
	.description("Configure CLI connection")
	.requiredOption("-u, --url <url>", "Web server base URL (e.g., http://localhost:3000)")
	.requiredOption("-k, --key <key>", "Admin API key")
	.action((opts) => {
		saveConfig({ baseUrl: opts.url, apiKey: opts.key });
		console.log(chalk.green("Configuration saved to ~/.aojrc"));
	});

program
	.command("status")
	.description("Show current configuration")
	.action(() => {
		const config = loadConfig();
		if (!config) {
			console.log(chalk.yellow("Not configured. Run: aoj config --url <url> --key <key>"));
			return;
		}
		console.log(`Base URL: ${chalk.cyan(config.baseUrl)}`);
		console.log(`API Key:  ${chalk.dim(config.apiKey.slice(0, 8) + "...")}`);
	});

program
	.command("refresh")
	.description("Clear cached API schema (forces re-fetch on next command)")
	.action(() => {
		clearCachedContracts();
		console.log(chalk.green(`Cleared ${CACHE_FILE}`));
	});

// Strip bare "--" separators that pnpm injects (e.g., `pnpm dev -- config`)
const argv = process.argv.filter((a, i) => !(i >= 2 && a === "--"));

// Check if this is a help/version request
const firstArg = argv[2];
const isHelpRequest =
	!firstArg || firstArg === "--help" || firstArg === "-h";
const isLocalCommand =
	firstArg === "--version" ||
	firstArg === "-V" ||
	firstArg === "config" ||
	firstArg === "status" ||
	firstArg === "refresh" ||
	firstArg === "help";

if (isHelpRequest) {
	printHelpWithApiCommands(program);
} else if (isLocalCommand) {
	program.parse(argv);
} else {
	// Fetch API schema and register dynamic commands
	registerAutoCommands(program)
		.then(() => program.parse(argv))
		.catch((err) => {
			console.error(chalk.red("Error:"), err.message);
			process.exit(1);
		});
}
