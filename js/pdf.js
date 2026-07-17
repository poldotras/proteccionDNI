/**
Lectura de pdfs sin librerías externas: no se renderiza el documento, sino que
se extrae la imagen más grande incrustada en él, que en el caso típico (un
escaneo o foto del DNI guardada como pdf) es la propia foto del documento.
Se soportan imágenes JPEG (DCTDecode) y comprimidas con deflate (FlateDecode),
usando la API nativa DecompressionStream para estas últimas.
*/
'use strict';

function EsPdf(file) {
	return file.type == 'application/pdf' || /\.pdf$/i.test(file.name);
}

/**
Devuelve una promesa con la imagen más grande del pdf (un <img> o un canvas).
Falla si el pdf no contiene ninguna imagen que se pueda decodificar.
*/
async function ExtraerImagenPdf(buffer) {
	const bytes = new Uint8Array(buffer);
	// latin1 conserva un byte por carácter, por lo que los índices del texto
	// coinciden con los del binario y podemos buscar con las funciones de string
	const texto = new TextDecoder('latin1').decode(bytes);

	// localizar los objetos imagen, con su diccionario y sus datos
	const imagenes = [];
	let pos = 0;
	while ((pos = texto.indexOf('stream', pos)) != -1) {
		// no confundir con el cierre 'endstream'
		if (texto.slice(pos - 3, pos) == 'end') {
			pos += 6;
			continue;
		}

		const dic = texto.slice(texto.lastIndexOf('obj', pos), pos);
		const iniDatos = pos + (texto[pos + 6] == '\r' ? 8 : 7); // tras 'stream\r\n' o 'stream\n'
		let fin = texto.indexOf('endstream', iniDatos);
		if (fin == -1)
			break;
		pos = fin + 9;

		if (!/\/Subtype\s*\/Image/.test(dic))
			continue;

		const ancho = NumeroDelDiccionario(dic, 'Width');
		const alto = NumeroDelDiccionario(dic, 'Height');
		if (!ancho || !alto)
			continue;

		// quitar el salto de línea entre los datos y 'endstream'
		while (texto[fin - 1] == '\n' || texto[fin - 1] == '\r')
			fin--;

		imagenes.push({ dic, ancho, alto, datos: bytes.subarray(iniDatos, fin) });
	}

	// probar de mayor a menor tamaño hasta decodificar una (a igual tamaño, primero
	// las JPEG: las máscaras de transparencia que las acompañan suelen ser deflate)
	imagenes.sort((a, b) => (b.ancho * b.alto) - (a.ancho * a.alto) || /DCTDecode/.test(b.dic) - /DCTDecode/.test(a.dic));
	for (const imagen of imagenes) {
		try {
			if (/DCTDecode/.test(imagen.dic))
				return await ImagenJpeg(imagen.datos);
			if (/FlateDecode/.test(imagen.dic))
				return await ImagenFlate(imagen);
		} catch (error) {
			console.warn('Imagen del pdf descartada', error);
		}
	}

	throw new Error('El pdf no contiene ninguna imagen compatible');
}

function NumeroDelDiccionario(dic, clave) {
	const match = new RegExp('\\/' + clave + '\\s+(\\d+)').exec(dic);
	return match ? parseInt(match[1], 10) : 0;
}

/**
Los datos de una imagen DCTDecode son directamente un fichero JPEG
*/
function ImagenJpeg(datos) {
	return new Promise(function (resolve, reject) {
		const img = new Image;
		img.onload = function () {
			URL.revokeObjectURL(img.src);
			resolve(img);
		};
		img.onerror = function () {
			URL.revokeObjectURL(img.src);
			reject(new Error('JPEG no válido'));
		};
		img.src = URL.createObjectURL(new Blob([datos], { type: 'image/jpeg' }));
	});
}

/**
Imagen comprimida con deflate: píxeles en bruto que se vuelcan a un canvas.
Los canales y el predictor png no se leen del diccionario (el espacio de color
puede ser un objeto indirecto), se deducen del tamaño de los datos.
*/
async function ImagenFlate(imagen) {
	const flujo = new Blob([imagen.datos]).stream().pipeThrough(new DecompressionStream('deflate'));
	let bruto = new Uint8Array(await new Response(flujo).arrayBuffer());

	const { ancho, alto } = imagen;
	let canales = 0;
	let predictor = false;
	for (const c of [3, 1]) {
		if (bruto.length == ancho * alto * c) {
			canales = c;
			break;
		}
		// el predictor png añade un byte de filtro por fila
		if (bruto.length == alto * (ancho * c + 1)) {
			canales = c;
			predictor = true;
			break;
		}
	}

	// blanco y negro puro: 1 bit por píxel agrupado en bytes
	const bitonal = !canales && bruto.length == alto * Math.ceil(ancho / 8);
	if (!canales && !bitonal)
		throw new Error('Formato de píxeles no soportado');

	if (predictor)
		bruto = DesfiltrarPng(bruto, ancho * canales, alto, canales);

	const canvas = document.createElement('canvas');
	canvas.width = ancho;
	canvas.height = alto;
	const ctx = canvas.getContext('2d');
	const imgPixels = ctx.createImageData(ancho, alto);
	const d = imgPixels.data;

	for (let i = 0, j = 0; i < ancho * alto; i++, j += 4) {
		let r, g, b;
		if (bitonal) {
			const x = i % ancho;
			const byte = bruto[Math.floor(i / ancho) * Math.ceil(ancho / 8) + (x >> 3)];
			// en DeviceGray de 1 bit, 0 es negro y 1 es blanco
			r = g = b = (byte >> (7 - (x & 7))) & 1 ? 255 : 0;
		} else if (canales == 1) {
			r = g = b = bruto[i];
		} else {
			r = bruto[i * 3];
			g = bruto[i * 3 + 1];
			b = bruto[i * 3 + 2];
		}
		d[j] = r;
		d[j + 1] = g;
		d[j + 2] = b;
		d[j + 3] = 255;
	}

	ctx.putImageData(imgPixels, 0, 0);
	return canvas;
}

/**
Deshacer los filtros png por fila (predictor) que puede llevar un stream deflate
*/
function DesfiltrarPng(bruto, anchoFila, alto, canales) {
	const salida = new Uint8Array(anchoFila * alto);
	for (let y = 0; y < alto; y++) {
		const filtro = bruto[y * (anchoFila + 1)];
		const ini = y * (anchoFila + 1) + 1;
		const fila = y * anchoFila;
		for (let x = 0; x < anchoFila; x++) {
			const izq = x >= canales ? salida[fila + x - canales] : 0;
			const arriba = y > 0 ? salida[fila - anchoFila + x] : 0;
			const diag = y > 0 && x >= canales ? salida[fila - anchoFila + x - canales] : 0;
			let prediccion;
			switch (filtro) {
				case 1: prediccion = izq; break;
				case 2: prediccion = arriba; break;
				case 3: prediccion = (izq + arriba) >> 1; break;
				case 4: {
					// Paeth: el vecino más cercano a la estimación izq + arriba - diag
					const p = izq + arriba - diag;
					const pa = Math.abs(p - izq);
					const pb = Math.abs(p - arriba);
					const pc = Math.abs(p - diag);
					prediccion = pa <= pb && pa <= pc ? izq : (pb <= pc ? arriba : diag);
					break;
				}
				default: prediccion = 0;
			}
			salida[fila + x] = (bruto[ini + x] + prediccion) & 255;
		}
	}
	return salida;
}
