/** Preparación de la imagen y muestreo de píxeles */

/** Convertir todo a blanco y negro, modificando los píxeles directamente */
export function ConvertirBN(imgPixels: ImageData): void {
	const data = imgPixels.data;
	for (let i = 0; i < data.length; i += 4) {
		const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
		data[i] = avg;
		data[i + 1] = avg;
		data[i + 2] = avg;
	}
}

/** Si la imagen parece estar en vertical, girarla automáticamente por defecto */
export function PonerHorizontal(img: ImageBitmap): OffscreenCanvas {
	if (img.height > img.width) {
		const canvasGiro = new OffscreenCanvas(img.height, img.width);
		const ctxRotado = canvasGiro.getContext('2d')!;
		// rotar alrededor del centro del canvas destino
		ctxRotado.translate(img.height / 2, img.width / 2);
		ctxRotado.rotate(270 * Math.PI / 180);
		ctxRotado.drawImage(img, -img.width / 2, -img.height / 2);
		return canvasGiro;
	}

	const canvas = new OffscreenCanvas(img.width, img.height);
	canvas.getContext('2d')!.drawImage(img, 0, 0);
	return canvas;
}

/** Limitar a un ancho máximo de 2000px para mejorar el rendimiento posterior */
export function ReducirAnchura(canvas: OffscreenCanvas): OffscreenCanvas {
	const anchoMaximo = 2000;
	if (canvas.width <= anchoMaximo)
		return canvas;

	const width = anchoMaximo;
	const height = anchoMaximo * canvas.height / canvas.width;

	const canvasEscalado = new OffscreenCanvas(width, height);
	canvasEscalado.getContext('2d')!.drawImage(canvas, 0, 0, width, height);
	return canvasEscalado;
}

// Tono mínimo de la copia protegida: los negros puros quedan como un gris oscuro
const NegroMinimo = 35;

/**
 * Reescalar los tonos al rango [NegroMinimo, 255] para que la copia
 * no tenga negros totalmente puros. Modifica la imagen y la devuelve.
 */
export function AclararNegros(imgPixels: ImageData): ImageData {
	const datos = imgPixels.data;
	const factor = (255 - NegroMinimo) / 255;
	for (let i = 0; i < datos.length; i += 4) {
		const tono = NegroMinimo + datos[i] * factor;
		datos[i] = datos[i + 1] = datos[i + 2] = tono;
	}
	return imgPixels;
}

/** Girar 90º una imagen, en el sentido indicado por el signo */
export function GirarImageData(origen: ImageData, girar: number): ImageData {
	const w = origen.width;
	const h = origen.height;
	const datosOrigen = origen.data;
	const salida = new ImageData(h, w);
	const destino = salida.data;

	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const xd = girar > 0 ? h - 1 - y : y;
			const yd = girar > 0 ? x : w - 1 - x;
			const i = (y * w + x) * 4;
			const j = (yd * h + xd) * 4;
			destino[j] = datosOrigen[i];
			destino[j + 1] = datosOrigen[i + 1];
			destino[j + 2] = datosOrigen[i + 2];
			destino[j + 3] = 255;
		}
	}

	return salida;
}

export function BitmapDeImageData(imgPixels: ImageData): ImageBitmap {
	const canvas = new OffscreenCanvas(imgPixels.width, imgPixels.height);
	canvas.getContext('2d')!.putImageData(imgPixels, 0, 0);
	return canvas.transferToImageBitmap();
}

/**
 * Devuelve una función que lee la luminosidad (canal rojo) de un píxel,
 * fijando las coordenadas fuera de la imagen al borde más cercano
 */
export function crearMuestreador(imgPixels: ImageData): (x: number, y: number) => number {
	const w = imgPixels.width;
	const h = imgPixels.height;
	const data = imgPixels.data;
	return function gris(x: number, y: number): number {
		if (x < 0) x = 0; else if (x > w - 1) x = w - 1;
		if (y < 0) y = 0; else if (y > h - 1) y = h - 1;
		return data[((y | 0) * w + (x | 0)) * 4];
	};
}
