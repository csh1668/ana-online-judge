"use client";

import { ChevronDown, ChevronRight, Eye, Loader2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { DeleteTestcaseButton } from "./delete-button";

interface TestcaseRowProps {
	testcase: {
		id: number;
		inputPath: string;
		outputPath: string;
		score: number | null;
		isHidden: boolean;
	};
	index: number;
	problemId: number;
}

export function TestcaseRow({ testcase, index, problemId }: TestcaseRowProps) {
	const [isExpanded, setIsExpanded] = useState(false);
	const [isLoadingContent, setIsLoadingContent] = useState(false);
	const [inputContent, setInputContent] = useState<string | null>(null);
	const [outputContent, setOutputContent] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	async function loadContent() {
		if (inputContent !== null && outputContent !== null) {
			// Already loaded
			setIsExpanded(!isExpanded);
			return;
		}

		setIsLoadingContent(true);
		setError(null);

		try {
			const [inputRes, outputRes] = await Promise.all([
				fetch(`/api/admin/get-file-content?path=${encodeURIComponent(testcase.inputPath)}`),
				fetch(`/api/admin/get-file-content?path=${encodeURIComponent(testcase.outputPath)}`),
			]);

			const [inputData, outputData] = await Promise.all([inputRes.json(), outputRes.json()]);

			if (inputData.content) {
				setInputContent(inputData.content);
			}
			if (outputData.content) {
				setOutputContent(outputData.content);
			}

			setIsExpanded(true);
		} catch (err) {
			setError("파일 내용을 불러오는데 실패했습니다.");
			console.error("Load testcase content error:", err);
		} finally {
			setIsLoadingContent(false);
		}
	}

	return (
		<>
			<TableRow>
				<TableCell className="font-mono">{index + 1}</TableCell>
				<TableCell className="font-mono text-xs">
					<div className="space-y-1">
						<div className="truncate max-w-[250px]">{testcase.inputPath}</div>
						<div className="truncate max-w-[250px] text-muted-foreground">
							{testcase.outputPath}
						</div>
					</div>
				</TableCell>
				<TableCell>{testcase.score || 0}</TableCell>
				<TableCell>
					<Badge variant={testcase.isHidden ? "secondary" : "outline"}>
						{testcase.isHidden ? "숨김" : "공개"}
					</Badge>
				</TableCell>
				<TableCell>
					<div className="flex items-center gap-2">
						<Button variant="ghost" size="sm" onClick={loadContent} disabled={isLoadingContent}>
							{isLoadingContent ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : isExpanded ? (
								<>
									<ChevronDown className="h-4 w-4 mr-1" />
									닫기
								</>
							) : (
								<>
									<ChevronRight className="h-4 w-4 mr-1" />
									<Eye className="h-4 w-4" />
								</>
							)}
						</Button>
						<DeleteTestcaseButton testcaseId={testcase.id} problemId={problemId} />
					</div>
				</TableCell>
			</TableRow>

			{isExpanded && (
				<TableRow>
					<TableCell colSpan={5} className="bg-muted/50">
						{error ? (
							<div className="p-4 text-destructive">{error}</div>
						) : (
							<div className="p-4 space-y-4">
								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									{/* Input Content */}
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<h4 className="text-sm font-medium">입력 파일</h4>
											<span className="text-xs text-muted-foreground">
												{inputContent?.length || 0} bytes
											</span>
										</div>
										<div className="relative">
											<pre className="text-xs font-mono p-3 bg-background border rounded-md max-h-[300px] overflow-auto">
												{inputContent || "로딩 중..."}
											</pre>
										</div>
									</div>

									{/* Output Content */}
									<div className="space-y-2">
										<div className="flex items-center justify-between">
											<h4 className="text-sm font-medium">출력 파일</h4>
											<span className="text-xs text-muted-foreground">
												{outputContent?.length || 0} bytes
											</span>
										</div>
										<div className="relative">
											<pre className="text-xs font-mono p-3 bg-background border rounded-md max-h-[300px] overflow-auto">
												{outputContent || "로딩 중..."}
											</pre>
										</div>
									</div>
								</div>
							</div>
						)}
					</TableCell>
				</TableRow>
			)}
		</>
	);
}
