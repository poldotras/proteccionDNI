/**
 * Detección por rectas dominantes (transformada de Hough guiada por el gradiente).
 * Sirve para los casos donde el contraste con el fondo no delimita la tarjeta
 * (fondos de varias superficies) pero sus bordes sí existen como rectas.
 */
import type { Punto } from '../tipos';
import type { Deteccion } from './tipos';
import { OrdenarEsquinas, AreaCuadrilatero } from './geometria';
import { crearMuestreador } from './imagen';
import { TonoInterior, AfinarYValidar } from './refinado';

/** Una recta del acumulador de Hough (índice de ángulo, de rho y sus votos) */
interface RectaHough {
	a: number;
	r: number;
	votos: number;
}

/**
 * Encuentra las rectas dominantes de la imagen y monta con ellas cuadriláteros
 * con la geometría de un DNI, quedándose con el de mayor apoyo de borde real.
 */
export function DetectarPorLineas(imgPixels: ImageData, areaMinima: number): Deteccion | null {
	const w = imgPixels.width;
	const h = imgPixels.height;
	const data = imgPixels.data;

	// trabajar a resolución reducida para que la transformada sea rápida
	const escala = Math.max(1, Math.round(Math.max(w, h) / 800));
	const ws = Math.floor(w / escala);
	const hs = Math.floor(h / escala);
	const gris = new Float32Array(ws * hs);
	for (let y = 0; y < hs; y++) {
		for (let x = 0; x < ws; x++)
			gris[y * ws + x] = data[(y * escala * w + x * escala) * 4];
	}

	// acumulador de Hough: cada píxel con gradiente vota solo por la recta
	// perpendicular a su gradiente, con el ángulo en pasos de 1º
	const angulos = 180;
	const pasoRho = 2;
	const maxRho = Math.ceil(Math.hypot(ws, hs));
	const anchoRho = Math.ceil(2 * maxRho / pasoRho) + 1;
	const votos = new Float32Array(angulos * anchoRho);
	const cosenos = new Float32Array(angulos);
	const senos = new Float32Array(angulos);
	for (let a = 0; a < angulos; a++) {
		cosenos[a] = Math.cos(a * Math.PI / angulos);
		senos[a] = Math.sin(a * Math.PI / angulos);
	}

	const umbralGradiente = 10;
	for (let y = 1; y < hs - 1; y++) {
		for (let x = 1; x < ws - 1; x++) {
			const gx = gris[y * ws + x + 1] - gris[y * ws + x - 1];
			const gy = gris[(y + 1) * ws + x] - gris[(y - 1) * ws + x];
			const magnitud = Math.hypot(gx, gy);
			if (magnitud < umbralGradiente)
				continue;

			// normal de la recta = dirección del gradiente, en [0, 180)
			let angulo = Math.atan2(gy, gx);
			if (angulo < 0)
				angulo += Math.PI;
			const a = Math.min(angulos - 1, Math.round(angulo / Math.PI * angulos) % angulos);
			const rho = x * cosenos[a] + y * senos[a];
			votos[a * anchoRho + Math.round((rho + maxRho) / pasoRho)] += magnitud;
		}
	}

	// mejores rectas con supresión de vecinas (misma recta en celdas contiguas)
	const indices: number[] = [];
	for (let i = 0; i < votos.length; i++) {
		if (votos[i] > 0)
			indices.push(i);
	}
	indices.sort((i, j) => votos[j] - votos[i]);
	const rectas: RectaHough[] = [];
	for (const i of indices) {
		if (rectas.length >= 16)
			break;
		const a = Math.floor(i / anchoRho);
		const r = i % anchoRho;
		const cerca = rectas.some(recta => {
			const da = Math.min(Math.abs(recta.a - a), angulos - Math.abs(recta.a - a));
			return da <= 6 && Math.abs(recta.r - r) <= 14;
		});
		if (!cerca)
			rectas.push({ a, r, votos: votos[i] });
	}

	// parejas de rectas casi paralelas y separadas: posibles lados opuestos
	const minDim = Math.min(ws, hs);
	const parejas: { l1: RectaHough; l2: RectaHough; votos: number }[] = [];
	for (let i = 0; i < rectas.length; i++) {
		for (let j = i + 1; j < rectas.length; j++) {
			const da = Math.min(Math.abs(rectas[i].a - rectas[j].a), angulos - Math.abs(rectas[i].a - rectas[j].a));
			if (da > 22)
				continue;
			if (Math.abs(rectas[i].r - rectas[j].r) * pasoRho < minDim * 0.22)
				continue;
			parejas.push({ l1: rectas[i], l2: rectas[j], votos: rectas[i].votos + rectas[j].votos });
		}
	}
	parejas.sort((p, q) => q.votos - p.votos);
	parejas.length = Math.min(parejas.length, 10);

	function interseccionHough(l1: RectaHough, l2: RectaHough): Punto | null {
		const den = cosenos[l1.a] * senos[l2.a] - senos[l1.a] * cosenos[l2.a];
		if (Math.abs(den) < 1e-9)
			return null;
		const rho1 = l1.r * pasoRho - maxRho;
		const rho2 = l2.r * pasoRho - maxRho;
		return {
			x: (rho1 * senos[l2.a] - rho2 * senos[l1.a]) / den * escala,
			y: (rho2 * cosenos[l1.a] - rho1 * cosenos[l2.a]) / den * escala,
		};
	}

	// combinar parejas casi perpendiculares en cuadriláteros y quedarnos con el
	// que tenga los 4 lados con más apoyo de borde real en la imagen
	let mejor: { cuadrilatero: Punto[]; puntuacion: number } | null = null;
	for (let i = 0; i < parejas.length; i++) {
		for (let j = i + 1; j < parejas.length; j++) {
			const da = Math.min(Math.abs(parejas[i].l1.a - parejas[j].l1.a), angulos - Math.abs(parejas[i].l1.a - parejas[j].l1.a));
			if (da < 60 || da > 120)
				continue;

			const esquinas = [
				interseccionHough(parejas[i].l1, parejas[j].l1),
				interseccionHough(parejas[i].l1, parejas[j].l2),
				interseccionHough(parejas[i].l2, parejas[j].l2),
				interseccionHough(parejas[i].l2, parejas[j].l1),
			];
			if (esquinas.some(p => !p || p.x < -w * 0.05 || p.x > w * 1.05 || p.y < -h * 0.05 || p.y > h * 1.05))
				continue;

			const cuadrilatero = OrdenarEsquinas(esquinas as Punto[]);
			const areaCuad = AreaCuadrilatero(cuadrilatero);
			if (areaCuad < areaMinima || areaCuad > w * h * 0.92)
				continue;

			const puntuacion = PuntuarCuadrilatero(imgPixels, cuadrilatero);
			if (puntuacion > 4 && (!mejor || puntuacion > mejor.puntuacion))
				mejor = { cuadrilatero, puntuacion };
		}
	}
	if (!mejor)
		return null;

	// apurado fino y validación con las mismas garantías que la otra vía
	const resultado = AfinarYValidar(imgPixels, mejor.cuadrilatero, false);
	return resultado && resultado.esquinas ? resultado : null;
}

/**
 * Apoyo de borde real de un cuadrilátero: el peor de sus 4 lados según el
 * gradiente coherente a través de cada uno (un lado sin borde da casi 0)
 */
function PuntuarCuadrilatero(imgPixels: ImageData, esquinas: Punto[]): number {
	const gris = crearMuestreador(imgPixels);
	const tono = TonoInterior(imgPixels, esquinas);

	let peor = Infinity;
	for (let lado = 0; lado < 4; lado++) {
		const pa = esquinas[lado];
		const pb = esquinas[(lado + 1) % 4];
		const largo = Math.hypot(pb.x - pa.x, pb.y - pa.y);
		if (largo < 20)
			return 0;
		const nx = (pb.y - pa.y) / largo;
		const ny = -(pb.x - pa.x) / largo;

		let suma = 0;
		let sumaAbs = 0;
		const muestras = 32;
		for (let i = 0; i < muestras; i++) {
			const t = 0.12 + 0.76 * i / (muestras - 1);
			const x = pa.x + (pb.x - pa.x) * t;
			const y = pa.y + (pb.y - pa.y) * t;
			const interior = gris(x - nx * 6, y - ny * 6);
			const peso = Math.abs(interior - tono) <= 40 ? 1 : 0.15;
			const gradiente = (gris(x + nx * 2, y + ny * 2) - gris(x - nx * 2, y - ny * 2)) * peso;
			suma += gradiente;
			sumaAbs += Math.abs(gradiente);
		}
		const coherencia = sumaAbs > 1 ? Math.abs(suma) / sumaAbs : 0;
		const valor = coherencia >= 0.55 ? Math.abs(suma) / muestras : 0;
		peor = Math.min(peor, valor);
	}
	return peor;
}
