import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Advisory-lock class id for per-draft workshop write serialization. */
const WORKSHOP_DRAFT_LOCK_CLASS = 42001;

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Run `fn` inside a transaction that holds a per-draft advisory lock, so
 * index assignment and row swaps for one draft never interleave. Keep MinIO
 * I/O OUT of `fn` — the lock should be held for milliseconds.
 */
export async function withDraftLock<T>(draftId: number, fn: (tx: Tx) => Promise<T>): Promise<T> {
	return db.transaction(async (tx) => {
		await tx.execute(sql`SELECT pg_advisory_xact_lock(${WORKSHOP_DRAFT_LOCK_CLASS}, ${draftId})`);
		return fn(tx);
	});
}
