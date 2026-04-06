import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
	"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[2px] text-sm font-semibold transition-[transform,box-shadow,background-color,color] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive",
	{
		variants: {
			variant: {
				default:
					"bg-primary text-primary-foreground border border-primary shadow-md hover:shadow-lg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
				destructive:
					"bg-destructive text-primary-foreground border border-destructive shadow-md hover:shadow-lg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
				outline:
					"bg-background text-foreground border-[1.5px] border-border shadow-md hover:bg-secondary hover:shadow-lg active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
				secondary:
					"bg-secondary text-secondary-foreground border border-border hover:bg-secondary/80",
				ghost: "text-foreground hover:bg-secondary",
				link: "text-accent underline underline-offset-4 hover:text-accent/80",
			},
			size: {
				default: "h-9 px-4 py-2 has-[>svg]:px-3",
				sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
				lg: "h-10 px-6 has-[>svg]:px-4",
				icon: "size-9",
				"icon-sm": "size-8",
				"icon-lg": "size-10",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

function Button({
	className,
	variant,
	size,
	asChild = false,
	...props
}: React.ComponentProps<"button"> &
	VariantProps<typeof buttonVariants> & {
		asChild?: boolean;
	}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="button"
			className={cn(buttonVariants({ variant, size, className }))}
			{...props}
		/>
	);
}

export { Button, buttonVariants };
