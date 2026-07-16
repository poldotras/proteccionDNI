'use strict'

function CodigoWorker() {
	// Proporción del canvas de previsualización (1000x625), que es también la proporción a la que se ajusta el DNI
	const ProporcionCanvas = 1.6;

	/**
	* Convertir todo a blanco y negro, modificando los píxeles directamente
	*/
	function ConvertirBN(imgPixels) {
		const data = imgPixels.data;
		for (let i = 0; i < data.length; i += 4) {
			const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
			data[i] = avg;
			data[i + 1] = avg;
			data[i + 2] = avg;
		}
	}

	/**
	* Estimar la luminosidad del fondo con la mediana de los píxeles de los bordes de la foto
	*/
	function EstimarFondo(imgPixels) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const data = imgPixels.data;

		const muestras = [];
		const salto = 10;
		for (let x = 0; x < w; x += salto) {
			muestras.push(data[x * 4], data[((h - 1) * w + x) * 4]);
		}
		for (let y = 0; y < h; y += salto) {
			muestras.push(data[y * w * 4], data[(y * w + w - 1) * 4]);
		}
		muestras.sort((a, b) => a - b);
		return muestras[muestras.length >> 1];
	}

	/**
	* Crear una máscara binaria a tamaño reducido marcando las zonas que contrastan con el fondo.
	* Al agrupar los píxeles en celdas se elimina de paso el ruido de píxeles sueltos.
	*/
	function CrearMascara(imgPixels, fondo) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const data = imgPixels.data;

		const factor = Math.max(1, Math.round(w / 500));
		const mw = Math.floor(w / factor);
		const mh = Math.floor(h / factor);
		const mascara = new Uint8Array(mw * mh);

		const umbral = 40;
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

	/**
	* Expandir la máscara para unir en un solo bloque los elementos impresos de la tarjeta
	*/
	function Dilatar(m, veces) {
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
	* Encontrar el mayor bloque de celdas conectadas de la máscara, que debería ser el DNI
	*/
	function MayorComponente(m) {
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
				const vecinos = [];
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
	* Buscar las 4 esquinas del bloque detectado: los puntos extremos en las 4 diagonales.
	* Funciona bien mientras la tarjeta no esté girada más de ~40º, que es lo esperable en una foto.
	*/
	function EsquinasComponente(m, etiquetas, mejor, dilataciones) {
		const { mw, mh, factor } = m;
		let tl, tr, br, bl;
		let minSuma = Infinity, maxSuma = -Infinity, minResta = Infinity, maxResta = -Infinity;

		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				if (etiquetas[y * mw + x] != mejor)
					continue;
				const suma = x + y;
				const resta = x - y;
				if (suma < minSuma) { minSuma = suma; tl = { x, y }; }
				if (suma > maxSuma) { maxSuma = suma; br = { x, y }; }
				if (resta > maxResta) { maxResta = resta; tr = { x, y }; }
				if (resta < minResta) { minResta = resta; bl = { x, y }; }
			}
		}

		// compensar la expansión de Dilatar, que desplaza las esquinas hacia fuera en diagonal
		const ajuste = dilataciones / 2;
		tl = { x: tl.x + ajuste, y: tl.y + ajuste };
		tr = { x: tr.x - ajuste, y: tr.y + ajuste };
		br = { x: br.x - ajuste, y: br.y - ajuste };
		bl = { x: bl.x + ajuste, y: bl.y - ajuste };

		// pasar de celdas de la máscara a coordenadas de la imagen
		return [tl, tr, br, bl].map(p => ({ x: (p.x + 0.5) * factor, y: (p.y + 0.5) * factor }));
	}

	function Distancia(p1, p2) {
		return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
	}

	/**
	* Comprobar que las 4 esquinas forman un cuadrilátero convexo con la pinta de un DNI en una foto.
	* Devuelve null si no es fiable; el recuadro que lo delimita si ya está recto,
	* y además las esquinas si merece la pena enderezarlo con corrección de perspectiva.
	*/
	function ValidarEsquinas(esquinas, w, h) {
		const [tl, tr, br, bl] = esquinas;

		const minX = Math.min(tl.x, tr.x, br.x, bl.x);
		const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
		const minY = Math.min(tl.y, tr.y, br.y, bl.y);
		const maxY = Math.max(tl.y, tr.y, br.y, bl.y);
		const tarjeta = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

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

		// los lados opuestos deben ser parecidos y la proporción similar a la de un DNI apaisado;
		// si no, aplicamos solo el encuadre sin corregir la perspectiva
		const proporcion = (arriba + abajo) / (izquierda + derecha);
		if (Math.min(arriba, abajo) / Math.max(arriba, abajo) < 0.6 ||
			Math.min(izquierda, derecha) / Math.max(izquierda, derecha) < 0.6 ||
			proporcion < 1.1 || proporcion > 2.4)
			return { tarjeta };

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

		return { tarjeta, esquinas };
	}

	/**
	* Detectar el DNI buscando el contraste con el fondo (normalmente blanco).
	* Devuelve null si no hay detección fiable, o un objeto con el recuadro que delimita la tarjeta
	* y sus 4 esquinas si además conviene corregir la perspectiva.
	*/
	function DetectarTarjeta(imgPixels) {
		const fondo = EstimarFondo(imgPixels);
		const m = CrearMascara(imgPixels, fondo);

		const dilataciones = 4;
		Dilatar(m, dilataciones);

		const { etiquetas, mejor, tam } = MayorComponente(m);
		// exigir un tamaño mínimo del 4% de la imagen para descartar detecciones espurias
		if (!mejor || tam < m.mw * m.mh * 0.04)
			return null;

		const esquinas = EsquinasComponente(m, etiquetas, mejor, dilataciones);
		return ValidarEsquinas(esquinas, imgPixels.width, imgPixels.height);
	}

	/**
	* Resolver un sistema de ecuaciones lineales por eliminación de Gauss-Jordan con pivote parcial
	*/
	function ResolverSistema(A, b) {
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

	/**
	* Calcular la transformación de perspectiva (homografía) que lleva cada punto de destino a su origen
	*/
	function ResolverHomografia(destino, origen) {
		const A = [];
		const b = [];
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
	function EnderezarTarjeta(imgPixels, esquinas) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const [tl, tr, br, bl] = esquinas;

		// rectángulo destino: la anchura media de la tarjeta detectada con la proporción del canvas,
		// centrado donde está la tarjeta pero sin salirse de la imagen
		let wDest = (Distancia(tl, tr) + Distancia(bl, br)) / 2;
		wDest = Math.min(wDest, w * 0.98, h * ProporcionCanvas * 0.98);
		const hDest = wDest / ProporcionCanvas;

		let cx = (tl.x + tr.x + br.x + bl.x) / 4;
		let cy = (tl.y + tr.y + br.y + bl.y) / 4;
		cx = Math.min(Math.max(cx, wDest / 2), w - wDest / 2);
		cy = Math.min(Math.max(cy, hDest / 2), h - hDest / 2);

		const destino = [
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
		const ctx = canvas.getContext('2d', { willReadFrequently: true });

		let tarjeta = null;
		try {
			let imgPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
			ConvertirBN(imgPixels);

			const deteccion = DetectarTarjeta(imgPixels);
			if (deteccion) {
				tarjeta = deteccion.tarjeta;
				// si la tarjeta está torcida, enderezarla con corrección de perspectiva
				if (deteccion.esquinas) {
					const enderezado = EnderezarTarjeta(imgPixels, deteccion.esquinas);
					if (enderezado) {
						imgPixels = enderezado.imgPixels;
						tarjeta = enderezado.tarjeta;
					}
				}
			}

			ctx.putImageData(imgPixels, 0, 0);
		} catch (e) {
			// getImageData da error al usar imagen de prueba con file://
		}

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