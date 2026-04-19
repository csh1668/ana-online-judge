import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const CACHE_FILE = path.join(os.homedir(), ".aoj-cache.json");
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CacheData<T> {
	baseUrl: string;
	fetchedAt: number;
	contracts: T;
}

export function loadCachedContracts<T>(baseUrl: string): T | null {
	try {
		if (!fs.existsSync(CACHE_FILE)) return null;
		const raw = fs.readFileSync(CACHE_FILE, "utf-8");
		const data = JSON.parse(raw) as CacheData<T>;
		if (data.baseUrl !== baseUrl) return null;
		if (Date.now() - data.fetchedAt > CACHE_TTL_MS) return null;
		return data.contracts;
	} catch {
		return null;
	}
}

export function saveCachedContracts<T>(baseUrl: string, contracts: T): void {
	try {
		const data: CacheData<T> = { baseUrl, fetchedAt: Date.now(), contracts };
		fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
		fs.chmodSync(CACHE_FILE, 0o600);
	} catch {
		// ignore cache write errors
	}
}

export function clearCachedContracts(): void {
	try {
		if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE);
	} catch {
		// ignore
	}
}

export { CACHE_FILE };
