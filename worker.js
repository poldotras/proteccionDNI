'use strict'

function CodigoWorker() {
	/**
	* Convertir todo a blanco y negro.
	* Devuelve el recuadro donde se ha detectado el DNI, o null si no se ha podido detectar
	*/
	function ConvertirBN(canvas) {
		const w = canvas.width;
		const h = canvas.height;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });

		try {
			const imgPixels = ctx.getImageData(0, 0, w, h);
			for (let y = 0; y < imgPixels.height; y++) {
				for (let x = 0; x < imgPixels.width; x++) {
					const i = (y * 4) * imgPixels.width + x * 4;
					const avg = (imgPixels.data[i] + imgPixels.data[i + 1] + imgPixels.data[i + 2]) / 3;
					imgPixels.data[i] = avg;
					imgPixels.data[i + 1] = avg;
					imgPixels.data[i + 2] = avg;
				}
			}
			ctx.putImageData(imgPixels, 0, 0, 0, 0, imgPixels.width, imgPixels.height);

			return DetectarTarjeta(imgPixels);
		} catch (e) {
			// da error al usar imagen de prueba con file://
			return null;
		}
	}

	/**
	* Detectar el recuadro que ocupa el DNI buscando el contraste con el fondo (normalmente blanco).
	* Trabaja sobre los datos ya convertidos a escala de grises por ConvertirBN.
	* Devuelve el rectángulo que lo delimita o null si la detección no parece fiable.
	*/
	function DetectarTarjeta(imgPixels) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const data = imgPixels.data;

		// Estimar la luminosidad del fondo con la mediana de los píxeles de los bordes de la foto
		const muestras = [];
		const salto = 10;
		for (let x = 0; x < w; x += salto) {
			muestras.push(data[x * 4], data[((h - 1) * w + x) * 4]);
		}
		for (let y = 0; y < h; y += salto) {
			muestras.push(data[y * w * 4], data[(y * w + w - 1) * 4]);
		}
		muestras.sort((a, b) => a - b);
		const fondo = muestras[muestras.length >> 1];

		// Contar por filas y columnas cuántos píxeles contrastan con el fondo
		const umbral = 40;
		const filas = new Uint32Array(h);
		const columnas = new Uint32Array(w);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				if (Math.abs(data[(y * w + x) * 4] - fondo) > umbral) {
					filas[y]++;
					columnas[x]++;
				}
			}
		}

		// Buscar los límites del DNI descartando el ruido (filas/columnas con menos del 2% de píxeles con contraste)
		const minPorFila = w * 0.02;
		const minPorColumna = h * 0.02;
		let top = 0;
		while (top < h && filas[top] < minPorFila)
			top++;
		let bottom = h - 1;
		while (bottom > top && filas[bottom] < minPorFila)
			bottom--;
		let left = 0;
		while (left < w && columnas[left] < minPorColumna)
			left++;
		let right = w - 1;
		while (right > left && columnas[right] < minPorColumna)
			right--;

		const ancho = right - left + 1;
		const alto = bottom - top + 1;
		// si la zona detectada es demasiado pequeña, mejor no fiarse de la detección
		if (ancho < w * 0.2 || alto < h * 0.2)
			return null;

		return { x: left, y: top, w: ancho, h: alto };
	}

	// Si la imagen parece estar en vertical, girarla automáticamente por defecto
	function PonerHorizontal(img) {
		let width = img.width;
		let height = img.height;

		if (height > width) {
			const ancho = height;
			const alto = width;
			const canvasGiro = new OffscreenCanvas(ancho, alto);

			const ctxRotado = canvasGiro.getContext('2d');
			ctxRotado.clearRect(0, 0, ancho, alto);
			// save the unrotated context of the canvas so we can restore it later
			// the alternative is to untranslate & unrotate after drawing
			ctxRotado.save();

			// move to the center of the canvas
			ctxRotado.translate(ancho / 2, alto / 2);

			// rotate the canvas to the specified degrees
			ctxRotado.rotate(270 * Math.PI / 180);

			// draw the image
			// since the context is rotated, the image will be rotated also
			ctxRotado.drawImage(img, - width / 2, - height / 2);

			// we’re done with the rotating so restore the unrotated context
			ctxRotado.restore();

			return canvasGiro;
		}

		const canvas = new OffscreenCanvas(img.width, img.height);
		const ctxImagen = canvas.getContext('2d');
		ctxImagen.drawImage(img, 0, 0);
		return canvas;
	}

	function ReducirAnchura(canvas) {
		// Limitamos a un ancho máximo de 2000px para mejorar rendimiento posterior
		const anchoMaximo = 2000;
		if (canvas.width <= anchoMaximo)
			return canvas;

		const width = anchoMaximo;
		const height = anchoMaximo * canvas.height / canvas.width;

		const canvasEscalado = new OffscreenCanvas(width, height);
		const ctxImagen = canvasEscalado.getContext('2d');
		ctxImagen.drawImage(canvas, 0, 0, width, height);
		return canvasEscalado;
	}

	self.addEventListener('message', e => {
		const img = e.data.bitmap;

		const canvas = ReducirAnchura(PonerHorizontal(img));

		const tarjeta = ConvertirBN(canvas);

		const bitmap = canvas.transferToImageBitmap();
		self.postMessage({ bitmap, tarjeta });
	});
}

// https://gist.github.com/ahem/d19ee198565e20c6f5e1bcd8f87b3408
function createWorker(f) {
	return new Worker(URL.createObjectURL(new Blob([`(${f})()`])));
}

if (typeof window == 'undefined')
	CodigoWorker();
else
	procesadorDNI = createWorker(CodigoWorker)