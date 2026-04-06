import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import type { Verdict } from "@/db/schema";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
	"inline-flex items-center justify-center rounded-sm border-[1.5px] px-2 py-0.5 text-xs font-semibold w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive transition-colors overflow-hidden",
	{
		variants: {
			variant: {
				default: "border-primary bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
				secondary:
					"border-border bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
				destructive:
					"border-[var(--verdict-wrong)] bg-[var(--verdict-wrong-bg)] text-[var(--verdict-wrong)] [a&]:hover:opacity-90",
				outline: "border-border bg-transparent text-foreground [a&]:hover:bg-secondary",
				verdict: "",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	}
);

export const VERDICT_LABELS: Record<Verdict, { label: string; key: string }> = {
	pending: { label: "대기 중", key: "pending" },
	judging: { label: "채점 중", key: "pending" },
	accepted: { label: "맞았습니다", key: "accepted" },
	wrong_answer: { label: "틀렸습니다", key: "wrong" },
	time_limit_exceeded: { label: "시간 초과", key: "tle" },
	memory_limit_exceeded: { label: "메모리 초과", key: "mle" },
	runtime_error: { label: "런타임 에러", key: "runtime" },
	compile_error: { label: "컴파일 에러", key: "compile" },
	system_error: { label: "시스템 에러", key: "wrong" },
	partial: { label: "부분 점수", key: "partial" },
	skipped: { label: "건너뜀", key: "skipped" },
	presentation_error: { label: "출력 형식 에러", key: "presentation" },
	fail: { label: "실패", key: "wrong" },
};

type BadgeProps = React.ComponentProps<"span"> &
	VariantProps<typeof badgeVariants> & {
		asChild?: boolean;
		verdict?: Verdict;
	};

function Badge({
	className,
	variant,
	asChild = false,
	verdict,
	children,
	style,
	...props
}: BadgeProps) {
	const Comp = asChild ? Slot : "span";

	if (variant === "verdict" && verdict) {
		const key = VERDICT_LABELS[verdict]?.key ?? "skipped";
		const verdictStyle: React.CSSProperties = {
			color: `var(--verdict-${key})`,
			backgroundColor: `var(--verdict-${key}-bg)`,
			borderColor: `var(--verdict-${key})`,
			...style,
		};
		return (
			<Comp
				data-slot="badge"
				data-verdict={verdict}
				className={cn(badgeVariants({ variant }), className)}
				style={verdictStyle}
				{...props}
			>
				{children ?? VERDICT_LABELS[verdict]?.label ?? verdict}
			</Comp>
		);
	}

	return (
		<Comp
			data-slot="badge"
			className={cn(badgeVariants({ variant }), className)}
			style={style}
			{...props}
		>
			{children}
		</Comp>
	);
}

export { Badge, badgeVariants };
