import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "standalone",
	env: {
		NEXT_PUBLIC_BUILD_TIME: new Date().toISOString(),
	},
	outputFileTracingIncludes: {
		"**/*": ["./src/lib/workshop/bundled/**/*"],
	},
	experimental: {
		serverActions: {
			// Workshop testcase single-file upload is capped at 50 MB;
			// bulk ZIP uploads may aggregate many such files. Leave headroom.
			bodySizeLimit: "60mb",
		},
		// Route Handler multipart body cap (default 10MB). Admin bulk testcase
		// upload aggregates hundreds of MB in a single FormData POST.
		proxyClientMaxBodySize: "512mb",
	},
};

export default nextConfig;
