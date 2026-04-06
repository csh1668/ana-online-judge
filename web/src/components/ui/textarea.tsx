import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
	return (
		<textarea
			data-slot="textarea"
			className={cn(
				"border-[1.5px] border-input placeholder:text-muted-foreground/60 bg-background flex field-sizing-content min-h-16 w-full rounded-[2px] px-3 py-2 text-sm transition-[box-shadow,border-color] outline-none",
				"focus-visible:border-accent focus-visible:shadow-[3px_3px_0_var(--muted)]",
				"aria-invalid:border-destructive",
				"disabled:cursor-not-allowed disabled:opacity-50",
				className
			)}
			{...props}
		/>
	);
}

export { Textarea };
