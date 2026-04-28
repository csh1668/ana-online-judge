export const CONTAINERS = [
	{ name: "aoj-judge", label: "judge" },
	{ name: "aoj-web", label: "web" },
	{ name: "aoj-postgres", label: "postgres" },
	{ name: "aoj-redis", label: "redis" },
	{ name: "aoj-minio", label: "minio" },
] as const;

export type ContainerName = (typeof CONTAINERS)[number]["name"];

const NAME_SET = new Set<string>(CONTAINERS.map((c) => c.name));

export function isWhitelistedContainer(name: string): name is ContainerName {
	return NAME_SET.has(name);
}

export function isProxyConfigured(): boolean {
	return !!process.env.DOCKER_PROXY_URL;
}

function proxyUrl(): string {
	const url = process.env.DOCKER_PROXY_URL;
	if (!url) throw new DockerLogsError("PROXY_NOT_CONFIGURED", "DOCKER_PROXY_URL not set");
	return url.replace(/\/$/, "");
}

export type ContainerState = "running" | "exited" | "unknown";

export interface ContainerInfo {
	name: ContainerName;
	state: ContainerState;
	status: string;
}

export class DockerLogsError extends Error {
	constructor(
		public code: string,
		message: string
	) {
		super(message);
	}
}

interface DockerListItem {
	Names?: string[];
	State?: string;
	Status?: string;
}

export async function listContainers(): Promise<ContainerInfo[]> {
	const filters = encodeURIComponent(JSON.stringify({ name: CONTAINERS.map((c) => c.name) }));
	const res = await fetch(`${proxyUrl()}/containers/json?all=true&filters=${filters}`, {
		cache: "no-store",
	});
	if (!res.ok) {
		throw new DockerLogsError("PROXY_ERROR", `socket-proxy responded ${res.status}`);
	}
	const items = (await res.json()) as DockerListItem[];

	return CONTAINERS.map(({ name }) => {
		// Docker API prefixes container names with `/`
		const found = items.find((it) => it.Names?.some((n) => n === `/${name}`));
		if (!found) {
			return { name, state: "unknown" as ContainerState, status: "not found" };
		}
		const state: ContainerState = found.State === "running" ? "running" : "exited";
		return { name, state, status: found.Status ?? "" };
	});
}

export interface LogChunk {
	stream: "stdout" | "stderr";
	line: string;
}

export interface StreamLogsOptions {
	tail?: number;
	timestamps?: boolean;
}

// 단일 docker 로그 프레임의 페이로드 상한. 16MiB.
// 정상 로그 라인은 KB 단위 — 이보다 크면 손상된 스트림으로 간주하고 종료한다.
const MAX_FRAME_SIZE = 16 * 1024 * 1024;

// ─── Secret scrubbing (defense-in-depth) ─────────────────────────────────────
// 라이브러리 (postgres-js / aws-sdk / ioredis) 의 표준 error 객체에는 자격증명이
// 포함되지 않지만, 향후 코드/의존성 변경으로 secret 이 stdout 에 흘러나올 가능성
// 자체를 차단하기 위해 viewer 출구에서 한 번 더 마스킹한다.
//
// 두 가지 전략을 결합한다:
// 1) URI auth 패턴: 길이 무관하게 즉시 마스킹.
//    예) `postgresql://user:hunter2@db:5432/aoj` → `postgresql://***:***@db:5432/aoj`
// 2) 환경변수 값 매칭: 길이 ≥ 12 인 secret 만 매칭 — 짧은 default 값
//    (`postgres`, `minioadmin` 등) 의 false positive 회피.
const SECRET_ENV_KEYS = [
	"DATABASE_URL",
	"REDIS_URL",
	"NEXTAUTH_SECRET",
	"GOOGLE_CLIENT_SECRET",
	"TURNSTILE_SECRET_KEY",
	"MINIO_SECRET_KEY",
	"DOCKER_PROXY_URL",
] as const;

// `scheme://[user][:password]@host` — user 가 없을 수도 있어 user 부분은 `*`
const URI_AUTH_RE = /(\w+:\/\/)([^:@\s/]*):([^@\s/]+)@/g;
const MIN_SECRET_LENGTH = 12;

let cachedSecretValues: string[] | null = null;

function getSecretValues(): string[] {
	if (cachedSecretValues) return cachedSecretValues;
	const seen = new Set<string>();
	for (const key of SECRET_ENV_KEYS) {
		const v = process.env[key];
		if (v && v.length >= MIN_SECRET_LENGTH) seen.add(v);
	}
	// URI 안의 password 부분만 따로 추출 (전체 URL 보다 짧을 수 있음)
	for (const key of ["DATABASE_URL", "REDIS_URL"]) {
		const url = process.env[key];
		if (!url) continue;
		const m = /^[^:]+:\/\/[^:]+:([^@]+)@/.exec(url);
		if (m && m[1].length >= 4) seen.add(m[1]);
	}
	// 길이 내림차순 — 긴 값 먼저 치환해 부분 매치 회피
	cachedSecretValues = [...seen].sort((a, b) => b.length - a.length);
	return cachedSecretValues;
}

export function scrubSecrets(line: string): string {
	let out = line.replace(URI_AUTH_RE, "$1***:***@");
	for (const v of getSecretValues()) {
		if (out.includes(v)) {
			out = out.split(v).join("***");
		}
	}
	return out;
}

/**
 * Streams docker logs with multiplex demux.
 *
 * Docker logs API frame: 8-byte header [stream_type:u8, 0:u8, 0:u8, 0:u8, size:u32 BE] + payload.
 * stream_type: 1 = stdout, 2 = stderr.
 */
export async function* streamLogs(
	containerName: string,
	opts: StreamLogsOptions,
	signal: AbortSignal
): AsyncGenerator<LogChunk, void, unknown> {
	if (!isWhitelistedContainer(containerName)) {
		throw new DockerLogsError("INVALID_CONTAINER", `container "${containerName}" not allowed`);
	}

	const params = new URLSearchParams({
		follow: "1",
		stdout: "1",
		stderr: "1",
		tail: String(opts.tail ?? 1000),
		timestamps: opts.timestamps ? "1" : "0",
	});
	const url = `${proxyUrl()}/containers/${containerName}/logs?${params}`;

	const res = await fetch(url, { signal });
	if (!res.ok) {
		const code = res.status === 404 ? "CONTAINER_NOT_RUNNING" : "PROXY_ERROR";
		throw new DockerLogsError(code, `socket-proxy responded ${res.status}`);
	}
	if (!res.body) {
		throw new DockerLogsError("PROXY_ERROR", "no response body");
	}

	for await (const chunk of demuxDockerStream(res.body)) {
		yield { stream: chunk.stream, line: scrubSecrets(chunk.line) };
	}
}

export async function* demuxDockerStream(
	body: ReadableStream<Uint8Array>
): AsyncGenerator<LogChunk, void, unknown> {
	const reader = body.getReader();
	const decoder = new TextDecoder("utf-8");
	let buffer = new Uint8Array(0);
	let pending: { stream: "stdout" | "stderr"; partial: string } | null = null;

	const append = (next: Uint8Array) => {
		const merged = new Uint8Array(buffer.length + next.length);
		merged.set(buffer);
		merged.set(next, buffer.length);
		buffer = merged;
	};

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		if (value) append(value);

		while (buffer.length >= 8) {
			const view = new DataView(buffer.buffer, buffer.byteOffset, 8);
			const streamType = view.getUint8(0);
			// u32 BE — DataView 사용으로 JS bitwise 의 int32 강제 변환 우회
			const size = view.getUint32(4, false);
			if (size > MAX_FRAME_SIZE) {
				throw new DockerLogsError(
					"FRAME_TOO_LARGE",
					`docker log frame size ${size} exceeds limit ${MAX_FRAME_SIZE}`
				);
			}
			if (buffer.length < 8 + size) break;

			const stream: "stdout" | "stderr" = streamType === 2 ? "stderr" : "stdout";
			const payload = buffer.subarray(8, 8 + size);
			const text = decoder.decode(payload, { stream: false });
			buffer = buffer.subarray(8 + size);

			// If pending was on a different stream, flush it first.
			if (pending && pending.stream !== stream) {
				yield { stream: pending.stream, line: pending.partial };
				pending = null;
			}

			const combined: string = pending ? pending.partial + text : text;
			pending = null;

			const lines: string[] = combined.split("\n");
			const tail: string = lines.pop() ?? "";
			for (const line of lines) {
				yield { stream, line };
			}
			if (tail.length > 0) {
				pending = { stream, partial: tail };
			}
		}
	}

	if (pending) {
		yield { stream: pending.stream, line: pending.partial };
	}
}
