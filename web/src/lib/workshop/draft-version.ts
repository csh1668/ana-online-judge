/**
 * Thrown by header-field update services when the caller's `expectedVersion`
 * no longer matches `workshopDrafts.version` — i.e. another session (another
 * tab, another device) saved in between. The client matches on this exact
 * substring to offer a "새로고침" affordance (see workshop edit forms).
 *
 * Deliberately dependency-free (no `@/db` import) — both server services and
 * "use client" edit forms import this constant, and pulling the Postgres
 * driver into the browser bundle breaks the client build.
 */
export const DRAFT_VERSION_CONFLICT_MESSAGE =
	"다른 세션에서 드래프트가 수정되었습니다. 새로고침 후 다시 시도하세요.";
