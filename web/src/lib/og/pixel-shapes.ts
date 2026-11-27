/** 픽셀 래스터화용 도형 판정 함수. (x, y)는 칸 중심의 px 좌표다. */
export type ShapeTest = (x: number, y: number) => boolean;

export const circle =
	(cx: number, cy: number, r: number): ShapeTest =>
	(x, y) =>
		(x - cx) ** 2 + (y - cy) ** 2 <= r * r;

export const ellipse =
	(cx: number, cy: number, rx: number, ry: number): ShapeTest =>
	(x, y) =>
		((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;

export const rect =
	(x0: number, y0: number, x1: number, y1: number): ShapeTest =>
	(x, y) =>
		x >= x0 && x <= x1 && y >= y0 && y <= y1;

export const anyOf =
	(...tests: ShapeTest[]): ShapeTest =>
	(x, y) =>
		tests.some((test) => test(x, y));

/** 로컬 좌표계 도형을 (cx, cy) 기준으로 angle(rad)만큼 회전시킨다. */
export function rotated(cx: number, cy: number, angle: number, local: ShapeTest): ShapeTest {
	const [cos, sin] = [Math.cos(angle), Math.sin(angle)];
	return (x, y) => {
		const [dx, dy] = [x - cx, y - cy];
		return local(dx * cos + dy * sin, -dx * sin + dy * cos);
	};
}

/** 두께 2*halfWidth인 선분 */
export function segment(
	x0: number,
	y0: number,
	x1: number,
	y1: number,
	halfWidth: number
): ShapeTest {
	const [vx, vy] = [x1 - x0, y1 - y0];
	const lengthSq = vx * vx + vy * vy;
	return (x, y) => {
		const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / lengthSq));
		return (x - x0 - t * vx) ** 2 + (y - y0 - t * vy) ** 2 <= halfWidth * halfWidth;
	};
}

/** 위가 넓고 아래가 좁아지는 풍선 모양 */
export const egg =
	(cx: number, cy: number, rx: number, ry: number): ShapeTest =>
	(x, y) => {
		const dy = y - cy;
		const ryy = dy > 0 ? ry * 1.1 : ry;
		const rxx = dy > 0 ? rx * (1 - 0.28 * (dy / ryy) ** 2) : rx;
		return ((x - cx) / rxx) ** 2 + (dy / ryy) ** 2 <= 1;
	};

export const plus = (cx: number, cy: number, arm: number, width: number): ShapeTest =>
	anyOf(
		rect(cx - arm, cy - width, cx + arm, cy + width),
		rect(cx - width, cy - arm, cx + width, cy + arm)
	);
