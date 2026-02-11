export interface PlaygroundFile {
	path: string;
	content: string;
}

export type Node = {
	id: string; // full path
	name: string;
	type: "file" | "folder";
	children?: Node[];
};

export interface FileTreeProps {
	sessionId: string;
	files: PlaygroundFile[];
	activeFile: string;
	onSelect: (path: string) => void;
	onCreateFile: (path: string, content: string) => void;
	onDeleteFile: (path: string) => void;
	onRenameFile: (oldPath: string, newPath: string) => void;
	onRefresh: () => void;
}

export type CreateDialogType = "file" | "folder" | null;
