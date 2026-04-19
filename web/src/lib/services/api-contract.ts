/**
 * API contract — CLI-consumable endpoint metadata.
 * Generated at runtime from api-registry.ts.
 * CLI fetches via GET /meta/endpoints to auto-build commander commands.
 */

import type { z } from "zod";
import { endpoints } from "./api-registry";

export interface ParamDef {
	name: string;
	type: "string" | "number" | "boolean" | "object" | "array";
	required: boolean;
	default?: unknown;
	enum?: string[];
}

export interface EndpointContract {
	method: "GET" | "POST" | "PUT" | "DELETE";
	path: string;
	description: string;
	pathParams: string[];
	queryParams: ParamDef[];
	bodyParams: ParamDef[];
	isCustom: boolean;
}

function extractPathParams(path: string): string[] {
	return path
		.split("/")
		.filter((s) => s.startsWith(":"))
		.map((s) => s.slice(1));
}

// biome-ignore lint/suspicious/noExplicitAny: zod internals
function getDef(field: any): any {
	return field?._zod?.def ?? field?._def;
}

function zodShapeToParams(schema: z.ZodObject<z.ZodRawShape> | undefined): ParamDef[] {
	if (!schema) return [];

	const params: ParamDef[] = [];
	const shape = schema.shape;

	for (const [key, rawField] of Object.entries(shape)) {
		const param: ParamDef = {
			name: key,
			type: "string",
			required: true,
		};

		let def = getDef(rawField);

		// Unwrap optional
		if (def?.type === "optional") {
			param.required = false;
			def = getDef(def.innerType);
		}

		// Unwrap default
		if (def?.type === "default") {
			param.required = false;
			param.default = def.defaultValue;
			def = getDef(def.innerType);
		}

		// Unwrap nullable
		if (def?.type === "nullable") {
			param.required = false;
			def = getDef(def.innerType);
		}

		// Unwrap pipe (if present)
		if (def?.type === "pipe") {
			def = getDef(def.out ?? def.to);
		}

		// Determine type
		const typeName = def?.type ?? "";
		if (typeName === "number" || typeName === "int32" || typeName === "float64") {
			param.type = "number";
		} else if (typeName === "boolean") {
			param.type = "boolean";
		} else if (typeName === "enum") {
			param.type = "string";
			// Zod v4: entries is { a: "a", b: "b" }
			if (def.entries && typeof def.entries === "object") {
				param.enum = Object.values(def.entries);
			} else if (Array.isArray(def.values)) {
				param.enum = def.values;
			}
		} else if (typeName === "object" || typeName === "record" || typeName === "map") {
			param.type = "object";
		} else if (typeName === "array" || typeName === "tuple" || typeName === "set") {
			param.type = "array";
		}

		params.push(param);
	}

	return params;
}

export function generateContracts(): EndpointContract[] {
	return endpoints.map((ep) => ({
		method: ep.method,
		path: ep.path,
		description: ep.description,
		pathParams: extractPathParams(ep.path),
		queryParams: ep.type === "json" ? zodShapeToParams(ep.query) : [],
		bodyParams: ep.type === "json" ? zodShapeToParams(ep.body) : [],
		isCustom: ep.type === "custom",
	}));
}
