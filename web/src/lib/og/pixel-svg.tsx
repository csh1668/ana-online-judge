import type { ReactElement } from "react";
import { plus, type ShapeTest } from "./pixel-shapes";

export type PixelLayer = { test: ShapeTest; color: string };
/** layers는 순서대로 칠하며 뒤 레이어가 앞을 덮는다. outline이 있으면 실루엣 바깥 1칸을 그 색으로 두른다. */
export type PixelObject = { layers: PixelLayer[]; outline?: string };

type Cells = (string | null)[];
type GridSize = { cols: number; rows: number; cell: number };

function paintObject(obj: PixelObject, { cols, rows, cell }: GridSize): Cells {
	const fill: Cells = new Array(cols * rows).fill(null);
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const [x, y] = [(c + 0.5) * cell, (r + 0.5) * cell];
			for (const layer of obj.layers) {
				if (layer.test(x, y)) fill[r * cols + c] = layer.color;
			}
		}
	}
	return fill;
}

function paintOutline(fill: Cells, color: string, { cols, rows }: GridSize, grid: Cells) {
	const filled = (r: number, c: number) =>
		r >= 0 && r < rows && c >= 0 && c < cols && fill[r * cols + c] !== null;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			if (fill[r * cols + c] !== null) continue;
			if (filled(r - 1, c) || filled(r + 1, c) || filled(r, c - 1) || filled(r, c + 1)) {
				grid[r * cols + c] = color;
			}
		}
	}
}

/** 같은 색이 가로로 이어진 칸을 rect 하나로 합쳐 SVG 요소 수를 줄인다. */
function toRects(grid: Cells, { cols, rows, cell }: GridSize): ReactElement[] {
	const rects: ReactElement[] = [];
	for (let r = 0; r < rows; r++) {
		let c = 0;
		while (c < cols) {
			const color = grid[r * cols + c];
			let end = c;
			while (end + 1 < cols && grid[r * cols + end + 1] === color) end++;
			if (color) {
				rects.push(
					<rect
						key={`${r}-${c}`}
						x={c * cell}
						y={r * cell}
						width={(end - c + 1) * cell}
						height={cell}
						fill={color}
					/>
				);
			}
			c = end + 1;
		}
	}
	return rects;
}

/** 도형 목록을 cell 크기 격자에 래스터화한 픽셀 아트 SVG (그림 영역 좌상단 기준) */
export function PixelArt({
	width,
	height,
	cell,
	objects,
}: {
	width: number;
	height: number;
	cell: number;
	objects: PixelObject[];
}) {
	const size: GridSize = { cols: Math.ceil(width / cell), rows: Math.ceil(height / cell), cell };
	const grid: Cells = new Array(size.cols * size.rows).fill(null);
	for (const obj of objects) {
		const fill = paintObject(obj, size);
		if (obj.outline) paintOutline(fill, obj.outline, size, grid);
		fill.forEach((color, i) => {
			if (color) grid[i] = color;
		});
	}
	const [w, h] = [size.cols * cell, size.rows * cell];
	return (
		<svg
			aria-hidden="true"
			width={w}
			height={h}
			viewBox={`0 0 ${w} ${h}`}
			style={{ position: "absolute", left: 0, top: 0 }}
		>
			{toRects(grid, size)}
		</svg>
	);
}

/** 문자열 격자로 정의한 작은 아이콘 ("#" 등 palette 키만 칠한다) */
export function Sprite({
	rows,
	palette,
	cell,
}: {
	rows: string[];
	palette: Record<string, string>;
	cell: number;
}) {
	const [w, h] = [rows[0].length * cell, rows.length * cell];
	const cells = rows.flatMap((line, r) =>
		[...line].map((ch, c) => ({ id: `${r}-${c}`, x: c * cell, y: r * cell, color: palette[ch] }))
	);
	return (
		<svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
			{cells
				.filter((px) => px.color)
				.map((px) => (
					<rect key={px.id} x={px.x} y={px.y} width={cell} height={cell} fill={px.color} />
				))}
		</svg>
	);
}

/** 십자 반짝이 장식 (6px 격자에서 모양이 유지되는 최소 크기) */
export const sparkle = (x: number, y: number, color: string): PixelObject => ({
	layers: [{ test: plus(x, y, 9, 3), color }],
});
