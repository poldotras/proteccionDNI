/**
 * Detección del DNI por contraste con el fondo: crea una máscara binaria de lo
 * que contrasta con el fondo estimado, busca la mayor componente conexa y estima
 * sus esquinas. Es la vía principal; delega el refinado y la vía de rectas.
 */
import type { Punto, Esquinas, Rectangulo } from '../tipos';
import type { Deteccion } from './tipos';
import { Mediana } from './geometria';
import { AfinarYValidar } from './refinado';
import { DetectarPorLineas } from './hough';

/** Máscara binaria a resolución reducida y el factor de reducción usado */
interface Mascara {
	mascara: Uint8Array;
	mw: number;
	mh: number;
	factor: number;
}

/**
 * Detectar el DNI buscando el contraste con el fondo (normalmente blanco).
 * Devuelve null si no hay detección fiable, o un objeto con el recuadro que delimita la tarjeta
 * y sus 4 esquinas si además conviene corregir la perspectiva.
 */
export function DetectarTarjeta(imgPixels: ImageData, forzar?: boolean): Deteccion | null {
	// una imagen con la proporción exacta de un DNI (ninguna cámara produce ese
	// formato) es casi seguro una foto ya recortada a la tarjeta, como los
	// ejemplos del repositorio: se toma entera, sin buscar nada dentro.
	// Con forzar (el botón de detectar del editor) se busca de todas formas.
	const proporcionFoto = imgPixels.width / imgPixels.height;
	if (!forzar && proporcionFoto >= 1.55 && proporcionFoto <= 1.62)
		return { tarjeta: { x: 0, y: 0, w: imgPixels.width, h: imgPixels.height }, recortada: true };

	const fondos = FondosCandidatos(imgPixels);

	// el contraste tarjeta-fondo varía mucho entre fotos (una tarjeta clara sobre una
	// mesa blanca apenas contrasta): se prueba de mayor a menor exigencia y nos
	// quedamos con el primer umbral que encuentra las 4 esquinas.
	// primero con apertura (que despega del DNI las letras o dibujos del fondo);
	// sin ella de reserva, porque una tarjeta que apenas contrasta da una máscara
	// con claros que la erosión podría romper
	const area = (tarjeta: Rectangulo): number => tarjeta.w * tarjeta.h;
	const areaImagen = imgPixels.width * imgPixels.height;
	let recuadro: { tarjeta: Rectangulo; puntuacion: number } | null = null;
	let esquinasPequenas: Deteccion | null = null;
	for (const fondo of fondos) {
		for (const conApertura of [true, false]) {
			for (const umbral of [40, 20, 10]) {
				const deteccion = DetectarConUmbral(imgPixels, fondo, umbral, conApertura);
				if (!deteccion)
					continue;

				if (deteccion.esquinas) {
					// una detección con un tamaño normal es definitiva; una pequeña
					// puede ser un elemento interior (la foto de la cara de un
					// escaneo) y se contrasta luego con los recuadros encontrados
					if (area(deteccion.tarjeta) >= areaImagen * 0.15)
						return deteccion;
					if (!esquinasPequenas)
						esquinasPequenas = deteccion;
					continue;
				}

				// si nada da esquinas, recordamos el mejor recuadro: el de proporción
				// más cercana a la de un DNI, o el primero que haya
				const proporcion = deteccion.tarjeta.w / deteccion.tarjeta.h;
				const puntuacion = proporcion > 1.1 && proporcion < 2.4 ? Math.abs(proporcion - 1.586) : 99;
				if (!recuadro || puntuacion < recuadro.puntuacion)
					recuadro = { tarjeta: deteccion.tarjeta, puntuacion };
			}
		}
	}

	// si la máscara no ha dado esquinas, buscarlas por las rectas dominantes de
	// la imagen, exigiendo un tamaño acorde con lo que la máscara sí ha visto
	const minima = recuadro ? area(recuadro.tarjeta) * 0.35 : areaImagen * 0.08;
	const porLineas = DetectarPorLineas(imgPixels, minima);
	if (porLineas)
		return porLineas;

	// unas esquinas pequeñas solo valen si no hay un recuadro bastante mayor
	// que sugiera que el documento real es otro
	if (esquinasPequenas && (!recuadro || area(esquinasPequenas.tarjeta) >= area(recuadro.tarjeta) * 0.5))
		return esquinasPequenas;
	return recuadro && { tarjeta: recuadro.tarjeta };
}

/**
 * Posibles luminosidades del fondo: la mediana de las 4 esquinas de la foto
 * (robusta con encuadres ajustados, donde los bordes los ocupa la tarjeta) y la
 * mediana de los bordes (mejor cuando las esquinas caen en otra superficie).
 * Se devuelven sin repetir para que la detección pruebe con cada una.
 */
function FondosCandidatos(imgPixels: ImageData): number[] {
	const w = imgPixels.width;
	const h = imgPixels.height;
	const data = imgPixels.data;

	const lado = Math.round(Math.min(w, h) * 0.08);
	const esquinas: number[] = [];
	([[0, 0], [w - lado, 0], [0, h - lado], [w - lado, h - lado]] as const).forEach(function ([x0, y0]) {
		for (let y = y0; y < y0 + lado; y += 2) {
			for (let x = x0; x < x0 + lado; x += 2)
				esquinas.push(data[(y * w + x) * 4]);
		}
	});

	const bordes: number[] = [];
	const salto = 10;
	for (let x = 0; x < w; x += salto) {
		bordes.push(data[x * 4], data[((h - 1) * w + x) * 4]);
	}
	for (let y = 0; y < h; y += salto) {
		bordes.push(data[y * w * 4], data[(y * w + w - 1) * 4]);
	}

	const fondos = [Mediana(esquinas)];
	const porBordes = Mediana(bordes);
	if (Math.abs(porBordes - fondos[0]) > 12)
		fondos.push(porBordes);

	// percentil alto de todas las muestras: rescata fondos claros cuyo tono baja
	// en las esquinas por el viñeteado de la cámara
	const todas = esquinas.concat(bordes).sort((a, b) => a - b);
	const claro = todas[Math.floor(todas.length * 0.85)];
	if (fondos.every(fondo => Math.abs(claro - fondo) > 12))
		fondos.push(claro);
	return fondos;
}

/**
 * Crear una máscara binaria a tamaño reducido marcando las zonas que contrastan con el fondo.
 * Al agrupar los píxeles en celdas se elimina de paso el ruido de píxeles sueltos.
 */
function CrearMascara(imgPixels: ImageData, fondo: number, umbral: number): Mascara {
	const w = imgPixels.width;
	const h = imgPixels.height;
	const data = imgPixels.data;

	const factor = Math.max(1, Math.round(w / 500));
	const mw = Math.floor(w / factor);
	const mh = Math.floor(h / factor);
	const mascara = new Uint8Array(mw * mh);
	// una celda se activa si al menos el 10% de sus píxeles contrastan con el fondo
	const minCuenta = Math.max(1, factor * factor * 0.1);
	for (let my = 0; my < mh; my++) {
		for (let mx = 0; mx < mw; mx++) {
			let cuenta = 0;
			for (let y = my * factor; y < (my + 1) * factor; y++) {
				const base = y * w;
				for (let x = mx * factor; x < (mx + 1) * factor; x++) {
					if (Math.abs(data[(base + x) * 4] - fondo) > umbral)
						cuenta++;
				}
			}
			mascara[my * mw + mx] = cuenta >= minCuenta ? 1 : 0;
		}
	}

	return { mascara, mw, mh, factor };
}

/** Expandir la máscara para unir en un solo bloque los elementos impresos de la tarjeta */
function Dilatar(m: Mascara, veces: number): void {
	const { mw, mh } = m;
	let mascara = m.mascara;
	for (let v = 0; v < veces; v++) {
		const salida = new Uint8Array(mascara);
		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				const p = y * mw + x;
				if (mascara[p])
					continue;
				if ((x > 0 && mascara[p - 1]) || (x < mw - 1 && mascara[p + 1]) ||
					(y > 0 && mascara[p - mw]) || (y < mh - 1 && mascara[p + mw]))
					salida[p] = 1;
			}
		}
		mascara = salida;
	}
	m.mascara = mascara;
}

/**
 * Encoger la máscara: borra los trazos finos (letras o líneas del fondo)
 * conservando los bloques sólidos como la tarjeta
 */
function Erosionar(m: Mascara, veces: number): void {
	const { mw, mh } = m;
	let mascara = m.mascara;
	for (let v = 0; v < veces; v++) {
		const salida = new Uint8Array(mascara);
		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				const p = y * mw + x;
				if (!mascara[p])
					continue;
				if (x == 0 || !mascara[p - 1] || x == mw - 1 || !mascara[p + 1] ||
					y == 0 || !mascara[p - mw] || y == mh - 1 || !mascara[p + mw])
					salida[p] = 0;
			}
		}
		mascara = salida;
	}
	m.mascara = mascara;
}

/** Encontrar el mayor bloque de celdas conectadas de la máscara, que debería ser el DNI */
function MayorComponente(m: Mascara): { etiquetas: Int32Array; mejor: number; tam: number } {
	const { mascara, mw, mh } = m;
	const etiquetas = new Int32Array(mw * mh);
	const pila = new Int32Array(mw * mh);
	let mejor = 0;
	let mejorTam = 0;
	let etiqueta = 0;

	for (let i = 0; i < mascara.length; i++) {
		if (!mascara[i] || etiquetas[i])
			continue;

		etiqueta++;
		let tam = 0;
		let np = 0;
		pila[np++] = i;
		etiquetas[i] = etiqueta;
		while (np > 0) {
			const p = pila[--np];
			tam++;
			const x = p % mw;
			const vecinos: number[] = [];
			if (x > 0) vecinos.push(p - 1);
			if (x < mw - 1) vecinos.push(p + 1);
			if (p >= mw) vecinos.push(p - mw);
			if (p < mw * (mh - 1)) vecinos.push(p + mw);
			for (const vecino of vecinos) {
				if (mascara[vecino] && !etiquetas[vecino]) {
					etiquetas[vecino] = etiqueta;
					pila[np++] = vecino;
				}
			}
		}

		if (tam > mejorTam) {
			mejorTam = tam;
			mejor = etiqueta;
		}
	}

	return { etiquetas, mejor, tam: mejorTam };
}

/**
 * Buscar las 4 esquinas aproximadas del bloque detectado: se estima su orientación
 * con los ejes principales de las celdas y se toma el rectángulo entre los cuantiles
 * del 2% en cada eje. Los cuantiles hacen que un apéndice pegado (un cordón, una
 * letra del fondo) apenas desplace el rectángulo, al contrario que los extremos.
 */
function EsquinasComponente(m: Mascara, etiquetas: Int32Array, mejor: number, dilataciones: number): Esquinas {
	const { mw, mh, factor } = m;

	// centro de masas del bloque
	let n = 0, sumaX = 0, sumaY = 0;
	for (let y = 0; y < mh; y++) {
		for (let x = 0; x < mw; x++) {
			if (etiquetas[y * mw + x] != mejor)
				continue;
			n++;
			sumaX += x;
			sumaY += y;
		}
	}
	const cx = sumaX / n;
	const cy = sumaY / n;

	// orientación con la covarianza (ejes principales), limitada a ±45º para que
	// el eje u sea siempre el más horizontal y las esquinas queden bien etiquetadas
	let sxx = 0, sxy = 0, syy = 0;
	const us = new Float64Array(n);
	const vs = new Float64Array(n);
	for (let y = 0; y < mh; y++) {
		for (let x = 0; x < mw; x++) {
			if (etiquetas[y * mw + x] != mejor)
				continue;
			const dx = x - cx;
			const dy = y - cy;
			sxx += dx * dx;
			sxy += dx * dy;
			syy += dy * dy;
		}
	}
	let angulo = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	if (angulo > Math.PI / 4)
		angulo -= Math.PI / 2;
	else if (angulo < -Math.PI / 4)
		angulo += Math.PI / 2;
	const cos = Math.cos(angulo);
	const sin = Math.sin(angulo);

	// proyectar las celdas sobre los ejes
	let i = 0;
	for (let y = 0; y < mh; y++) {
		for (let x = 0; x < mw; x++) {
			if (etiquetas[y * mw + x] != mejor)
				continue;
			const dx = x - cx;
			const dy = y - cy;
			us[i] = dx * cos + dy * sin;
			vs[i] = -dx * sin + dy * cos;
			i++;
		}
	}
	us.sort();
	vs.sort();

	const cuantil = 0.02;
	const corte = Math.floor(n * cuantil);
	let u0 = us[corte], u1 = us[n - 1 - corte];
	let v0 = vs[corte], v1 = vs[n - 1 - corte];

	// deshacer el recorte del cuantil (en un bloque lleno el cuantil q entra q·anchura)
	// y compensar la expansión de la dilatación en cada lado
	const margenU = (u1 - u0) / (1 - 2 * cuantil) * cuantil - dilataciones;
	const margenV = (v1 - v0) / (1 - 2 * cuantil) * cuantil - dilataciones;
	u0 -= margenU;
	u1 += margenU;
	v0 -= margenV;
	v1 += margenV;

	// pasar de celdas de la máscara a coordenadas de la imagen
	const esquina = (u: number, v: number): Punto => ({
		x: (cx + u * cos - v * sin + 0.5) * factor,
		y: (cy + u * sin + v * cos + 0.5) * factor,
	});
	return [esquina(u0, v0), esquina(u1, v0), esquina(u1, v1), esquina(u0, v1)];
}

/**
 * Recuadro que abarca todas las celdas del bloque, compensando la dilatación.
 * Sirve de encuadre de reserva: a diferencia del rectángulo por cuantiles,
 * no recorta los bloques dispersos (como el contenido impreso de la tarjeta)
 */
function ExtensionComponente(m: Mascara, etiquetas: Int32Array, mejor: number, dilataciones: number): Rectangulo {
	const { mw, mh, factor } = m;
	let minX = mw, maxX = 0, minY = mh, maxY = 0;
	for (let y = 0; y < mh; y++) {
		for (let x = 0; x < mw; x++) {
			if (etiquetas[y * mw + x] != mejor)
				continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	return {
		x: (minX + dilataciones) * factor,
		y: (minY + dilataciones) * factor,
		w: (maxX - minX + 1 - 2 * dilataciones) * factor,
		h: (maxY - minY + 1 - 2 * dilataciones) * factor,
	};
}

/** Cuántas de las 4 esquinas de la foto contienen celdas del bloque indicado */
function EsquinasFotoOcupadas(m: Mascara, etiquetas: Int32Array, mejor: number): number {
	const { mw, mh } = m;
	const lado = Math.max(2, Math.round(Math.min(mw, mh) * 0.08));
	let ocupadas = 0;
	([[0, 0], [mw - lado, 0], [0, mh - lado], [mw - lado, mh - lado]] as const).forEach(function ([x0, y0]) {
		let celdas = 0;
		for (let y = y0; y < y0 + lado; y++) {
			for (let x = x0; x < x0 + lado; x++) {
				if (etiquetas[y * mw + x] == mejor)
					celdas++;
			}
		}
		// la esquina cuenta como ocupada si el bloque cubre la mayor parte de ella
		if (celdas > lado * lado * 0.6)
			ocupadas++;
	});
	return ocupadas;
}

/** Una pasada de detección con un umbral de contraste concreto */
function DetectarConUmbral(imgPixels: ImageData, fondo: number, umbral: number, conApertura: boolean): Deteccion | null {
	const m = CrearMascara(imgPixels, fondo, umbral);

	if (conApertura) {
		// apertura morfológica: borra letras y trazos finos del fondo, para que la
		// dilatación posterior no los pegue a la tarjeta
		const erosiones = 3;
		Erosionar(m, erosiones);
		Dilatar(m, erosiones);
	}

	const dilataciones = 4;
	Dilatar(m, dilataciones);

	const { etiquetas, mejor, tam } = MayorComponente(m);
	// exigir un tamaño mínimo del 4% de la imagen para descartar detecciones espurias
	if (!mejor || tam < m.mw * m.mh * 0.04)
		return null;

	// un bloque que cubre 3+ esquinas de la foto no puede ser la tarjeta, porque
	// las esquinas se consideran fondo (se permiten 2 por los fondos con degradado,
	// donde una parte del fondo sí contrasta con el tono estimado)
	if (EsquinasFotoOcupadas(m, etiquetas, mejor) >= 3)
		return null;

	// dos pasadas de refinado: la primera acerca las esquinas al borde real y la segunda,
	// con la franja de búsqueda ya bien centrada, las deja clavadas
	const esquinas = EsquinasComponente(m, etiquetas, mejor, dilataciones);
	let resultado = AfinarYValidar(imgPixels, esquinas);

	// sin unas esquinas fiables es mejor quedarse con un encuadre (la extensión
	// completa del bloque) y que la persona coloque los puntos
	if (!resultado || !resultado.esquinas)
		resultado = { tarjeta: ExtensionComponente(m, etiquetas, mejor, dilataciones) };

	// una tarjeta no puede ocupar prácticamente toda la foto: o es el fondo entero
	// colándose como bloque, o es una foto ya recortada al DNI donde no hay nada
	// que detectar (y los puntos por defecto ya aciertan)
	if (resultado.tarjeta.w * resultado.tarjeta.h > imgPixels.width * imgPixels.height * 0.92)
		return null;
	return resultado;
}
