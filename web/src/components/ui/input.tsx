import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"file:text-foreground placeholder:text-muted-foreground/60 selection:bg-accent selection:text-accent-foreground border-[1.5px] border-input h-9 w-full min-w-0 rounded-[2px] bg-background px-3 py-1 text-sm transition-[box-shadow,border-color] outline-none",
				"file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"focus-visible:border-accent focus-visible:shadow-[3px_3px_0_var(--muted)]",
				"aria-invalid:border-destructive",
				className
			)}
			{...props}
		/>
	);
}

export { Input };
