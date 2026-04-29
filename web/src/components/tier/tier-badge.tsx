import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TierKind, tierIconFile, tierLabel } from "@/lib/tier";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
	tier: number;
	kind: TierKind;
	size?: "sm" | "md" | "lg";
	className?: string;
	showTooltip?: boolean;
}

const SIZE_PX: Record<NonNullable<TierBadgeProps["size"]>, number> = {
	sm: 16,
	md: 24,
	lg: 32,
};

export function TierBadge({
	tier,
	kind,
	size = "sm",
	className,
	showTooltip = true,
}: TierBadgeProps) {
	const file = tierIconFile(tier, kind);
	const full = tierLabel(tier, kind);
	const px = SIZE_PX[size];

	const icon = (
		<img
			src={`/tier-icons/${file}.svg`}
			alt={full}
			width={px}
			height={px}
			className={cn("inline-block select-none", size !== "lg" && className)}
			draggable={false}
		/>
	);

	const node =
		size === "lg" ? (
			<span className={cn("inline-flex items-center gap-2", className)}>
				{icon}
				<span className="text-sm font-semibold">{full}</span>
			</span>
		) : (
			icon
		);

	if (!showTooltip) return node;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{node}</TooltipTrigger>
				<TooltipContent>{full}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
