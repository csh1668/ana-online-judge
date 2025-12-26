import type { Metadata } from "next";
import { ContestForm } from "@/components/contests/contest-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
	title: "새 대회 만들기",
	description: "새로운 대회를 생성합니다",
};

export default function NewContestPage() {
	return (
		<div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">새 대회 만들기</CardTitle>
				</CardHeader>
				<CardContent>
					<ContestForm />
				</CardContent>
			</Card>
		</div>
	);
}
