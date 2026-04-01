#!/usr/bin/env node

import { Command } from "commander";
import chalk from "chalk";
import { saveConfig, loadConfig } from "./client.js";
import { registerAutoCommands } from "./auto-commands.js";

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

// Strip bare "--" separators that pnpm injects (e.g., `pnpm dev -- config`)
const argv = process.argv.filter((a, i) => !(i >= 2 && a === "--"));

// Check if this is a local-only command (config/status/help/--version)
const localCommands = ["config", "status", "help"];
const firstArg = argv[2];
const isLocalCommand =
	!firstArg ||
	localCommands.includes(firstArg) ||
	firstArg === "--help" ||
	firstArg === "-h" ||
	firstArg === "--version" ||
	firstArg === "-V";

if (isLocalCommand) {
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
