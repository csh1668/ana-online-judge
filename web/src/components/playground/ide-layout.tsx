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

function isExecutableFile(path: string): boolean {
	const filename = path.split("/").pop() || "";
	if (filename === "Makefile" || filename === "makefile") return true;

	const ext = filename.split(".").pop()?.toLowerCase();
	return ["c", "cpp", "cc", "cxx", "py", "java", "rs", "go", "js"].includes(ext || "");
}

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
	const [anigmaMode, setAnigmaMode] = useState(false);
	const [anigmaFileName, setAnigmaFileName] = useState("sample.in");
	const [output, setOutput] = useState<{
		stdout: string;
		stderr: string;
		timeMs: number;
		memoryKb: number;
		compileOutput?: string | null;
	} | null>(null);
	const [isRunning, setIsRunning] = useState(false);

	const canRun = useMemo(() => isExecutableFile(activeFile), [activeFile]);
	const isMakefileSelected = useMemo(() => isMakefile(activeFile), [activeFile]);

	const inputLabel = useMemo(() => {
		if (isMakefileSelected) {
			return anigmaMode ? "파일 이름 (ANIGMA 모드)" : "input.txt (파일 입력)";
		}
		return "stdin (표준 입력)";
	}, [isMakefileSelected, anigmaMode]);

	const handleRefresh = async () => {
		try {
			const response = await fetch(`/api/playground/sessions/${sessionId}/files`);
			if (response.ok) {
				const data = await response.json();
				if (data.files) {
					setFiles(data.files);
				}
			}
		} catch (error) {
			console.error("Failed to refresh files:", error);
			window.location.reload();
		}
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
			await Promise.all(
				files.map((file) => savePlaygroundFile(sessionId, file.path, file.content))
			);

			const response = await fetch("/api/playground/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sessionId,
					targetPath: activeFile,
					input: isMakefileSelected && anigmaMode ? anigmaFileName : input,
					anigmaMode: isMakefileSelected && anigmaMode,
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

				if (result.created_files && result.created_files.length > 0) {
					await handleRefresh();
				}
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

				<Panel defaultSize={80}>
					<PanelGroup direction="vertical">
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

						<Panel defaultSize={40}>
							<PanelGroup direction="horizontal">
								<Panel defaultSize={50}>
									{isMakefileSelected ? (
										<div className="h-full flex flex-col border rounded-md overflow-hidden bg-background">
											<div className="p-2 bg-muted/30 border-b">
												<label className="flex items-center gap-2 text-xs font-semibold">
													<input
														type="checkbox"
														checked={anigmaMode}
														onChange={(e) => setAnigmaMode(e.target.checked)}
														className="h-4 w-4"
													/>
													ANIGMA 모드
												</label>
											</div>
											{anigmaMode ? (
												<div className="flex-1 p-4 flex flex-col gap-2">
													<label className="text-xs font-semibold text-muted-foreground">
														파일 이름:
													</label>
													<input
														type="text"
														value={anigmaFileName}
														onChange={(e) => setAnigmaFileName(e.target.value)}
														className="px-3 py-2 border rounded-md font-mono text-sm"
														placeholder="sample.in"
													/>
													<p className="text-xs text-muted-foreground">
														실행: make build → make run file={anigmaFileName || "sample.in"}
													</p>
													<p className="text-xs text-muted-foreground mt-2">
														입력 파일은 텍스트/바이너리 모두 지원됩니다.
													</p>
												</div>
											) : (
												<InputPanel value={input} onChange={setInput} label={inputLabel} />
											)}
										</div>
									) : (
										<InputPanel value={input} onChange={setInput} label={inputLabel} />
									)}
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
