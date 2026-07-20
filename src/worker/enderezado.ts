/**
 * Enderezado por perspectiva: convierte el cuadrilátero de las esquinas detectadas
 * en un rectángulo recto resolviendo la homografía y remuestreando la imagen.
 */
import type { Punto, Esquinas, Rectangulo } from '../tipos';
import { Distancia } from './geometria';

// Proporción del canvas de previsualización (1000x625), a la que se ajusta el DNI
const ProporcionCanvas = 1.6;

/** Resolver un sistema de ecuaciones lineales por eliminación de Gauss-Jordan con pivote parcial */
function ResolverSistema(A: number[][], b: number[]): number[] | null {
	const n = b.length;
	for (let col = 0; col < n; col++) {
		let maxFila = col;
		for (let f = col + 1; f < n; f++) {
			if (Math.abs(A[f][col]) > Math.abs(A[maxFila][col]))
				maxFila = f;
		}
		[A[col], A[maxFila]] = [A[maxFila], A[col]];
		[b[col], b[maxFila]] = [b[maxFila], b[col]];

		const pivote = A[col][col];
		if (Math.abs(pivote) < 1e-10)
			return null;

		for (let f = 0; f < n; f++) {
			if (f == col)
				continue;
			const factor = A[f][col] / pivote;
			for (let c = col; c < n; c++)
				A[f][c] -= factor * A[col][c];
			b[f] -= factor * b[col];
		}
	}
	return b.map((valor, i) => valor / A[i][i]);
}

/** Calcular la transformación de perspectiva (homografía) que lleva cada punto de destino a su origen */
function ResolverHomografia(destino: Punto[], origen: Punto[]): number[] | null {
	const A: number[][] = [];
	const b: number[] = [];
	for (let i = 0; i < 4; i++) {
		const { x: u, y: v } = destino[i];
		const { x, y } = origen[i];
		A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
		b.push(x);
		A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
		b.push(y);
	}
	return ResolverSistema(A, b);
}

/**
 * Enderezar la imagen con una corrección de perspectiva que convierte el cuadrilátero
 * de las esquinas detectadas en un rectángulo recto con la proporción del canvas.
 * Devuelve los nuevos píxeles y el rectángulo donde queda la tarjeta, o null si falla.
 */
export function EnderezarTarjeta(imgPixels: ImageData, esquinas: Esquinas): { imgPixels: ImageData; tarjeta: Rectangulo } | null {
	const w = imgPixels.width;
	const h = imgPixels.height;
	const [tl, tr, br, bl] = esquinas;

	// rectángulo destino: la anchura media de la tarjeta detectada con la proporción del canvas,
	// centrado donde está la tarjeta pero sin salirse de la imagen
	let wDest = (Distancia(tl, tr) + Distancia(bl, br)) / 2;
	wDest = Math.min(wDest, w * 0.98, h * ProporcionCanvas * 0.98);
	if (wDest < 10)
		return null;
	const hDest = wDest / ProporcionCanvas;

	let cx = (tl.x + tr.x + br.x + bl.x) / 4;
	let cy = (tl.y + tr.y + br.y + bl.y) / 4;
	cx = Math.min(Math.max(cx, wDest / 2), w - wDest / 2);
	cy = Math.min(Math.max(cy, hDest / 2), h - hDest / 2);

	const destino: Punto[] = [
		{ x: cx - wDest / 2, y: cy - hDest / 2 },
		{ x: cx + wDest / 2, y: cy - hDest / 2 },
		{ x: cx + wDest / 2, y: cy + hDest / 2 },
		{ x: cx - wDest / 2, y: cy + hDest / 2 },
	];

	const homografia = ResolverHomografia(destino, esquinas);
	if (!homografia)
		return null;

	const [a, b, c, d, e, f, g, k] = homografia;

	// recorrer cada píxel del destino buscando su origen con la homografía, e interpolar el valor
	const salida = new ImageData(w, h);
	const sdata = salida.data;
	const ddata = imgPixels.data;
	let i = 0;
	for (let v = 0; v < h; v++) {
		for (let u = 0; u < w; u++, i += 4) {
			const den = g * u + k * v + 1;
			const x = (a * u + b * v + c) / den;
			const y = (d * u + e * v + f) / den;

			let valor = 255;
			if (x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1) {
				const x0 = x | 0;
				const y0 = y | 0;
				const x1 = Math.min(x0 + 1, w - 1);
				const y1 = Math.min(y0 + 1, h - 1);
				const fx = x - x0;
				const fy = y - y0;
				const v00 = ddata[(y0 * w + x0) * 4];
				const v10 = ddata[(y0 * w + x1) * 4];
				const v01 = ddata[(y1 * w + x0) * 4];
				const v11 = ddata[(y1 * w + x1) * 4];
				valor = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
			}

			sdata[i] = sdata[i + 1] = sdata[i + 2] = valor;
			sdata[i + 3] = 255;
		}
	}

	return {
		imgPixels: salida,
		tarjeta: { x: destino[0].x, y: destino[0].y, w: wDest, h: hDest },
	};
}
