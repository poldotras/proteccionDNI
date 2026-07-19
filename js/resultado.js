/**
Copia protegida: redibujado del DNI enderezado con sus ajustes de posición,
las máscaras de censura y la marca de agua superpuesta.
*/
'use strict';

// canvas con las máscaras que tapan datos
const canvasMascara = document.createElement('canvas');
// canvas para la superposición de texto/marca de agua
const canvasWatermark = document.createElement('canvas');

[canvasMascara, canvasWatermark].forEach(function (capa) {
	capa.width = canvas.width;
	capa.height = canvas.height;
	Previsualizacion.appendChild(capa);
});

// Saber si tenemos pendiente un redibujo del DNI para no saturar la CPU/GPU
let redibujoDNIpendiente = false;

// Objeto para mantener caché de las métricas del texto sin recalcular
const CacheMetricas = {};

function RedibujarDNI() {
	if (imagenDNI_BN == null)
		return;

	if (redibujoDNIpendiente)
		return;

	redibujoDNIpendiente = true;
	requestAnimationFrame(RedibujarDNIEnRAF);
}

/**
Función que vamos a llamar con un throttle de requestAnimationFrame, colapsando multiples llamadas consecutivas.
Dibuja la zona de la tarjeta enderezada llenando el canvas, de forma que las
máscaras de censura (definidas sobre el canvas) caigan donde corresponde
*/
function RedibujarDNIEnRAF() {
	redibujoDNIpendiente = false;

	const ctx = canvas.getContext('2d', { alpha: false });
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const zona = tarjetaResultado ? ZonaConProporcion(tarjetaResultado) : ZonaPorDefecto();
	ctx.drawImage(imagenDNI_BN, zona.x, zona.y, zona.w, zona.h, 0, 0, canvas.width, canvas.height);
}

/**
Amplía la zona indicada hasta la proporción del canvas, centrando el exceso,
para poder mostrarla sin deformarla
*/
function ZonaConProporcion(zona) {
	const proporcion = canvas.width / canvas.height;
	let { x, y, w, h } = zona;

	if (w / h > proporcion) {
		const alto = w / proporcion;
		y -= (alto - h) / 2;
		h = alto;
	} else {
		const ancho = h * proporcion;
		x -= (ancho - w) / 2;
		w = ancho;
	}

	return { x, y, w, h };
}

/**
Sin tarjeta detectada se muestra un recorte centrado de la imagen con la proporción del canvas
*/
function ZonaPorDefecto() {
	const proporcion = canvas.width / canvas.height;
	let w = imagenDNI_BN.width;
	let h = w / proporcion;
	if (h > imagenDNI_BN.height) {
		h = imagenDNI_BN.height;
		w = h * proporcion;
	}
	return {
		x: (imagenDNI_BN.width - w) / 2,
		y: (imagenDNI_BN.height - h) / 2,
		w,
		h,
	};
}

/**
Rectángulos que se censuran en negro con el formato y las opciones actuales
*/
function BloquesCensurados() {
	const DatosFormato = FormatosDnis[Formato.value];
	const bloques = DatosFormato.Mascaras.slice();
	if (Validez.checked && DatosFormato.DatosValidez)
		bloques.push(...DatosFormato.DatosValidez);
	return bloques;
}

/** Ocultar las partes de la imagen que no hacen ninguna falta, dependerá del formato de DNI y el lado */
function DibujarMascara() {
	function DibujarRectangulo(bloque) {
		ctx.beginPath();
		ctx.roundRect(bloque.x, bloque.y, bloque.w, bloque.h, 5);
		ctx.fill();
	}
	const DatosFormato = FormatosDnis[Formato.value];

	const ctx = canvasMascara.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'black';
	BloquesCensurados().forEach(DibujarRectangulo);

	if (EnmascararDni.checked && DatosFormato.MascarasDni) {
		const bloquesDni = DatosFormato.MascarasDni;
		ctx.fillStyle = 'white';
		bloquesDni.forEach(DibujarRectangulo);

		let bloque = bloquesDni[0]
		if (bloque.h == 50)
			ctx.font = '74px sans-serif';
		else
			ctx.font = '82px sans-serif';
		ctx.fillStyle = 'black';
		ctx.fillText('***', bloque.x, bloque.y + bloque.h + 20);
		bloque = bloquesDni[1]
		ctx.fillText('**', bloque.x, bloque.y + bloque.h + 20);
	}
}

// Rotación de las marcas con angulo 'aleatorio': al azar entre -90º y 90º,
// distinta en cada carga de la página para que las copias no sean predecibles
const AnguloAleatorio = Math.round(Math.random() * 180) - 90;

// Puntos de "lupa" que amplían la marca de agua alrededor de posiciones al azar,
// deformando el texto de alrededor; como el ángulo, se sortean en cada carga
const Lupas = GenerarLupas();

// canvas auxiliar donde se dibuja cada pasada del texto antes de deformarla con las lupas
const canvasCapaMarcas = document.createElement('canvas');
canvasCapaMarcas.width = canvas.width;
canvasCapaMarcas.height = canvas.height;

/**
Sortear entre 5 y 7 lupas con posición, potencia de zoom y radio al azar.
Deben quedar separadas entre sí al menos el 90% de la suma de sus radios;
si una posición no cumple, se sortea otra (con un límite de intentos por si
el azar no deja sitio para todas)
*/
function GenerarLupas() {
	const cantidad = 5 + Math.floor(Math.random() * 3);
	const lupas = [];
	for (let intentos = 0; lupas.length < cantidad && intentos < 200; intentos++) {
		const lupa = {
			x: Math.random() * canvas.width,
			y: Math.random() * canvas.height,
			radio: 100 + Math.random() * 100,
			zoom: 1.5 + Math.random() * 0.5,
		};
		if (lupas.every(otra => Math.hypot(lupa.x - otra.x, lupa.y - otra.y) >= 0.9 * (lupa.radio + otra.radio)))
			lupas.push(lupa);
	}
	return lupas;
}

/**
Sobre escribir texto en las zonas que se definan para el formato elegido.
La marca debe verse también por encima de los campos censurados en negro,
así que se repite en blanco recortada a esos rectángulos, con la misma
onda, ángulo y lupas para que las líneas tengan continuidad
*/
function DibujarMarcaAgua() {
	const ctx = canvasWatermark.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const texto = Watermark.value;
	// Si ha borrado todo el texto, no escribir nada
	if (!texto)
		return;

	ctx.drawImage(CapaMarcas(texto), 0, 0);

	const bloques = BloquesCensurados();
	if (!bloques.length)
		return;

	const capaBlanca = CapaMarcas(texto, 'rgb(255 255 255 / 40%)');
	ctx.save();
	ctx.beginPath();
	bloques.forEach(bloque => ctx.roundRect(bloque.x, bloque.y, bloque.w, bloque.h, 5));
	ctx.clip();
	// dentro de los rectángulos solo queda el texto en blanco
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.drawImage(capaBlanca, 0, 0);
	ctx.restore();
}

/**
Dibujar una pasada del texto en la capa auxiliar y devolverla ya deformada por las lupas
*/
function CapaMarcas(texto, estilo) {
	const ctx = canvasCapaMarcas.getContext('2d');
	ctx.clearRect(0, 0, canvasCapaMarcas.width, canvasCapaMarcas.height);
	DibujarMarcas(ctx, texto, estilo);
	AplicarLupas(canvasCapaMarcas);
	return canvasCapaMarcas;
}

/**
Deformar la capa con el efecto de cada lupa: cada píxel dentro del radio toma
su color de una posición más cercana al centro (mapeo inverso), con la
ampliación máxima en el centro decayendo en gradiente hasta ninguna en el borde
*/
function AplicarLupas(capa) {
	const ctx = capa.getContext('2d');
	Lupas.forEach(function (lupa) {
		const x0 = Math.max(0, Math.floor(lupa.x - lupa.radio));
		const y0 = Math.max(0, Math.floor(lupa.y - lupa.radio));
		const x1 = Math.min(capa.width, Math.ceil(lupa.x + lupa.radio));
		const y1 = Math.min(capa.height, Math.ceil(lupa.y + lupa.radio));
		const w = x1 - x0;
		const h = y1 - y0;
		if (w <= 0 || h <= 0)
			return;

		const origen = ctx.getImageData(x0, y0, w, h);
		const destino = ctx.createImageData(w, h);
		const src = origen.data;
		const dst = destino.data;

		for (let py = 0; py < h; py++) {
			for (let px = 0; px < w; px++) {
				const dx = px + x0 - lupa.x;
				const dy = py + y0 - lupa.y;
				const distancia = Math.hypot(dx, dy);
				const i = (py * w + px) * 4;

				if (distancia >= lupa.radio) {
					dst[i] = src[i];
					dst[i + 1] = src[i + 1];
					dst[i + 2] = src[i + 2];
					dst[i + 3] = src[i + 3];
					continue;
				}

				const caida = 1 - (distancia / lupa.radio) ** 2;
				const factor = 1 + (lupa.zoom - 1) * caida * caida;
				MuestraBilineal(src, w, h, lupa.x + dx / factor - x0, lupa.y + dy / factor - y0, dst, i);
			}
		}
		ctx.putImageData(destino, x0, y0);
	});
}

/**
Copiar en dst[i] el color de la posición (sx, sy) con interpolación bilineal.
Se interpola con el color premultiplicado por el alfa para que los píxeles
transparentes no arrastren su color a los bordes de las letras
*/
function MuestraBilineal(src, w, h, sx, sy, dst, i) {
	const xBase = Math.min(Math.max(Math.floor(sx), 0), w - 1);
	const yBase = Math.min(Math.max(Math.floor(sy), 0), h - 1);
	const xSig = Math.min(xBase + 1, w - 1);
	const ySig = Math.min(yBase + 1, h - 1);
	const fx = Math.min(Math.max(sx - xBase, 0), 1);
	const fy = Math.min(Math.max(sy - yBase, 0), 1);

	let r = 0, g = 0, b = 0, a = 0;
	function Acumular(x, y, peso) {
		if (!peso)
			return;
		const j = (y * w + x) * 4;
		const alfa = src[j + 3] * peso;
		r += src[j] * alfa;
		g += src[j + 1] * alfa;
		b += src[j + 2] * alfa;
		a += alfa;
	}
	Acumular(xBase, yBase, (1 - fx) * (1 - fy));
	Acumular(xSig, yBase, fx * (1 - fy));
	Acumular(xBase, ySig, (1 - fx) * fy);
	Acumular(xSig, ySig, fx * fy);

	if (a) {
		dst[i] = r / a;
		dst[i + 1] = g / a;
		dst[i + 2] = b / a;
	}
	dst[i + 3] = a;
}

/**
Escribir las marcas de agua del formato actual, con un estilo opcional que
sustituye al del formato
*/
function DibujarMarcas(ctx, texto, estilo) {
	FormatosDnis[Formato.value].Watermarks.forEach(marca => {
		const textoMarca = marca.mayusculas ? texto.toUpperCase() : texto;
		const angulo = marca.angulo == 'aleatorio' ? AnguloAleatorio : marca.angulo;
		RellenarTexto(textoMarca, ctx, marca.fuente, estilo || marca.estilo, marca.bb.x, marca.bb.y, marca.bb.w, marca.bb.h, angulo);
	});
}

/**
Rellenar la finalidad con la fecha actual y el parámetro "para" si viene en la URL;
sin él, el campo queda vacío mostrando el ejemplo del placeholder
*/
function AsignarWatermarkPorDefecto(input) {
	const sp = new URLSearchParams(location.search)
	if (!sp.has('para'))
		return;

	const hoy = new Date();
	input.value = `Copia ${hoy.toISOString().substring(0, 10)} para ${sp.get('para')}`;
}

/**
Anchura de cada letra del texto con la fuente indicada, usando la caché global
*/
function MetricasLetras(ctx, fuente, letras) {
	let Metricas = CacheMetricas[fuente];
	if (!Metricas) {
		Metricas = {};
		CacheMetricas[fuente] = Metricas;
	}
	// validamos que todas las letras están en nuestra caché o las añadimos
	letras.forEach(letra => {
		if (Metricas[letra])
			return;
		Metricas[letra] = ctx.measureText(letra).width;
	});
	return Metricas;
}

/**
Escribir un texto en la zona delimitada haciendo wrap letra a letra y repitiendo hasta llenar.
Cada letra se desplaza verticalmente siguiendo una onda, lo que dificulta
borrar la marca de agua de forma automática y le da un aspecto distintivo.
Si se indica un ángulo (en grados), todo el texto se dibuja rotado sin salirse de la zona
*/
function RellenarTexto(texto, ctx, fuente, estilo, x, y, maxWidth, maxHeight, angulo) {
	if (angulo) {
		ctx.save();
		ctx.beginPath();
		ctx.rect(x, y, maxWidth, maxHeight);
		ctx.clip();

		// rotar alrededor del centro y rellenar un cuadrado del tamaño de la diagonal,
		// que una vez girado sigue tapando la zona entera
		ctx.translate(x + maxWidth / 2, y + maxHeight / 2);
		ctx.rotate(angulo * Math.PI / 180);
		const lado = Math.hypot(maxWidth, maxHeight);
		RellenarTexto(texto, ctx, fuente, estilo, -lado / 2, -lado / 2, lado, lado);

		ctx.restore();
		return;
	}
	ctx.font = fuente;
	ctx.fillStyle = estilo;

	// Calcular altura de linea con la fuente actual
	const metrics = ctx.measureText('A');
	const lineHeight = metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent;
	// parámetros de la onda: cuánto sube/baja cada letra y cada cuántos píxeles se repite
	const amplitud = lineHeight * 0.22;
	const longitudOnda = 250;
	const yMax = y + maxHeight - lineHeight - amplitud;

	// Dividir el texto en letras (con un separador final para repeticiones)
	const letras = (texto + ' - ').split('');
	const Metricas = MetricasLetras(ctx, fuente, letras);

	// bucle hasta rellenar toda la zona, vamos letra a letra
	let n = 0;
	let ancho = 0;
	while (true) {
		const letra = letras[n];
		// Medir la anchura que tendrá si añadimos esta letra
		const anchoLetra = Metricas[letra];
		// Si no cabe en la linea, bajamos a la siguiente y la letra se escribe allí
		if (ancho + anchoLetra > maxWidth && ancho > 0) {
			y += lineHeight;
			// cuando superemos el límite vertical paramos
			if (y >= yMax)
				return;

			ancho = 0;
			continue;
		}

		// la onda avanza con la posición horizontal y se desfasa en cada linea
		const yOnda = y + amplitud * Math.sin((ancho * 2 * Math.PI) / longitudOnda + y);
		ctx.fillText(letra, x + ancho, yOnda);
		ancho += anchoLetra;

		// cuando llegamos al final del texto, reseteamos para volver a empezar
		if (n === letras.length - 1)
			n = 0;
		else
			n++;
	}
}
