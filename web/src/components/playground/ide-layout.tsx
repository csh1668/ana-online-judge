"use client";

import { useMemo, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
	deletePlaygroundFile,
	renamePlaygroundFile,
	savePlaygroundFile,
} from "@/actions/playground";
import { CodeEditor } from "./code-editor";
import { FileTree } from "./file-tree";
import { InputPanel } from "./input-panel";
import { OutputPanel } from "./output-panel";

interface PlaygroundFile {
	path: string;
	content: string;
}

interface IDELayoutProps {
	sessionId: string;
	initialFiles: PlaygroundFile[];
}

// 실행 가능한 파일인지 확인
function isExecutableFile(path: string): boolean {
	const filename = path.split("/").pop() || "";
	if (filename === "Makefile" || filename === "makefile") return true;

	const ext = filename.split(".").pop()?.toLowerCase();
	return ["c", "cpp", "cc", "cxx", "py", "java", "rs", "go", "js"].includes(ext || "");
}

// Makefile인지 확인
function isMakefile(path: string): boolean {
	const filename = path.split("/").pop() || "";
	return filename === "Makefile" || filename === "makefile";
}

export function IDELayout({ sessionId, initialFiles }: IDELayoutProps) {
	const [files, setFiles] = useState<PlaygroundFile[]>(initialFiles);
	const [activeFile, setActiveFile] = useState<string>(initialFiles[0]?.path ?? "");
	const [openTabs, setOpenTabs] = useState<string[]>(
		initialFiles.length > 0 ? [initialFiles[0].path] : []
	);
	const [input, setInput] = useState("");
	const [output, setOutput] = useState<{
		stdout: string;
		stderr: string;
		timeMs: number;
		memoryKb: number;
		compileOutput?: string | null;
	} | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	// 현재 선택된 파일이 실행 가능한지
	const canRun = useMemo(() => isExecutableFile(activeFile), [activeFile]);

	// 입력 패널 라벨 (Makefile이면 input.txt, 아니면 stdin)
	const inputLabel = useMemo(
		() => (isMakefile(activeFile) ? "input.txt (파일 입력)" : "stdin (표준 입력)"),
		[activeFile]
	);

	const handleRefresh = () => {
		// Trigger a re-fetch by reloading the page or updating state
		window.location.reload();
	};

	const handleRun = async () => {
		if (!canRun) {
			setOutput({
				stdout: "",
				stderr: "실행할 수 없는 파일입니다. Makefile 또는 소스 파일을 선택해주세요.",
				timeMs: 0,
				memoryKb: 0,
			});
			return;
		}

		setIsRunning(true);
		setOutput(null);

		try {
			// 실행 전에 모든 파일 자동 저장
			await Promise.all(
				files.map((file) => savePlaygroundFile(sessionId, file.path, file.content))
			);

			const response = await fetch("/api/playground/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					targetPath: activeFile, // 현재 선택된 파일을 실행
					input,
				}),
			});

			const result = await response.json();

			if (result.error) {
				setOutput({
					stdout: "",
					stderr: result.error,
					timeMs: 0,
					memoryKb: 0,
				});
			} else {
				setOutput({
					stdout: result.stdout,
					stderr: result.stderr,
					timeMs: result.time_ms,
					memoryKb: result.memory_kb,
					compileOutput: result.compile_output,
				});
			}
		} catch (_error) {
			setOutput({
				stdout: "",
				stderr: "실행 중 오류가 발생했습니다.",
				timeMs: 0,
				memoryKb: 0,
			});
		} finally {
			setIsRunning(false);
		}
	};

	return (
		<div className="h-screen flex flex-col">
			<PanelGroup direction="horizontal" className="flex-1">
				{/* 파일 트리 */}
				<Panel defaultSize={20} minSize={15}>
					<FileTree
						sessionId={sessionId}
						files={files}
						activeFile={activeFile}
						onSelect={(path) => {
							setActiveFile(path);
							if (!openTabs.includes(path)) {
								setOpenTabs([...openTabs, path]);
							}
						}}
						onCreateFile={async (path, content) => {
							try {
								await savePlaygroundFile(sessionId, path, content);
								setFiles([...files, { path, content }]);
								setActiveFile(path);
								if (!openTabs.includes(path)) {
									setOpenTabs([...openTabs, path]);
								}
							} catch (error) {
								console.error("Failed to create file:", error);
								alert(
									`파일 생성 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`
								);
							}
						}}
						onDeleteFile={async (path) => {
							setFiles(files.filter((f) => f.path !== path));
							setOpenTabs(openTabs.filter((t) => t !== path));
							if (activeFile === path) {
								setActiveFile(openTabs.find((t) => t !== path) ?? "");
							}
							await deletePlaygroundFile(sessionId, path);
						}}
						onRenameFile={async (oldPath, newPath) => {
							setFiles(files.map((f) => (f.path === oldPath ? { ...f, path: newPath } : f)));
							setOpenTabs(openTabs.map((t) => (t === oldPath ? newPath : t)));
							if (activeFile === oldPath) {
								setActiveFile(newPath);
							}
							await renamePlaygroundFile(sessionId, oldPath, newPath);
						}}
						onRefresh={handleRefresh}
					/>
				</Panel>

				<PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

				{/* 에디터 + 출력 */}
				<Panel defaultSize={80}>
					<PanelGroup direction="vertical">
						{/* 코드 에디터 */}
						<Panel defaultSize={60}>
							<CodeEditor
								files={files}
								activeFile={activeFile}
								openTabs={openTabs}
								onTabClose={(path) => {
									const newTabs = openTabs.filter((t) => t !== path);
									setOpenTabs(newTabs);
									if (activeFile === path) {
										setActiveFile(newTabs[newTabs.length - 1] ?? "");
									}
								}}
								onTabSelect={setActiveFile}
								onChange={(path, content) => {
									setFiles(files.map((f) => (f.path === path ? { ...f, content } : f)));
								}}
								onRun={handleRun}
								isRunning={isRunning}
								canRun={canRun}
							/>
						</Panel>

						<PanelResizeHandle className="h-1 bg-border hover:bg-primary transition-colors" />

						{/* 입력 + 출력 */}
						<Panel defaultSize={40}>
							<PanelGroup direction="horizontal">
								<Panel defaultSize={50}>
									<InputPanel value={input} onChange={setInput} label={inputLabel} />
								</Panel>

								<PanelResizeHandle className="w-1 bg-border hover:bg-primary transition-colors" />

								<Panel defaultSize={50}>
									<OutputPanel output={output} isRunning={isRunning} />
								</Panel>
							</PanelGroup>
						</Panel>
					</PanelGroup>
				</Panel>
			</PanelGroup>
		</div>
	);
}
