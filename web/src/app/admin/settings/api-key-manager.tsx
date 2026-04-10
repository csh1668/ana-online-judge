"use client";

import { Copy, Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { setSiteSetting } from "@/actions/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicEnv } from "@/lib/env/publicEnv";

interface ApiKeyManagerProps {
	initialKey: string | null;
}

export function ApiKeyManager({ initialKey }: ApiKeyManagerProps) {
	const [apiKey, setApiKey] = useState(initialKey ?? "");
	const [visible, setVisible] = useState(false);
	const [isPending, startTransition] = useTransition();

	const handleSave = (newKey: string) => {
		startTransition(async () => {
			try {
				await setSiteSetting("admin_api_key", newKey);
				setApiKey(newKey);
				toast.success("API Key가 저장되었습니다.");
			} catch {
				toast.error("API Key 저장에 실패했습니다.");
			}
		});
	};

	const handleGenerate = () => {
		const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		let key = "aoj_";
		for (let i = 0; i < 32; i++) {
			key += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		handleSave(key);
	};

	const handleCopy = () => {
		navigator.clipboard.writeText(apiKey);
		toast.success("클립보드에 복사되었습니다.");
	};

	return (
		<div className="space-y-3">
			<Label className="text-base">API Key</Label>
			<p className="text-sm text-muted-foreground">CLI 도구에서 사용할 관리자 API Key입니다.</p>
			<div className="flex items-center gap-2">
				<div className="relative flex-1">
					<Input
						type={visible ? "text" : "password"}
						value={apiKey}
						onChange={(e) => setApiKey(e.target.value)}
						placeholder="API Key가 설정되지 않았습니다"
						className="pr-10 font-mono text-sm"
					/>
					<button
						type="button"
						onClick={() => setVisible(!visible)}
						className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
					>
						{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
					</button>
				</div>
				<Button variant="outline" size="icon" onClick={handleCopy} disabled={!apiKey}>
					<Copy className="h-4 w-4" />
				</Button>
			</div>
			<div className="flex items-center gap-2">
				<Button variant="outline" size="sm" onClick={handleGenerate} disabled={isPending}>
					{isPending ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<RefreshCw className="mr-2 h-4 w-4" />
					)}
					새 Key 생성
				</Button>
				<Button
					size="sm"
					onClick={() => handleSave(apiKey)}
					disabled={isPending || apiKey === (initialKey ?? "")}
				>
					{isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					저장
				</Button>
			</div>
			{apiKey && (
				<p className="text-xs text-muted-foreground">
					CLI 설정:{" "}
					<code className="bg-muted px-1 py-0.5 rounded">
						aoj config --url {publicEnv.NEXT_PUBLIC_APP_URL} --key {visible ? apiKey : "••••••••"}
					</code>
				</p>
			)}
		</div>
	);
}
