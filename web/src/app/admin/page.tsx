import { count, eq } from "drizzle-orm";
import { CheckCircle, FileText, Send, Users } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { problems, submissions, users } from "@/db/schema";

export const metadata: Metadata = {
	title: "관리자 대시보드",
};

export default async function AdminDashboardPage() {
	const [userCount, problemCount, submissionCount, acceptedCount] = await Promise.all([
		db.select({ count: count() }).from(users),
		db.select({ count: count() }).from(problems),
		db.select({ count: count() }).from(submissions),
		db.select({ count: count() }).from(submissions).where(eq(submissions.verdict, "accepted")),
	]);

	const stats = [
		{
			title: "총 사용자",
			value: userCount[0].count,
			icon: Users,
			color: "text-blue-500",
		},
		{
			title: "총 문제",
			value: problemCount[0].count,
			icon: FileText,
			color: "text-emerald-500",
		},
		{
			title: "총 제출",
			value: submissionCount[0].count,
			icon: Send,
			color: "text-amber-500",
		},
		{
			title: "정답 제출",
			value: acceptedCount[0].count,
			icon: CheckCircle,
			color: "text-green-500",
		},
	];

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-3xl font-bold">대시보드</h1>
				<p className="text-muted-foreground mt-2">AOJ 관리자 대시보드입니다.</p>
			</div>

			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				{stats.map((stat) => (
					<Card key={stat.title}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
							<stat.icon className={`h-5 w-5 ${stat.color}`} />
						</CardHeader>
						<CardContent>
							<div className="text-3xl font-bold">{stat.value}</div>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}
