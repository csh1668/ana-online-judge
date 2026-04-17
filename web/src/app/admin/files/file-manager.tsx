"use client";

import { useCallback, useState } from "react";
import { DeleteConfirmDialog } from "./_components/delete-confirm-dialog";
import { FileList } from "./_components/file-list";
import { FilePreview } from "./_components/file-preview";
import FolderTree from "./_components/folder-tree";
import { NewFolderDialog } from "./_components/new-folder-dialog";
import { UploadDialog } from "./_components/upload-dialog";

export function FileManager() {
	const [currentPrefix, setCurrentPrefix] = useState("");
	const [selectedFileKey, setSelectedFileKey] = useState<string | null>(null);
	const [refreshKey, setRefreshKey] = useState(0);

	const [uploadOpen, setUploadOpen] = useState(false);
	const [newFolderOpen, setNewFolderOpen] = useState(false);
	const [deleteTarget, setDeleteTarget] = useState<{ key: string; isFolder: boolean } | null>(null);

	const refresh = useCallback(() => {
		setRefreshKey((k) => k + 1);
	}, []);

	const handleNavigate = useCallback((prefix: string) => {
		setCurrentPrefix(prefix);
		setSelectedFileKey(null);
	}, []);

	const handleDeleteFile = useCallback((key: string) => {
		setDeleteTarget({ key, isFolder: false });
	}, []);

	const handleDeleted = useCallback(() => {
		setSelectedFileKey(null);
		setDeleteTarget(null);
		refresh();
	}, [refresh]);

	return (
		<>
			<div
				className="flex border rounded-lg overflow-hidden bg-background"
				style={{ height: "calc(100vh - 220px)" }}
			>
				<div className="w-56 shrink-0 border-r overflow-y-auto p-2">
					<FolderTree currentPrefix={currentPrefix} onNavigate={handleNavigate} />
				</div>
				<div className="flex-1 min-w-0 border-r">
					<FileList
						currentPrefix={currentPrefix}
						onNavigate={handleNavigate}
						onSelectFile={setSelectedFileKey}
						selectedFileKey={selectedFileKey}
						onUploadClick={() => setUploadOpen(true)}
						onNewFolderClick={() => setNewFolderOpen(true)}
						refreshKey={refreshKey}
					/>
				</div>
				<div className="w-[420px] shrink-0">
					<FilePreview fileKey={selectedFileKey} onDelete={handleDeleteFile} />
				</div>
			</div>

			<UploadDialog
				open={uploadOpen}
				onOpenChange={setUploadOpen}
				currentPrefix={currentPrefix}
				onUploaded={refresh}
			/>
			<NewFolderDialog
				open={newFolderOpen}
				onOpenChange={setNewFolderOpen}
				currentPrefix={currentPrefix}
				onCreated={refresh}
			/>
			<DeleteConfirmDialog
				open={deleteTarget !== null}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				target={deleteTarget}
				onDeleted={handleDeleted}
			/>
		</>
	);
}
