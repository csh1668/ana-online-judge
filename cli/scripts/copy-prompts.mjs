import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(__dirname, "..", "src", "translate", "prompts");
const dest = path.join(__dirname, "..", "dist", "translate", "prompts");

if (!fs.existsSync(src)) {
	console.error(`copy-prompts: source not found: ${src}`);
	process.exit(1);
}
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.rmSync(dest, { recursive: true, force: true });
fs.cpSync(src, dest, { recursive: true });
