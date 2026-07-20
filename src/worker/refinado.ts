/**
 * Refinado y validación de las esquinas: a partir de unas esquinas aproximadas,
 * busca el borde real de cada lado con un barrido de rectas y comprueba que el
 * cuadrilátero resultante tiene la geometría de un DNI.
 */
import type { Punto, Rectangulo } from '../tipos';
import type { Deteccion } from './tipos';
import { Mediana, Distancia } from './geometria';
import { crearMuestreador } from './imagen';

/** Una recta ajustada a un borde, dada por dos de sus puntos */
interface RectaAjustada {
	a: Punto;
	b: Punto;
}

/**
 * Tono típico del interior de la tarjeta: la mediana de una rejilla de muestras
 * alrededor del centro del cuadrilátero detectado
 */
export function TonoInterior(imgPixels: ImageData, esquinas: Punto[]): number {
	const data = imgPixels.data;
	const cx = (esquinas[0].x + esquinas[1].x + esquinas[2].x + esquinas[3].x) / 4;
	const cy = (esquinas[0].y + esquinas[1].y + esquinas[2].y + esquinas[3].y) / 4;
	const xs = esquinas.map(p => p.x);
	const ys = esquinas.map(p => p.y);
	const dx = (Math.max(...xs) - Math.min(...xs)) * 0.2;
	const dy = (Math.max(...ys) - Math.min(...ys)) * 0.2;

	const muestras: number[] = [];
	for (let j = -5; j <= 5; j++) {
		for (let i = -5; i <= 5; i++) {
			const x = Math.round(cx + i * dx / 5);
			const y = Math.round(cy + j * dy / 5);
			if (x >= 0 && y >= 0 && x < imgPixels.width && y < imgPixels.height)
				muestras.push(data[(y * imgPixels.width + x) * 4]);
		}
	}
	return Mediana(muestras);
}

/**
 * Afinar las esquinas buscando el borde real de cada lado con un barrido de rectas:
 * alrededor del segmento entre esquinas se prueban rectas desplazadas e inclinadas
 * y gana la que maximiza el gradiente coherente de la imagen a través de ella.
 * No depende de un tono global de fondo, por lo que funciona con fondos de varias
 * superficies, con viñeteado o con bordes muy tenues como los de un escaneo.
 * La esquina final es la intersección de las rectas de los dos lados contiguos,
 * con lo que el redondeo de las esquinas del DNI no la desplaza.
 */
function RefinarEsquinas(imgPixels: ImageData, esquinas: Punto[], barridoAmplio: boolean): { esquinas: Punto[]; lados: number } {
	const gris = crearMuestreador(imgPixels);
	const tonoTarjeta = TonoInterior(imgPixels, esquinas);
	const margenTono = 40;
	const grado = Math.PI / 180;

	// en la primera pasada el barrido es amplio para poder corregir un encuadre
	// aproximado; en la segunda solo se apura alrededor del resultado anterior
	const maxDesplazamiento = barridoAmplio ? 56 : 12;
	const maxGiro = (barridoAmplio ? 12 : 3) * grado;

	/**
	 * Mejor recta para un lado: para cada candidata se suma el gradiente a través
	 * de ella (fuera menos dentro). Un borde real da una suma alta y coherente en
	 * signo a lo largo de todo el lado; una textura del fondo se cancela.
	 */
	function MejorRecta(pa: Punto, pb: Punto): RectaAjustada | null {
		const dx = pb.x - pa.x;
		const dy = pb.y - pa.y;
		const largo = Math.hypot(dx, dy);
		if (largo < 20)
			return null;
		// normal unitaria hacia fuera (los lados se recorren en sentido horario)
		const nx = dy / largo;
		const ny = -dx / largo;

		// puntos de muestreo, descartando un 12% en cada extremo por el redondeo
		const muestras = 48;
		const puntos: { x: number; y: number; brazo: number }[] = [];
		for (let i = 0; i < muestras; i++) {
			const t = 0.12 + 0.76 * i / (muestras - 1);
			puntos.push({
				x: pa.x + dx * t,
				y: pa.y + dy * t,
				brazo: (t - 0.5) * largo,
			});
		}

		function puntuar(desplazamiento: number, giro: number): { valor: number; coherencia: number } {
			let suma = 0;
			let sumaAbs = 0;
			for (const p of puntos) {
				const d = desplazamiento + giro * p.brazo;
				const x = p.x + nx * d;
				const y = p.y + ny * d;
				// el peso baja si el interior de esta recta no parece tarjeta, para
				// no engancharse a sombras o a elementos del fondo o del contenido
				const interior = gris(x - nx * 6, y - ny * 6);
				const peso = Math.abs(interior - tonoTarjeta) <= margenTono ? 1 : 0.15;
				const gradiente = (gris(x + nx * 2, y + ny * 2) - gris(x - nx * 2, y - ny * 2)) * peso;
				suma += gradiente;
				sumaAbs += Math.abs(gradiente);
			}
			return { valor: Math.abs(suma) / puntos.length, coherencia: sumaAbs > 1 ? Math.abs(suma) / sumaAbs : 0 };
		}

		// barrido en fases: una rejilla gruesa y dos apurados alrededor del mejor
		let mejor = { valor: -1, coherencia: 0, d: 0, g: 0 };
		const explorar = (centroD: number, radioD: number, pasoD: number, centroG: number, radioG: number, pasoG: number): void => {
			for (let d = centroD - radioD; d <= centroD + radioD; d += pasoD) {
				for (let g = centroG - radioG; g <= centroG + radioG; g += pasoG) {
					const p = puntuar(d, g);
					if (p.valor > mejor.valor)
						mejor = { valor: p.valor, coherencia: p.coherencia, d, g };
				}
			}
		};
		explorar(0, maxDesplazamiento, 3, 0, maxGiro, 1.5 * grado);

		// entre las candidatas comparables gana la más exterior: el contenido
		// impreso de la tarjeta (que también da rectas fuertes) siempre queda por
		// dentro del borde real, aunque este tenga menos contraste
		const minimo = Math.max(6, mejor.valor * 0.55);
		buscarExterior:
		for (let d = maxDesplazamiento; d >= -maxDesplazamiento; d -= 3) {
			for (let g = -maxGiro; g <= maxGiro; g += 1.5 * grado) {
				const p = puntuar(d, g);
				if (p.valor >= minimo && p.coherencia >= 0.6) {
					mejor = { valor: p.valor, coherencia: p.coherencia, d, g };
					break buscarExterior;
				}
			}
		}

		explorar(mejor.d, 3, 1, mejor.g, 1.5 * grado, 0.4 * grado);
		explorar(mejor.d, 1, 0.5, mejor.g, 0.4 * grado, 0.15 * grado);

		// el borde debe tener un gradiente medio apreciable y del mismo sentido
		if (mejor.valor < 6 || mejor.coherencia < 0.6)
			return null;

		// dos puntos de la recta ganadora, para poder intersecarla después
		const punto = (t: number): Punto => {
			const d = mejor.d + mejor.g * (t - 0.5) * largo;
			return { x: pa.x + dx * t + nx * d, y: pa.y + dy * t + ny * d };
		};
		return { a: punto(0), b: punto(1) };
	}

	const [tl, tr, br, bl] = esquinas;
	const rectas = [
		MejorRecta(tl, tr),
		MejorRecta(tr, br),
		MejorRecta(br, bl),
		MejorRecta(bl, tl),
	];

	// se informa de cuántos lados tienen el borde real bien ajustado, como
	// medida de la confianza en la detección
	const lados = rectas.filter(Boolean).length;

	// si algún lado no es fiable, quedarse con las esquinas aproximadas
	if (lados < 4)
		return { esquinas, lados };
	const r = rectas as RectaAjustada[];

	// intersección de dos rectas dadas por dos puntos cada una
	function interseccion(r1: RectaAjustada, r2: RectaAjustada): Punto | null {
		const d1x = r1.b.x - r1.a.x;
		const d1y = r1.b.y - r1.a.y;
		const d2x = r2.b.x - r2.a.x;
		const d2y = r2.b.y - r2.a.y;
		const den = d1x * d2y - d1y * d2x;
		if (Math.abs(den) < 1e-9)
			return null;
		const t = ((r2.a.x - r1.a.x) * d2y - (r2.a.y - r1.a.y) * d2x) / den;
		return { x: r1.a.x + d1x * t, y: r1.a.y + d1y * t };
	}

	const nuevas = [
		interseccion(r[3], r[0]),
		interseccion(r[0], r[1]),
		interseccion(r[1], r[2]),
		interseccion(r[2], r[3]),
	];
	if (nuevas.some(p => !p))
		return { esquinas, lados: 0 };
	return { esquinas: nuevas as Punto[], lados };
}

/**
 * Afinar unas esquinas aproximadas con el barrido de rectas y validar el resultado.
 * Devuelve esquinas solo si los 4 lados quedaron bien ajustados al borde real y
 * el cuadrilátero pasa todas las comprobaciones; si no, el recuadro o null.
 */
export function AfinarYValidar(imgPixels: ImageData, aproximadas: Punto[], barridoAmplio = true): Deteccion | null {
	const primera = RefinarEsquinas(imgPixels, aproximadas, barridoAmplio);
	// la segunda pasada apura con la franja ya centrada, o repite el barrido
	// amplio si la primera no encontró los lados
	const refinado = RefinarEsquinas(imgPixels, primera.esquinas, primera.lados < 4);

	// las intersecciones de las rectas pueden quedar algo fuera de la imagen, las limitamos
	const esquinas: Punto[] = refinado.esquinas.map(p => ({
		x: Math.min(Math.max(p.x, 0), imgPixels.width),
		y: Math.min(Math.max(p.y, 0), imgPixels.height),
	}));

	// un lado apoyado en el borde de la foto no es un borde real de la tarjeta
	// (fuera no hay imagen con la que contrastar), y 2+ esquinas recortadas al
	// limitar son extrapolaciones sin base: en ambos casos las esquinas no valen,
	// aunque el recuadro que delimitan sigue sirviendo de encuadre aproximado
	let bordeApoyado = false;
	let recortadas = 0;
	for (let i = 0; i < 4; i++) {
		const a = esquinas[i];
		const b = esquinas[(i + 1) % 4];
		if ((a.x <= 1 && b.x <= 1) || (a.x >= imgPixels.width - 1 && b.x >= imgPixels.width - 1) ||
			(a.y <= 1 && b.y <= 1) || (a.y >= imgPixels.height - 1 && b.y >= imgPixels.height - 1))
			bordeApoyado = true;
		if (a.x <= 0 || a.x >= imgPixels.width || a.y <= 0 || a.y >= imgPixels.height)
			recortadas++;
	}

	const resultado = ValidarEsquinas(esquinas, imgPixels.width, imgPixels.height);
	if (!resultado)
		return null;
	if (bordeApoyado || recortadas >= 2 || refinado.lados < 4)
		resultado.esquinas = null;
	return resultado;
}

/**
 * Comprobar que las 4 esquinas forman un cuadrilátero convexo con la pinta de un DNI en una foto.
 * Devuelve null si no es fiable; el recuadro que lo delimita si ya está recto,
 * y además las esquinas si merece la pena enderezarlo con corrección de perspectiva.
 */
function ValidarEsquinas(esquinas: Punto[], w: number, h: number): Deteccion | null {
	const [tl, tr, br, bl] = esquinas;

	const minX = Math.min(tl.x, tr.x, br.x, bl.x);
	const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
	const minY = Math.min(tl.y, tr.y, br.y, bl.y);
	const maxY = Math.max(tl.y, tr.y, br.y, bl.y);
	const tarjeta: Rectangulo = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

	// si la zona detectada es demasiado pequeña, mejor no fiarse de la detección
	if (tarjeta.w < w * 0.2 || tarjeta.h < h * 0.2)
		return null;

	// comprobar que es convexo: todos los giros entre lados consecutivos en el mismo sentido
	for (let i = 0; i < 4; i++) {
		const a = esquinas[i];
		const b = esquinas[(i + 1) % 4];
		const c = esquinas[(i + 2) % 4];
		const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
		if (cruz <= 0)
			return { tarjeta };
	}

	const arriba = Distancia(tl, tr);
	const abajo = Distancia(bl, br);
	const izquierda = Distancia(tl, bl);
	const derecha = Distancia(tr, br);

	// los lados opuestos deben ser parecidos y la proporción similar a la de un DNI;
	// si no, aplicamos solo el encuadre sin corregir la perspectiva
	const proporcion = (arriba + abajo) / (izquierda + derecha);
	const apaisada = proporcion >= 1;
	const proporcionNormal = apaisada ? proporcion : 1 / proporcion;
	// un DNI es 1.586; el margen restante cubre la deformación por perspectiva
	if (Math.min(arriba, abajo) / Math.max(arriba, abajo) < 0.7 ||
		Math.min(izquierda, derecha) / Math.max(izquierda, derecha) < 0.7 ||
		proporcionNormal < 1.38 || proporcionNormal > 1.85)
		return { tarjeta };

	// más de ~35º de inclinación no es una foto normal de un DNI, sino algún
	// elemento diagonal de la imagen que ha pasado los filtros anteriores
	const inclinacion = Math.abs(Math.atan2(tr.y - tl.y, tr.x - tl.x)) * 180 / Math.PI;
	if (Math.min(inclinacion, 180 - inclinacion) > 35)
		return { tarjeta };

	// una tarjeta vertical (típico de un escaneo girado) se acepta reordenando las
	// esquinas, con lo que el enderezado la deja apaisada de paso; al venir de
	// escaneos sin apenas perspectiva, la proporción se exige más estricta
	if (!apaisada) {
		if (proporcionNormal < 1.45 || proporcionNormal > 1.75)
			return { tarjeta };
		return { tarjeta, esquinas: [esquinas[3], esquinas[0], esquinas[1], esquinas[2]] };
	}

	// si las esquinas ya están casi en las esquinas del recuadro, no hace falta enderezar nada
	const rectas = [
		Distancia(tl, { x: minX, y: minY }),
		Distancia(tr, { x: maxX, y: minY }),
		Distancia(br, { x: maxX, y: maxY }),
		Distancia(bl, { x: minX, y: maxY }),
	];
	const margenRecto = 0.008 * (tarjeta.w + tarjeta.h) / 2;
	if (Math.max(...rectas) < margenRecto)
		return { tarjeta };

	return { tarjeta, esquinas: [tl, tr, br, bl] };
}
