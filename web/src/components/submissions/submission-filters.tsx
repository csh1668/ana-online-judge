"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

export function SubmissionFilters() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [username, setUsername] = useState(searchParams.get("username") || "");
	const [verdict, setVerdict] = useState(searchParams.get("verdict") || "all");
	const [language, setLanguage] = useState(searchParams.get("language") || "all");

	const updateParams = (key: string, value: string) => {
		const params = new URLSearchParams(searchParams);
		if (value && value !== "all") {
			params.set(key, value);
		} else {
			params.delete(key);
		}
		params.set("page", "1");
		router.replace(`?${params.toString()}`);
	};

	// Debounce username
	useEffect(() => {
		const timer = setTimeout(() => {
			const currentUsername = searchParams.get("username") || "";
			if (username !== currentUsername) {
				const params = new URLSearchParams(searchParams);
				if (username) {
					params.set("username", username);
				} else {
					params.delete("username");
				}
				params.set("page", "1");
				router.replace(`?${params.toString()}`);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [username, router, searchParams]);

	return (
		<div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
			<Input
				placeholder="사용자명 검색..."
				value={username}
				onChange={(e) => setUsername(e.target.value)}
				className="w-full sm:w-[150px]"
			/>
			<Select
				value={verdict}
				onValueChange={(val) => {
					setVerdict(val);
					updateParams("verdict", val);
				}}
			>
				<SelectTrigger className="w-full sm:w-[150px]">
					<SelectValue placeholder="결과" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">모든 결과</SelectItem>
					<SelectItem value="accepted">Accepted</SelectItem>
					<SelectItem value="wrong_answer">Wrong Answer</SelectItem>
					<SelectItem value="time_limit_exceeded">Time Limit</SelectItem>
					<SelectItem value="memory_limit_exceeded">Memory Limit</SelectItem>
					<SelectItem value="runtime_error">Runtime Error</SelectItem>
					<SelectItem value="compile_error">Compile Error</SelectItem>
				</SelectContent>
			</Select>
			<Select
				value={language}
				onValueChange={(val) => {
					setLanguage(val);
					updateParams("language", val);
				}}
			>
				<SelectTrigger className="w-full sm:w-[130px]">
					<SelectValue placeholder="언어" />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="all">모든 언어</SelectItem>
					<SelectItem value="c">C</SelectItem>
					<SelectItem value="cpp">C++</SelectItem>
					<SelectItem value="python">Python</SelectItem>
					<SelectItem value="java">Java</SelectItem>
					<SelectItem value="javascript">JavaScript</SelectItem>
					<SelectItem value="text">Text</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
