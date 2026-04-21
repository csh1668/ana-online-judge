import { randomInt } from "node:crypto";

const POOL = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
const LENGTH = 12;

export function generateTempPassword(): string {
	let out = "";
	for (let i = 0; i < LENGTH; i++) {
		out += POOL[randomInt(0, POOL.length)];
	}
	return out;
}
