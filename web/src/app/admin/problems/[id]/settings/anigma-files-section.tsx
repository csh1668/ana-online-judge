"use client";

import { Download, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AnigmaFilesSectionProps {
	referenceCodePath: string | null;
	solutionCodePath: string | null;
}

export function AnigmaFilesSection({
	referenceCodePath,
	solutionCodePath,
}: AnigmaFilesSectionProps) {
	function handleDownload(path: string, _filename: string) {
		window.open(`/api/admin/download-file?path=${encodeURIComponent(path)}`, "_blank");
	}

	if (!referenceCodePath && !solutionCodePath) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<FileCode className="h-5 w-5" />
					ANIGMA 파일
				</CardTitle>
				<CardDescription>
					Task 1에서 사용되는 참조 코드 및 출제자 솔루션을 다운로드합니다.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				{referenceCodePath && (
					<div className="flex items-center justify-between p-3 border rounded-md">
						<div>
							<p className="text-sm font-medium">참조 코드 (Reference A/B)</p>
							<p className="text-xs text-muted-foreground font-mono mt-1">{referenceCodePath}</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								handleDownload(referenceCodePath, `reference_${referenceCodePath.split("/").pop()}`)
							}
						>
							<Download className="mr-2 h-4 w-4" />
							다운로드
						</Button>
					</div>
				)}

				{solutionCodePath && (
					<div className="flex items-center justify-between p-3 border rounded-md">
						<div>
							<p className="text-sm font-medium">출제자 솔루션</p>
							<p className="text-xs text-muted-foreground font-mono mt-1">{solutionCodePath}</p>
						</div>
						<Button
							variant="outline"
							size="sm"
							onClick={() =>
								handleDownload(solutionCodePath, `solution_${solutionCodePath.split("/").pop()}`)
							}
						>
							<Download className="mr-2 h-4 w-4" />
							다운로드
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
