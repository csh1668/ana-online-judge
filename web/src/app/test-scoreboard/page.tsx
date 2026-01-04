"use client";

import { useState } from "react";
import { Spotboard } from "@/components/contests/spotboard";
import type { SpotboardConfig } from "@/lib/spotboard/types";

export default function TestScoreboardPage() {
	const [isAwardMode, setIsAwardMode] = useState(false);

	// 더미 데이터 생성
	const dummyConfig: SpotboardConfig = {
		contestTitle: "Test Contest 2025",
		systemName: "Ana Online Judge",
		systemVersion: "v1.0",
		problems: [
			{ id: 0, title: "A", problemType: "icpc" },
			{ id: 1, title: "B", problemType: "icpc" },
			{ id: 2, title: "C", problemType: "icpc" },
			{ id: 3, title: "D", problemType: "anigma" },
			{ id: 4, title: "E", problemType: "icpc" },
		],
		teams: [
			{ id: 1, name: "ana", group: "Seoul National University" },
			{ id: 2, name: "202102659", group: "KAIST" },
			{ id: 3, name: "AlphaTeam", group: "Yonsei University" },
			{ id: 4, name: "BetaSquad", group: "POSTECH" },
			{ id: 5, name: "GammaForce", group: "Hanyang University" },
			{ id: 6, name: "DeltaCoders", group: "Korea University" },
			{ id: 7, name: "EpsilonDev", group: "Sungkyunkwan University" },
			{ id: 8, name: "ZetaHackers", group: "Sogang University" },
			{ id: 9, name: "EtaProgrammers", group: "Ewha Womans University" },
			{ id: 10, name: "ThetaBytes", group: "Kyung Hee University" },
		],
		runs: [
			// Team 1 (ana) - 3 solved
			{ id: 1, teamId: 1, problemId: 0, time: 29 * 60, result: "Yes", problemType: "icpc" },
			{ id: 2, teamId: 1, problemId: 1, time: 45 * 60, result: "Yes", problemType: "icpc" },
			{ id: 3, teamId: 1, problemId: 2, time: 15 * 60, result: "No", problemType: "icpc" },
			{ id: 4, teamId: 1, problemId: 2, time: 30 * 60, result: "Yes", problemType: "icpc" },
			{
				id: 5,
				teamId: 1,
				problemId: 3,
				time: 60 * 60,
				result: "Yes",
				score: 85,
				problemType: "anigma",
				anigmaDetails: { task1Score: 50, task2Score: 35, editDistance: 15 },
			},

			// Team 2 (202102659) - 2 solved
			{ id: 6, teamId: 2, problemId: 0, time: 10 * 60, result: "Yes", problemType: "icpc" },
			{ id: 7, teamId: 2, problemId: 1, time: 25 * 60, result: "No", problemType: "icpc" },
			{ id: 8, teamId: 2, problemId: 1, time: 40 * 60, result: "Yes", problemType: "icpc" },
			{ id: 9, teamId: 2, problemId: 2, time: 50 * 60, result: "No", problemType: "icpc" },
			{
				id: 10,
				teamId: 2,
				problemId: 3,
				time: 70 * 60,
				result: "Yes",
				score: 60,
				problemType: "anigma",
				anigmaDetails: { task1Score: 40, task2Score: 20, editDistance: 40 },
			},

			// Team 3 (AlphaTeam) - 4 solved
			{ id: 11, teamId: 3, problemId: 0, time: 5 * 60, result: "Yes", problemType: "icpc" },
			{ id: 12, teamId: 3, problemId: 1, time: 20 * 60, result: "Yes", problemType: "icpc" },
			{ id: 13, teamId: 3, problemId: 2, time: 35 * 60, result: "Yes", problemType: "icpc" },
			{ id: 14, teamId: 3, problemId: 4, time: 55 * 60, result: "Yes", problemType: "icpc" },
			{
				id: 15,
				teamId: 3,
				problemId: 3,
				time: 80 * 60,
				result: "Yes",
				score: 95,
				problemType: "anigma",
				anigmaDetails: { task1Score: 50, task2Score: 45, editDistance: 5 },
			},

			// Team 4 (BetaSquad) - 2 solved
			{ id: 16, teamId: 4, problemId: 0, time: 15 * 60, result: "Yes", problemType: "icpc" },
			{ id: 17, teamId: 4, problemId: 1, time: 35 * 60, result: "No", problemType: "icpc" },
			{ id: 18, teamId: 4, problemId: 1, time: 50 * 60, result: "No", problemType: "icpc" },
			{ id: 19, teamId: 4, problemId: 2, time: 70 * 60, result: "Yes", problemType: "icpc" },

			// Team 5 (GammaForce) - 3 solved
			{ id: 20, teamId: 5, problemId: 0, time: 8 * 60, result: "Yes", problemType: "icpc" },
			{ id: 21, teamId: 5, problemId: 1, time: 22 * 60, result: "Yes", problemType: "icpc" },
			{
				id: 22,
				teamId: 5,
				problemId: 3,
				time: 65 * 60,
				result: "Yes",
				score: 75,
				problemType: "anigma",
				anigmaDetails: { task1Score: 45, task2Score: 30, editDistance: 25 },
			},
			{ id: 23, teamId: 5, problemId: 4, time: 90 * 60, result: "No", problemType: "icpc" },

			// Team 6 (DeltaCoders) - 1 solved
			{ id: 24, teamId: 6, problemId: 0, time: 30 * 60, result: "Yes", problemType: "icpc" },
			{ id: 25, teamId: 6, problemId: 1, time: 45 * 60, result: "No", problemType: "icpc" },
			{ id: 26, teamId: 6, problemId: 2, time: 60 * 60, result: "No", problemType: "icpc" },

			// Team 7 (EpsilonDev) - 3 solved
			{ id: 27, teamId: 7, problemId: 0, time: 12 * 60, result: "Yes", problemType: "icpc" },
			{ id: 28, teamId: 7, problemId: 1, time: 28 * 60, result: "Yes", problemType: "icpc" },
			{ id: 29, teamId: 7, problemId: 2, time: 48 * 60, result: "Yes", problemType: "icpc" },
			{
				id: 30,
				teamId: 7,
				problemId: 3,
				time: 75 * 60,
				result: "Yes",
				score: 50,
				problemType: "anigma",
				anigmaDetails: { task1Score: 30, task2Score: 20, editDistance: 50 },
			},

			// Team 8 (ZetaHackers) - 2 solved
			{ id: 31, teamId: 8, problemId: 0, time: 18 * 60, result: "Yes", problemType: "icpc" },
			{ id: 32, teamId: 8, problemId: 1, time: 38 * 60, result: "No", problemType: "icpc" },
			{ id: 33, teamId: 8, problemId: 2, time: 55 * 60, result: "Yes", problemType: "icpc" },

			// Team 9 (EtaProgrammers) - 1 solved, with multiple failed attempts after freeze
			{ id: 34, teamId: 9, problemId: 0, time: 25 * 60, result: "Yes", problemType: "icpc" },
			// After freeze: multiple failures then success (for animation testing)
			{ id: 35, teamId: 9, problemId: 1, time: 125 * 60, result: "No", problemType: "icpc" },
			{ id: 36, teamId: 9, problemId: 1, time: 135 * 60, result: "No", problemType: "icpc" },
			{ id: 37, teamId: 9, problemId: 1, time: 145 * 60, result: "No", problemType: "icpc" },
			{ id: 38, teamId: 9, problemId: 1, time: 155 * 60, result: "Yes", problemType: "icpc" },

			// Team 10 (ThetaBytes) - 2 solved
			{ id: 37, teamId: 10, problemId: 0, time: 20 * 60, result: "Yes", problemType: "icpc" },
			{ id: 38, teamId: 10, problemId: 2, time: 40 * 60, result: "Yes", problemType: "icpc" },
			{ id: 39, teamId: 10, problemId: 1, time: 65 * 60, result: "No", problemType: "icpc" },

			// Frozen runs (after 100 minutes) for award mode testing
			{ id: 40, teamId: 1, problemId: 4, time: 110 * 60, result: "Yes", problemType: "icpc" },
			{ id: 41, teamId: 2, problemId: 2, time: 105 * 60, result: "No", problemType: "icpc" },
			{ id: 42, teamId: 2, problemId: 2, time: 115 * 60, result: "Yes", problemType: "icpc" },
			{
				id: 43,
				teamId: 3,
				problemId: 3,
				time: 120 * 60,
				result: "Yes",
				score: 100,
				problemType: "anigma",
			},
			{
				id: 44,
				teamId: 4,
				problemId: 3,
				time: 125 * 60,
				result: "Yes",
				score: 80,
				problemType: "anigma",
			},
			{ id: 45, teamId: 5, problemId: 4, time: 130 * 60, result: "Yes", problemType: "icpc" },
		],
		freezeTime: 100 * 60, // Freeze at 100 minutes (6000 seconds) for award mode
	};

	return (
		<div className="min-h-screen bg-white">
			{/* Control Panel */}
			<div className="sticky top-0 z-50 bg-gray-100 border-b border-gray-300 p-4">
				<div className="max-w-7xl mx-auto flex items-center justify-between">
					<h1 className="text-2xl font-bold">Spotboard 테스트 페이지</h1>
					<div className="flex items-center gap-4">
						<button
							type="button"
							onClick={() => setIsAwardMode(!isAwardMode)}
							className={`px-4 py-2 rounded font-semibold transition-colors ${
								isAwardMode
									? "bg-blue-600 text-white hover:bg-blue-700"
									: "bg-gray-300 text-gray-700 hover:bg-gray-400"
							}`}
						>
							{isAwardMode ? "어워드 모드 ON" : "일반 모드"}
						</button>
						{isAwardMode && (
							<div className="text-sm text-gray-600 bg-yellow-100 px-3 py-2 rounded border border-yellow-300">
								<strong>화살표(→) 또는 Enter</strong>를 눌러서 진행
							</div>
						)}
					</div>
				</div>
			</div>

			{/* Spotboard */}
			<div className="w-full">
				<Spotboard config={dummyConfig} isAwardMode={isAwardMode} />
			</div>
		</div>
	);
}
