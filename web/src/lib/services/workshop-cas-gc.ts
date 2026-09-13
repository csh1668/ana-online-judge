import { eq } from "drizzle-orm";
import { db } from "@/db";
import { workshopSnapshots } from "@/db/schema";
import type { SnapshotState } from "@/lib/services/workshop-snapshots";
import { deleteFile, listObjectsWithDetails } from "@/lib/storage/operations";

export type CasGcResult = {
	referenced: number;
	total: number;
	orphans: string[];
	deleted: number;
};

/**
 * 갓 쓰인 객체는 GC 대상에서 제외하는 유예 기간(ms). createSnapshot은 객체를
 * 먼저 CAS에 쓰고 그 뒤 스냅샷 행을 INSERT하므로, 그 사이(보통 1초 미만)에 GC가
 * 돌면 아직 어떤 스냅샷도 참조하지 않는 "진행 중" 객체를 고아로 오인할 수 있다.
 * 넉넉한 유예로 그 경합을 차단한다.
 */
const GC_GRACE_MS = 10 * 60 * 1000;

/** 한 문제의 미참조 CAS 객체를 찾는다. dryRun=true(기본)면 삭제하지 않고 목록만 반환. */
export async function gcWorkshopObjects(
	problemId: number,
	opts: { dryRun?: boolean; now?: number } = {}
): Promise<CasGcResult> {
	const dryRun = opts.dryRun ?? true;
	const now = opts.now ?? Date.now();
	const snaps = await db
		.select({ stateJson: workshopSnapshots.stateJson })
		.from(workshopSnapshots)
		.where(eq(workshopSnapshots.workshopProblemId, problemId));
	const referenced = new Set<string>();
	for (const s of snaps) {
		const st = s.stateJson as SnapshotState;
		// 문제 헤더가 가리키는 CAS 해시. `SnapshotProblemHeader`에 `*Hash` 필드를
		// 새로 추가하면 반드시 여기에도 더해야 한다. 빠뜨리면 살아 있는 객체가
		// 고아로 집계되어 GC가 지워 버리고, 그 스냅샷으로의 롤백이 깨진다
		// (transformerHash가 실제로 그렇게 누락된 적이 있다).
		if (st.problem.checkerHash) referenced.add(st.problem.checkerHash);
		if (st.problem.transformerHash) referenced.add(st.problem.transformerHash);
		if (st.problem.validatorHash) referenced.add(st.problem.validatorHash);
		for (const t of st.testcases) {
			referenced.add(t.inputHash);
			if (t.outputHash) referenced.add(t.outputHash);
		}
		for (const g of st.generators) {
			referenced.add(g.sourceHash);
			if (g.compiledHash) referenced.add(g.compiledHash);
		}
		for (const so of st.solutions) referenced.add(so.sourceHash);
		for (const r of st.resources) referenced.add(r.hash);
		for (const im of st.images ?? []) referenced.add(im.hash);
	}
	const prefix = `workshop/${problemId}/objects/`;
	const objects = await listObjectsWithDetails(prefix);
	const orphans: string[] = [];
	for (const obj of objects) {
		const sha = obj.key.slice(prefix.length);
		if (referenced.has(sha)) continue;
		// 유예 기간 내에 쓰인 객체는 진행 중인 스냅샷의 것일 수 있어 건너뛴다.
		if (now - obj.lastModified.getTime() < GC_GRACE_MS) continue;
		orphans.push(obj.key);
	}
	let deleted = 0;
	if (!dryRun) {
		for (const key of orphans) {
			await deleteFile(key);
			deleted++;
		}
	}
	return { referenced: referenced.size, total: objects.length, orphans, deleted };
}
