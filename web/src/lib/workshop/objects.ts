import { createHash } from "node:crypto";
import { copyObject, downloadFile, headObject, uploadFile } from "@/lib/storage/operations";
import { workshopObjectPath } from "@/lib/workshop/paths";

/**
 * Content-addressed object store for workshop snapshots.
 *
 * Layout: `workshop/{problemId}/objects/{sha256}`
 *
 * - `storeAsObject` hashes content, puts it at the CAS key if absent, returns
 *   the hash. Same content → same hash → same key → natural dedup across
 *   snapshots and users.
 * - `restoreObject` copies server-side from `objects/{sha256}` back to a
 *   destination path (e.g. `drafts/{userId}/checker.cpp`). Never downloads.
 * - `storeAsObjectByKey` is a convenience wrapper: reads an existing key's
 *   bytes, hashes them, stores at the CAS key, returns the hash. Used when
 *   snapshotting from existing draft paths rather than from fresh uploads.
 *
 * Note (deferred, spec §MVP 제외): this store has no GC. Objects accumulate
 * forever. Implementing GC requires a reference counter across all snapshot
 * `stateJson` blobs plus a grace period for in-flight commits — planned for
 * the 2차 roadmap.
 */

export function hashOf(data: Buffer): string {
	return createHash("sha256").update(data).digest("hex");
}

/**
 * Hash `data`, then PUT to `objects/{sha256}` if not already present. Returns
 * the hex sha256. Safe to call concurrently: HEAD races only cost an extra
 * PUT (S3 PUTs are idempotent on the same body).
 */
export async function storeAsObject(problemId: number, data: Buffer): Promise<string> {
	const sha256 = hashOf(data);
	const key = workshopObjectPath(problemId, sha256);
	const exists = await headObject(key);
	if (!exists) {
		await uploadFile(key, data, "application/octet-stream");
	}
	return sha256;
}

/**
 * Download `sourceKey`, hash its bytes, and content-address it into
 * `objects/{sha256}`. Returns the hex sha256. Used during snapshot creation
 * when the file already lives at a draft path and we want to promote it
 * into the CAS without round-tripping through the caller.
 */
export async function storeAsObjectByKey(problemId: number, sourceKey: string): Promise<string> {
	const body = await downloadFile(sourceKey);
	return storeAsObject(problemId, body);
}

/**
 * Server-side copy from `objects/{sha256}` to `destKey`. Assumes the object
 * exists (this is called during rollback right after we've verified that
 * the stateJson references match what's in the CAS). Throws on missing
 * source.
 */
export async function restoreObject(
	problemId: number,
	sha256: string,
	destKey: string
): Promise<void> {
	const sourceKey = workshopObjectPath(problemId, sha256);
	await copyObject(sourceKey, destKey);
}
