"use client";

import { formatDate } from "@/lib/contest-utils";

interface ContestTimeProps {
    date: Date | string;
}

export function ContestTime({ date }: ContestTimeProps) {
    // Handle both Date object and ISO string (from server component serialization)
    const dateObj = typeof date === "string" ? new Date(date) : date;
    return <>{formatDate(dateObj)}</>;
}

