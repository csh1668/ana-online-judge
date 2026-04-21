"use client";

import Script from "next/script";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { publicEnv } from "@/lib/env/publicEnv";

type TurnstileApi = {
	render: (el: HTMLElement, opts: Record<string, unknown>) => string;
	reset: (widgetId?: string) => void;
	remove: (widgetId?: string) => void;
	execute: (widgetId?: string) => void;
	getResponse: (widgetId?: string) => string | undefined;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

export type TurnstileWidgetHandle = {
	reset: () => void;
	execute: () => void;
};

type Props = {
	onVerify: (token: string) => void;
	onExpire?: () => void;
	onError?: () => void;
	size?: "normal" | "compact" | "flexible" | "invisible";
	appearance?: "always" | "execute" | "interaction-only";
	theme?: "light" | "dark" | "auto";
	className?: string;
};

export const TurnstileWidget = forwardRef<TurnstileWidgetHandle, Props>(function TurnstileWidget(
	{
		onVerify,
		onExpire,
		onError,
		size = "normal",
		appearance = "always",
		theme = "auto",
		className,
	},
	ref
) {
	const containerRef = useRef<HTMLDivElement>(null);
	const widgetIdRef = useRef<string | null>(null);
	const [apiReady, setApiReady] = useState<boolean>(
		typeof window !== "undefined" && !!window.turnstile
	);

	const onVerifyRef = useRef(onVerify);
	const onExpireRef = useRef(onExpire);
	const onErrorRef = useRef(onError);
	onVerifyRef.current = onVerify;
	onExpireRef.current = onExpire;
	onErrorRef.current = onError;

	useImperativeHandle(
		ref,
		() => ({
			reset: () => {
				const ts = window.turnstile;
				if (ts && widgetIdRef.current) ts.reset(widgetIdRef.current);
			},
			execute: () => {
				const ts = window.turnstile;
				if (ts && widgetIdRef.current) ts.execute(widgetIdRef.current);
			},
		}),
		[]
	);

	// Poll for window.turnstile. onLoad/onReady on next/script can miss in
	// HMR or script-already-loaded scenarios; polling is simple and reliable.
	useEffect(() => {
		if (apiReady) return;
		if (typeof window === "undefined") return;
		let cancelled = false;
		const tick = () => {
			if (cancelled) return;
			if (window.turnstile) {
				setApiReady(true);
				return;
			}
			setTimeout(tick, 100);
		};
		tick();
		return () => {
			cancelled = true;
		};
	}, [apiReady]);

	useEffect(() => {
		if (!apiReady) return;
		if (!containerRef.current) return;
		if (widgetIdRef.current) return;

		const siteKey = publicEnv.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
		if (!siteKey) {
			console.warn("[Turnstile] NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set");
			return;
		}

		const ts = window.turnstile;
		if (!ts) return;

		try {
			widgetIdRef.current = ts.render(containerRef.current, {
				sitekey: siteKey,
				size,
				appearance,
				theme,
				"refresh-expired": "auto",
				callback: (token: string) => onVerifyRef.current?.(token),
				"expired-callback": () => onExpireRef.current?.(),
				"error-callback": () => onErrorRef.current?.(),
			});
		} catch (err) {
			console.error("[Turnstile] render failed:", err);
		}

		return () => {
			const api = window.turnstile;
			if (api && widgetIdRef.current) {
				try {
					api.remove(widgetIdRef.current);
				} catch {
					// ignore
				}
			}
			widgetIdRef.current = null;
		};
	}, [apiReady, size, appearance, theme]);

	return (
		<>
			<Script
				src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
				strategy="afterInteractive"
			/>
			<div ref={containerRef} className={className} />
		</>
	);
});
