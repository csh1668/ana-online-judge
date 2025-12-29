"use client";

import { Loader2, Search, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addParticipantToContest, searchUsers } from "@/actions/contests";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddParticipantDialogProps {
	contestId: number;
}

export function AddParticipantDialog({ contestId }: AddParticipantDialogProps) {
	const router = useRouter();
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [searchResults, setSearchResults] = useState<
		Array<{ id: number; username: string; name: string }>
	>([]);
	const [isSearching, setIsSearching] = useState(false);
	const [isAdding, startAdding] = useTransition();
	const [error, setError] = useState<string | null>(null);

	const handleSearch = async (query: string) => {
		setSearchQuery(query);
		if (query.trim().length < 2) {
			setSearchResults([]);
			return;
		}

		setIsSearching(true);
		setError(null);
		try {
			const results = await searchUsers(query);
			setSearchResults(results);
		} catch (err) {
			setError(err instanceof Error ? err.message : "검색 중 오류가 발생했습니다");
			setSearchResults([]);
		} finally {
			setIsSearching(false);
		}
	};

	const handleAddParticipant = async (userId: number, username: string) => {
		startAdding(async () => {
			setError(null);
			try {
				await addParticipantToContest(contestId, userId);
				setIsOpen(false);
				setSearchQuery("");
				setSearchResults([]);
				router.refresh();
			} catch (err) {
				setError(err instanceof Error ? err.message : "참가자 추가 중 오류가 발생했습니다");
			}
		});
	};

	return (
		<Dialog open={isOpen} onOpenChange={setIsOpen}>
			<DialogTrigger asChild>
				<Button>
					<UserPlus className="mr-2 h-4 w-4" />
					참가자 추가
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>참가자 추가</DialogTitle>
					<DialogDescription>
						사용자 아이디나 이름을 검색하여 참가자를 추가하세요.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="search">사용자 검색</Label>
						<div className="relative">
							<Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
							<Input
								id="search"
								placeholder="아이디 또는 이름으로 검색..."
								value={searchQuery}
								onChange={(e) => handleSearch(e.target.value)}
								className="pl-9"
								disabled={isAdding}
							/>
						</div>
					</div>

					{error && (
						<div className="bg-destructive/10 text-destructive px-4 py-3 rounded-md text-sm">
							{error}
						</div>
					)}

					{isSearching && (
						<div className="flex items-center justify-center py-8 text-muted-foreground">
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							검색 중...
						</div>
					)}

					{!isSearching &&
						searchQuery.trim().length >= 2 &&
						searchResults.length === 0 &&
						!error && (
							<div className="text-center py-8 text-muted-foreground text-sm">
								검색 결과가 없습니다.
							</div>
						)}

					{!isSearching && searchResults.length > 0 && (
						<div className="max-h-[300px] overflow-y-auto rounded-md border">
							<div className="divide-y">
								{searchResults.map((user) => (
									<div
										key={user.id}
										className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
									>
										<div>
											<div className="font-medium">{user.username}</div>
											<div className="text-sm text-muted-foreground">{user.name}</div>
										</div>
										<Button
											size="sm"
											onClick={() => handleAddParticipant(user.id, user.username)}
											disabled={isAdding}
										>
											{isAdding ? (
												<>
													<Loader2 className="mr-2 h-4 w-4 animate-spin" />
													추가 중...
												</>
											) : (
												"추가"
											)}
										</Button>
									</div>
								))}
							</div>
						</div>
					)}

					{searchQuery.trim().length < 2 && (
						<div className="text-center py-8 text-muted-foreground text-sm">
							최소 2자 이상 입력해주세요.
						</div>
					)}
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setIsOpen(false)} disabled={isAdding}>
						닫기
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
