import { getTableName, sql } from "drizzle-orm";
import type { PgColumn, PgTableWithColumns } from "drizzle-orm/pg-core";

/** Schema-safe qualified column reference for use inside raw SQL subqueries. */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle table generic is complex
export function col(table: PgTableWithColumns<any>, column: PgColumn) {
	return sql.raw(`"${getTableName(table)}"."${column.name}"`);
}

/** Schema-safe quoted table name for use inside raw SQL subqueries. */
// biome-ignore lint/suspicious/noExplicitAny: Drizzle table generic is complex
export function tbl(table: PgTableWithColumns<any>) {
	return sql.raw(`"${getTableName(table)}"`);
}
