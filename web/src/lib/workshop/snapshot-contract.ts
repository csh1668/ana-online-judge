/**
 * Consumer-side re-export of the snapshot state shape.
 *
 * Phase 7 (`workshop-snapshots.ts`) is the producer. Phase 8 (publish pipeline)
 * is the consumer. This module re-exports the canonical type so downstream
 * services don't import from the heavyweight snapshots module directly.
 */

export type {
	SnapshotGenerator,
	SnapshotProblemHeader,
	SnapshotResource,
	SnapshotSolution,
	SnapshotState as WorkshopSnapshotStateJson,
	SnapshotTestcase,
} from "@/lib/services/workshop-snapshots";
