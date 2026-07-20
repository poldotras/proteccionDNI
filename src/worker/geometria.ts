/** Utilidades de geometría y estadística usadas por la detección */
import type { Punto, Esquinas } from '../tipos';

export function Mediana(muestras: number[]): number {
	muestras.sort((a, b) => a - b);
	return muestras[muestras.length >> 1];
}

export function Distancia(p1: Punto, p2: Punto): number {
	return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}

/** Ordenar 4 puntos en sentido horario empezando por el de arriba a la izquierda */
export function OrdenarEsquinas(puntos: Punto[]): Esquinas {
	const cx = (puntos[0].x + puntos[1].x + puntos[2].x + puntos[3].x) / 4;
	const cy = (puntos[0].y + puntos[1].y + puntos[2].y + puntos[3].y) / 4;
	const ordenadas = puntos.slice().sort((p, q) => Math.atan2(p.y - cy, p.x - cx) - Math.atan2(q.y - cy, q.x - cx));
	let inicio = 0;
	for (let i = 1; i < 4; i++) {
		if (ordenadas[i].x + ordenadas[i].y < ordenadas[inicio].x + ordenadas[inicio].y)
			inicio = i;
	}
	return [
		ordenadas[inicio % 4],
		ordenadas[(inicio + 1) % 4],
		ordenadas[(inicio + 2) % 4],
		ordenadas[(inicio + 3) % 4],
	];
}

export function AreaCuadrilatero(esquinas: Punto[]): number {
	let area = 0;
	for (let i = 0; i < 4; i++) {
		const a = esquinas[i];
		const b = esquinas[(i + 1) % 4];
		area += a.x * b.y - b.x * a.y;
	}
	return Math.abs(area) / 2;
}
