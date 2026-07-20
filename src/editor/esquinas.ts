/**
 * Editor de esquinas sobre la imagen original: el marco con los 4 puntos arrastrables,
 * la lupa de precisión, los giros de 90º y la petición de enderezado al worker.
 */
import { canvasOriginal, MarcoEsquinas, PoligonoEsquinas, Lupa } from './dom';
import { estado } from './estado';
import { enviarAlWorker } from './procesador';
import { RedibujarDNI } from './resultado';
import type { Punto, Esquinas, Rectangulo, RespuestaEnderezar, RespuestaGirar, RespuestaDetectar } from '../tipos';

// escala y desplazamiento con los que se muestra la imagen original dentro del editor
let transformacionEditor = { escala: 1, x: 0, y: 0 };

// Control para no acumular peticiones de enderezado mientras se arrastran las esquinas
let enderezadoEnCurso = false;
let enderezadoPendiente = false;

// Observador opcional al que se avisa tras cada actualización del marco (la página
// de pruebas lo usa para mostrar las coordenadas de los 4 puntos)
let observadorMarco: (() => void) | null = null;
export function observarMarco(callback: () => void): void {
	observadorMarco = callback;
}

export function RectanguloAEsquinas(rect: Rectangulo): Esquinas {
	return [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y + rect.h },
		{ x: rect.x, y: rect.y + rect.h },
	];
}

export function EsquinasPorDefecto(): Esquinas {
	const w = estado.imagenOriginalBN!.width;
	const h = estado.imagenOriginalBN!.height;
	return RectanguloAEsquinas({ x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 });
}

/** Comprueba que las 4 esquinas forman un cuadrilátero convexo en el orden esperado (sentido horario) */
function EsConvexo(esquinas: Esquinas): boolean {
	for (let i = 0; i < 4; i++) {
		const a = esquinas[i];
		const b = esquinas[(i + 1) % 4];
		const c = esquinas[(i + 2) % 4];
		if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0)
			return false;
	}
	return true;
}

/** Dibujar la imagen original en el editor y colocar el marco con las 4 esquinas */
export function DibujarEditorEsquinas(): void {
	if (!estado.imagenOriginalBN || !estado.esquinasDNI)
		return;

	const ctx = canvasOriginal.getContext('2d', { alpha: false })!;
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, canvasOriginal.width, canvasOriginal.height);

	const imagen = estado.imagenOriginalColor || estado.imagenOriginalBN;
	const escala = Math.min(canvasOriginal.width / imagen.width, canvasOriginal.height / imagen.height);
	transformacionEditor = {
		escala,
		x: (canvasOriginal.width - imagen.width * escala) / 2,
		y: (canvasOriginal.height - imagen.height * escala) / 2,
	};
	ctx.drawImage(imagen, transformacionEditor.x, transformacionEditor.y, imagen.width * escala, imagen.height * escala);

	ActualizarMarcoEsquinas();
}

/** Pasa un punto de coordenadas de la imagen original a coordenadas del canvas del editor */
function EsquinaAEditor(punto: Punto): Punto {
	return {
		x: transformacionEditor.x + punto.x * transformacionEditor.escala,
		y: transformacionEditor.y + punto.y * transformacionEditor.escala,
	};
}

/** Actualizar el polígono y los puntos arrastrables con la posición actual de las esquinas */
export function ActualizarMarcoEsquinas(): void {
	if (!estado.esquinasDNI)
		return;
	const puntos = estado.esquinasDNI.map(EsquinaAEditor);
	PoligonoEsquinas.setAttribute('points', puntos.map(p => p.x + ',' + p.y).join(' '));
	PoligonoEsquinas.classList.toggle('invalido', !EsConvexo(estado.esquinasDNI));

	// se posicionan tanto los círculos visibles como sus zonas de toque ampliadas
	MarcoEsquinas.querySelectorAll<SVGCircleElement>('.esquina')
		.forEach(function (circulo) {
			const punto = puntos[Number(circulo.dataset.indice)];
			circulo.setAttribute('cx', String(punto.x));
			circulo.setAttribute('cy', String(punto.y));
		});

	observadorMarco?.();
}

/**
 * Permitir arrastrar las 4 esquinas con ratón o dedo; al soltar se endereza la imagen.
 * Mientras se arrastra se muestra una lupa para colocar el punto con precisión.
 */
export function configurarEditorEsquinas(): void {
	let indiceArrastre: number | null = null;

	MarcoEsquinas.addEventListener('pointerdown', function (ev) {
		const esquina = (ev.target as Element).closest('.esquina') as SVGCircleElement | null;
		if (!esquina || !estado.esquinasDNI)
			return;

		indiceArrastre = parseInt(esquina.dataset.indice!, 10);
		MarcoEsquinas.setPointerCapture(ev.pointerId);
		Lupa.style.display = 'block';
		ActualizarLupa(indiceArrastre);
		ev.stopPropagation();
		ev.preventDefault();
	});

	MarcoEsquinas.addEventListener('pointermove', function (ev) {
		if (indiceArrastre == null || !estado.esquinasDNI)
			return;

		// pasar de coordenadas de pantalla a coordenadas de la imagen original
		const bb = MarcoEsquinas.getBoundingClientRect();
		const x = (ev.clientX - bb.left) * canvasOriginal.width / bb.width;
		const y = (ev.clientY - bb.top) * canvasOriginal.height / bb.height;

		estado.esquinasDNI[indiceArrastre] = {
			x: Math.min(Math.max((x - transformacionEditor.x) / transformacionEditor.escala, 0), estado.imagenOriginalBN!.width),
			y: Math.min(Math.max((y - transformacionEditor.y) / transformacionEditor.escala, 0), estado.imagenOriginalBN!.height),
		};
		ActualizarMarcoEsquinas();
		ActualizarLupa(indiceArrastre);
		ev.stopPropagation();
	});

	function soltar(ev: PointerEvent): void {
		if (indiceArrastre == null)
			return;

		indiceArrastre = null;
		Lupa.style.display = '';
		SolicitarEnderezado();
		ev.stopPropagation();
	}
	MarcoEsquinas.addEventListener('pointerup', soltar);
	MarcoEsquinas.addEventListener('pointercancel', soltar);
}

/**
 * Dibujar en la lupa la zona ampliada alrededor de la esquina que se está arrastrando,
 * con una cruz en el centro y las líneas del marco hacia las esquinas vecinas,
 * y colocarla junto al punto sin taparlo ni salirse del editor
 */
function ActualizarLupa(indice: number): void {
	if (!estado.esquinasDNI || !estado.imagenOriginalBN)
		return;
	const punto = estado.esquinasDNI[indice];
	const centro = Lupa.width / 2;

	// zona de la imagen original que se amplía, proporcional a su tamaño
	const lado = Math.max(80, Math.round(estado.imagenOriginalBN.width * 0.08));
	const ampliacion = Lupa.width / lado;

	const ctx = Lupa.getContext('2d', { alpha: false })!;
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, Lupa.width, Lupa.height);
	ctx.drawImage(estado.imagenOriginalColor || estado.imagenOriginalBN, punto.x - lado / 2, punto.y - lado / 2, lado, lado, 0, 0, Lupa.width, Lupa.height);

	// líneas del marco hacia las dos esquinas vecinas, para poder alinear con los bordes
	ctx.strokeStyle = 'rgb(13 110 253 / .8)';
	ctx.lineWidth = 3;
	[1, 3].forEach(function (salto) {
		const vecino = estado.esquinasDNI![(indice + salto) % 4];
		ctx.beginPath();
		ctx.moveTo(centro, centro);
		ctx.lineTo(centro + (vecino.x - punto.x) * ampliacion, centro + (vecino.y - punto.y) * ampliacion);
		ctx.stroke();
	});

	// cruz de precisión en el centro
	ctx.strokeStyle = '#DC1E1E';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(centro - 22, centro);
	ctx.lineTo(centro - 6, centro);
	ctx.moveTo(centro + 6, centro);
	ctx.lineTo(centro + 22, centro);
	ctx.moveTo(centro, centro - 22);
	ctx.lineTo(centro, centro - 6);
	ctx.moveTo(centro, centro + 6);
	ctx.lineTo(centro, centro + 22);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(centro, centro, 6, 0, 2 * Math.PI);
	ctx.stroke();

	// colocar la lupa por encima del punto (o por debajo si no cabe), sin salirse del editor
	const anchoPct = 30; // debe coincidir con la anchura definida en el CSS
	const altoPct = anchoPct * canvasOriginal.width / canvasOriginal.height;
	const pe = EsquinaAEditor(punto);

	let izquierda = pe.x / canvasOriginal.width * 100 - anchoPct / 2;
	izquierda = Math.min(Math.max(izquierda, 0), 100 - anchoPct);

	let arriba = pe.y / canvasOriginal.height * 100 - altoPct - 8;
	if (arriba < 0)
		arriba = pe.y / canvasOriginal.height * 100 + 12;

	Lupa.style.left = izquierda + '%';
	Lupa.style.top = arriba + '%';
}

/** Pide al worker enderezar la imagen con las esquinas actuales y actualiza la previsualización */
export function AplicarEsquinas(): Promise<void> {
	return enviarAlWorker<RespuestaEnderezar>({ tipo: 'enderezar', esquinas: estado.esquinasDNI! })
		.then(function (respuesta) {
			// el worker devuelve null si las esquinas no permiten calcular la transformación
			if (!respuesta.bitmap)
				return;

			estado.imagenDNI_BN = respuesta.bitmap;
			estado.tarjetaResultado = respuesta.tarjeta ?? null;
			RedibujarDNI();
		});
}

/**
 * Enderezar la imagen con las esquinas actuales, sin acumular peticiones si llegan más
 * mientras el worker está ocupado (por ejemplo al arrastrar una esquina rápidamente)
 */
export function SolicitarEnderezado(): void {
	if (!estado.esquinasDNI || !EsConvexo(estado.esquinasDNI))
		return;

	if (enderezadoEnCurso) {
		enderezadoPendiente = true;
		return;
	}

	enderezadoEnCurso = true;
	AplicarEsquinas()
		.catch(error => console.error(error))
		.finally(function () {
			enderezadoEnCurso = false;
			if (enderezadoPendiente) {
				enderezadoPendiente = false;
				SolicitarEnderezado();
			}
		});
}

// Copia de las esquinas previas al botón de detectar, para poder deshacer
let esquinasAntesDeteccion: Esquinas | null = null;

/**
 * Botones de detección manual: cuando la foto se ha tomado entera por tener la
 * proporción de una tarjeta, un botón permite buscar el DNI dentro de todas formas,
 * y otro deshacer esa detección volviendo a la imagen completa
 */
export function configurarDeteccionManual(): void {
	const botonDetectar = document.getElementById('DetectarDNI')!;
	const botonDeshacer = document.getElementById('DeshacerDeteccion')!;

	botonDetectar.addEventListener('click', function () {
		enviarAlWorker<RespuestaDetectar>({ tipo: 'detectar' })
			.then(function (respuesta) {
				const nuevas = respuesta.esquinas ||
					(respuesta.tarjeta && RectanguloAEsquinas(respuesta.tarjeta));
				if (!nuevas) {
					alert('No se ha encontrado el DNI dentro de la foto');
					return;
				}

				esquinasAntesDeteccion = estado.esquinasDNI;
				estado.esquinasDNI = nuevas;
				botonDetectar.classList.add('Oculto');
				botonDeshacer.classList.remove('Oculto');
				DibujarEditorEsquinas();
				SolicitarEnderezado();
			})
			.catch(error => console.error(error));
	});

	botonDeshacer.addEventListener('click', function () {
		if (!esquinasAntesDeteccion)
			return;

		estado.esquinasDNI = esquinasAntesDeteccion;
		MostrarBotonDeteccion(true);
		DibujarEditorEsquinas();
		SolicitarEnderezado();
	});
}

/**
 * Mostrar u ocultar el botón de detectar (y esconder siempre el de deshacer),
 * al cargar una foto nueva o al deshacer
 */
export function MostrarBotonDeteccion(visible: boolean): void {
	esquinasAntesDeteccion = null;
	document.getElementById('DetectarDNI')!.classList.toggle('Oculto', !visible);
	document.getElementById('DeshacerDeteccion')!.classList.add('Oculto');
}

/** Giros de 90º de la imagen original */
export function configurarGiro(): void {
	document.querySelectorAll<HTMLButtonElement>('.girar')
		.forEach(boton => boton.addEventListener('click', girarDNI));
}

function girarDNI(ev: Event): void {
	const boton = ev.currentTarget as HTMLButtonElement;
	const giro = parseInt(boton.dataset.giro!, 10);

	enviarAlWorker<RespuestaGirar>({ tipo: 'girar', giro })
		.then(function (respuesta) {
			if (!respuesta.bitmap || !estado.esquinasDNI)
				return;

			const anchoPrevio = estado.imagenOriginalBN!.width;
			const altoPrevio = estado.imagenOriginalBN!.height;
			estado.imagenOriginalBN = respuesta.bitmap;
			estado.imagenOriginalColor = respuesta.bitmapColor || respuesta.bitmap;

			// girar también las esquinas, desplazando su orden para que
			// el punto 0 siga siendo el de arriba a la izquierda
			const giradas = estado.esquinasDNI.map(p => giro > 0
				? { x: altoPrevio - p.y, y: p.x }
				: { x: p.y, y: anchoPrevio - p.x });
			estado.esquinasDNI = giro > 0
				? [giradas[3], giradas[0], giradas[1], giradas[2]]
				: [giradas[1], giradas[2], giradas[3], giradas[0]];

			// las esquinas guardadas para deshacer la detección ya no encajan
			if (esquinasAntesDeteccion)
				MostrarBotonDeteccion(true);

			DibujarEditorEsquinas();
			SolicitarEnderezado();
		})
		.catch(error => console.error(error));
}
