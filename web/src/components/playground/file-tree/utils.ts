import type { Node, PlaygroundFile } from "./types";

export const buildFileTree = (files: PlaygroundFile[]): Node[] => {
	const root: Node[] = [];

	files.forEach((file) => {
		const parts = file.path.split("/");
		let currentLevel = root;
		let currentPath = "";

		parts.forEach((part, index) => {
			currentPath = currentPath ? `${currentPath}/${part}` : part;
			const isFile = index === parts.length - 1;

			if (isFile && part === ".gitkeep") {
				return;
			}

			let node = currentLevel.find((n) => n.name === part);

			if (!node) {
				node = {
					id: currentPath,
					name: part,
					type: isFile ? "file" : "folder",
					children: isFile ? undefined : [],
				};
				currentLevel.push(node);
			}

			if (!isFile && node.children) {
				currentLevel = node.children;
			}
		});
	});

	const sortNodes = (nodes: Node[]) => {
		nodes.sort((a, b) => {
			if (a.type === b.type) return a.name.localeCompare(b.name);
			return a.type === "folder" ? -1 : 1;
		});
		nodes.forEach((n) => {
			if (n.children) sortNodes(n.children);
		});
	};

	sortNodes(root);
	return root;
};

export const flattenPaths = (nodes: Node[], expandedFolders: Set<string>): string[] => {
	const paths: string[] = [];
	const traverse = (ns: Node[]) => {
		ns.forEach((node) => {
			paths.push(node.id);
			if (node.children && expandedFolders.has(node.id)) {
				traverse(node.children);
			}
		});
	};
	traverse(nodes);
	return paths;
};

export const findNode = (nodes: Node[], path: string): Node | null => {
	for (const node of nodes) {
		if (node.id === path) return node;
		if (node.children) {
			const found = findNode(node.children, path);
			if (found) return found;
		}
	}
	return null;
};

export const isZipFile = (path: string) => path.toLowerCase().endsWith(".zip");

export const isBinaryExtension = (path: string): boolean => {
	const ext = path.split(".").pop()?.toLowerCase();
	const binaryExtensions = [
		"png",
		"jpg",
		"jpeg",
		"gif",
		"bmp",
		"webp",
		"ico",
		"svg",
		"mp3",
		"mp4",
		"avi",
		"mov",
		"wav",
		"flac",
		"ogg",
		"zip",
		"tar",
		"gz",
		"bz2",
		"7z",
		"rar",
		"exe",
		"dll",
		"so",
		"dylib",
		"bin",
		"pdf",
		"doc",
		"docx",
		"xls",
		"xlsx",
		"ppt",
		"pptx",
	];
	return ext ? binaryExtensions.includes(ext) : false;
};

export const getAllFolderPaths = (nodes: Node[]): string[] => {
	const folders: string[] = ["__root__"];
	const collectFolders = (ns: Node[], parentPath = "") => {
		ns.forEach((node) => {
			if (node.type === "folder") {
				const fullPath = parentPath ? `${parentPath}/${node.name}` : node.name;
				folders.push(fullPath);
				if (node.children) {
					collectFolders(node.children, fullPath);
				}
			}
		});
	};
	collectFolders(nodes);
	return folders;
};
