import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type TierKind, tierIconFile, tierLabel } from "@/lib/tier";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
	tier: number;
	kind: TierKind;
	size?: "sm" | "md";
	className?: string;
	showTooltip?: boolean;
}

const SIZE_PX: Record<NonNullable<TierBadgeProps["size"]>, number> = {
	sm: 16,
	md: 24,
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
		// biome-ignore lint/performance/noImgElement: SVG 정적 자산이라 next/image 최적화 효과 없음
		<img
			src={`/tier-icons/${file}.svg`}
			alt={full}
			width={px}
			height={px}
			className={cn("inline-block select-none", className)}
			draggable={false}
		/>
	);

	if (!showTooltip) return icon;

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>{icon}</TooltipTrigger>
				<TooltipContent>{full}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
