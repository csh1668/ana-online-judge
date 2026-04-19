import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TierKind, tierColor, tierGroup, tierLabel, tierShortLabel } from "@/lib/tier";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
	tier: number;
	kind: TierKind;
	size?: "sm" | "md" | "lg";
	className?: string;
	showTooltip?: boolean;
}

const SIZE_CLASSES: Record<NonNullable<TierBadgeProps["size"]>, string> = {
	sm: "h-4 min-w-4 px-1 text-[10px]",
	md: "h-6 min-w-6 px-1.5 text-xs",
	lg: "h-10 min-w-10 px-2 text-base",
};

export function TierBadge({
	tier,
	kind,
	size = "sm",
	className,
	showTooltip = true,
}: TierBadgeProps) {
	const group = tierGroup(tier, kind);
	const short = tierShortLabel(tier, kind);
	const full = tierLabel(tier, kind);
	const color = tierColor(tier, kind);

	const style =
		group === "master"
			? {
					background:
						"linear-gradient(90deg,#ff0062 0%,#ec9a00 25%,#00b4fc 50%,#27e2a4 75%,#ff0062 100%)",
					color: "#fff",
				}
			: { backgroundColor: color, color: "#fff" };

	const badge = (
		<span
			className={cn(
				"inline-flex items-center justify-center rounded font-semibold leading-none select-none",
				SIZE_CLASSES[size],
				(group === "unrated" || group === "not_ratable") && "opacity-70",
				className
			)}
			style={style}
			role="img"
			aria-label={full}
		>
			{short}
		</span>
	);

	if (!showTooltip) return badge;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{badge}</TooltipTrigger>
				<TooltipContent>{full}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
