import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BUNDLE_DIR = dirname(fileURLToPath(import.meta.url));

export const WORKSHOP_BUNDLED_TESTLIB_FILENAME = "testlib.h";

/**
 * Read a bundled workshop resource file (e.g. testlib.h) from disk.
 * These files ship inside the web container image.
 * Path is resolved relative to this module so Next.js output tracing can include them.
 */
export async function readBundledWorkshopResource(filename: string): Promise<Buffer> {
	return readFile(join(BUNDLE_DIR, filename));
}
