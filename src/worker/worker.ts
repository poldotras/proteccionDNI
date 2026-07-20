/**
 * Punto de entrada del WebWorker: mantiene la última foto procesada y atiende los
 * mensajes de la interfaz (procesar, detectar, enderezar, girar). El trabajo de
 * imagen está repartido en imagen.ts, deteccion.ts, hough.ts, refinado.ts y
 * enderezado.ts.
 */
import type { Esquinas, Rectangulo, PeticionWorker, ConId } from '../tipos';
import { ConvertirBN, PonerHorizontal, ReducirAnchura, AclararNegros, GirarImageData, BitmapDeImageData } from './imagen';
import { DetectarTarjeta } from './deteccion';
import { EnderezarTarjeta } from './enderezado';

// Imagen en escala de grises de la última foto procesada, para poder enderezarla
// de nuevo cada vez que se ajusten las esquinas sin reprocesarlo todo
let imagenGris: ImageData | null = null;

// La misma imagen en color, para mostrarla en el editor de esquinas
let imagenColor: ImageData | null = null;

/**
 * Procesar una foto nueva: girar si está en vertical, pasar a blanco y negro
 * y detectar las esquinas del DNI. No endereza; eso se pide en un mensaje aparte.
 * Devuelve el bitmap en blanco y negro y otro en color para el editor de esquinas.
 */
function ProcesarImagenNueva(datos: { id: number; bitmap: ImageBitmap }): void {
	const canvas = ReducirAnchura(PonerHorizontal(datos.bitmap));
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

	imagenGris = null;
	imagenColor = null;
	let bitmapColor: ImageBitmap | null = null;
	let esquinas: Esquinas | null = null;
	let tarjeta: Rectangulo | null = null;
	let recortada = false;
	try {
		const imgPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
		// guardamos una copia en color antes de convertir a blanco y negro
		imagenColor = new ImageData(new Uint8ClampedArray(imgPixels.data), imgPixels.width, imgPixels.height);
		// transferir vacía el canvas, pero mantiene su tamaño y se puede seguir dibujando
		bitmapColor = canvas.transferToImageBitmap();

		ConvertirBN(imgPixels);
		imagenGris = imgPixels;

		const deteccion = DetectarTarjeta(imgPixels);
		if (deteccion) {
			tarjeta = deteccion.tarjeta;
			esquinas = deteccion.esquinas || null;
			recortada = !!deteccion.recortada;
		}

		// para la salida se aclaran los negros sobre una copia; imagenGris mantiene
		// el rango completo, que es el que usan la detección y el enderezado
		const salida = new ImageData(new Uint8ClampedArray(imgPixels.data), imgPixels.width, imgPixels.height);
		ctx.putImageData(AclararNegros(salida), 0, 0);
	} catch {
		// getImageData puede fallar con imágenes que contaminan el canvas
	}

	const bitmap = canvas.transferToImageBitmap();
	postMessage({ id: datos.id, bitmap, bitmapColor, esquinas, tarjeta, recortada });
}

/** Enderezar la última foto procesada usando las esquinas indicadas */
function ProcesarEnderezado(datos: { id: number; esquinas: Esquinas }): void {
	if (!imagenGris) {
		postMessage({ id: datos.id, bitmap: null });
		return;
	}

	const enderezado = EnderezarTarjeta(imagenGris, datos.esquinas);
	if (!enderezado) {
		postMessage({ id: datos.id, bitmap: null });
		return;
	}

	const canvas = new OffscreenCanvas(imagenGris.width, imagenGris.height);
	canvas.getContext('2d')!.putImageData(AclararNegros(enderezado.imgPixels), 0, 0);
	const bitmap = canvas.transferToImageBitmap();
	postMessage({ id: datos.id, bitmap, tarjeta: enderezado.tarjeta });
}

/** Girar 90º las imágenes guardadas y devolverlas, para cuando la foto está en la orientación equivocada */
function ProcesarGiro(datos: { id: number; giro: number }): void {
	if (!imagenGris) {
		postMessage({ id: datos.id, bitmap: null });
		return;
	}

	imagenGris = GirarImageData(imagenGris, datos.giro);

	let bitmapColor: ImageBitmap | null = null;
	if (imagenColor) {
		imagenColor = GirarImageData(imagenColor, datos.giro);
		bitmapColor = BitmapDeImageData(imagenColor);
	}

	postMessage({ id: datos.id, bitmap: BitmapDeImageData(imagenGris), bitmapColor });
}

/**
 * Repetir la detección sobre la última foto, forzándola aunque la imagen tenga
 * la proporción de una tarjeta (el botón de detectar del editor)
 */
function ProcesarDeteccion(datos: { id: number }): void {
	if (!imagenGris) {
		postMessage({ id: datos.id, esquinas: null, tarjeta: null });
		return;
	}

	const deteccion = DetectarTarjeta(imagenGris, true);
	postMessage({
		id: datos.id,
		esquinas: (deteccion && deteccion.esquinas) || null,
		tarjeta: (deteccion && deteccion.tarjeta) || null,
	});
}

addEventListener('message', (e: MessageEvent<ConId<PeticionWorker>>) => {
	const datos = e.data;
	switch (datos.tipo) {
		case 'procesar':
			ProcesarImagenNueva(datos);
			break;
		case 'detectar':
			ProcesarDeteccion(datos);
			break;
		case 'enderezar':
			ProcesarEnderezado(datos);
			break;
		case 'girar':
			ProcesarGiro(datos);
			break;
	}
});
