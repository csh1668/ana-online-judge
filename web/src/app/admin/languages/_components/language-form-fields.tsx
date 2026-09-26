"use client";

import type { ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { BoolKey, LanguageFormValues, TextKey } from "./language-form-values";

export type FieldBinding = {
	values: LanguageFormValues;
	setValue: <K extends keyof LanguageFormValues>(key: K, value: LanguageFormValues[K]) => void;
	disabled: boolean;
};

export function FormSection({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-4 border-t border-border pt-6 first:border-t-0 first:pt-0">
			<h3 className="text-sm font-semibold">{title}</h3>
			{children}
		</section>
	);
}

function Hint({ children }: { children?: ReactNode }) {
	if (!children) return null;
	return <p className="text-xs text-muted-foreground">{children}</p>;
}

type TextFieldProps = {
	b: FieldBinding;
	name: TextKey;
	label: string;
	hint?: ReactNode;
	placeholder?: string;
	required?: boolean;
	type?: "text" | "number";
	step?: string;
	mono?: boolean;
	disabled?: boolean;
};

export function TextField({
	b,
	name,
	label,
	hint,
	placeholder,
	required,
	type = "text",
	step,
	mono,
	disabled,
}: TextFieldProps) {
	const id = `language-${name}`;
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>
				{label}
				{required && " *"}
			</Label>
			<Input
				id={id}
				type={type}
				step={step}
				value={b.values[name]}
				onChange={(e) => b.setValue(name, e.target.value)}
				placeholder={placeholder}
				required={required}
				disabled={b.disabled || disabled}
				className={cn(mono && "font-mono text-xs")}
			/>
			<Hint>{hint}</Hint>
		</div>
	);
}

type TextAreaFieldProps = {
	b: FieldBinding;
	name: TextKey;
	label: string;
	hint?: ReactNode;
	placeholder?: string;
	rows?: number;
};

export function TextAreaField({ b, name, label, hint, placeholder, rows = 6 }: TextAreaFieldProps) {
	const id = `language-${name}`;
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Textarea
				id={id}
				rows={rows}
				value={b.values[name]}
				onChange={(e) => b.setValue(name, e.target.value)}
				placeholder={placeholder}
				disabled={b.disabled}
				spellCheck={false}
				className="font-mono text-xs"
			/>
			<Hint>{hint}</Hint>
		</div>
	);
}

export function SwitchField({
	b,
	name,
	label,
	hint,
}: {
	b: FieldBinding;
	name: BoolKey;
	label: string;
	hint?: ReactNode;
}) {
	const id = `language-${name}`;
	return (
		<div className="space-y-2">
			<div className="flex items-center space-x-2">
				<Switch
					id={id}
					checked={b.values[name]}
					onCheckedChange={(v) => b.setValue(name, v)}
					disabled={b.disabled}
				/>
				<Label htmlFor={id}>{label}</Label>
			</div>
			<Hint>{hint}</Hint>
		</div>
	);
}
