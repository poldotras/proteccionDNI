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
	DatosFormato.Mascaras.forEach(DibujarRectangulo);

	if (Validez.checked)
		DatosFormato.DatosValidez.forEach(DibujarRectangulo);

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

/**
Sobre escribir texto en las zonas que se definan para el formato elegido
*/
function DibujarMarcaAgua() {
	const ctx = canvasWatermark.getContext('2d');
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	const texto = Watermark.value;
	// Si ha borrado todo el texto, no escribir nada
	if (!texto)
		return;

	FormatosDnis[Formato.value].Watermarks.forEach(marca => {
		const textoMarca = marca.mayusculas ? texto.toUpperCase() : texto;
		RellenarTexto(textoMarca, ctx, marca.fuente, marca.estilo, marca.bb.x, marca.bb.y, marca.bb.w, marca.bb.h, marca.angulo);
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

	// Dividir el texto en letras (con un separador final para repeticiones)
	const letras = (texto + ' - ').split('');
	const Metricas = MetricasLetras(ctx, fuente, letras);

	// recortar a la zona: las líneas cruzan los bordes y lo que sobresale queda cortado,
	// de forma que el relleno llega hasta el borde sin dejar huecos
	ctx.save();
	ctx.beginPath();
	ctx.rect(x, y, maxWidth, maxHeight);
	ctx.clip();

	const yFin = y + maxHeight;
	// la primera línea empieza pegada al borde superior
	y += metrics.fontBoundingBoxAscent;

	// bucle hasta rellenar toda la zona, vamos letra a letra
	let n = 0;
	let ancho = 0;
	while (true) {
		const letra = letras[n];
		// la onda avanza con la posición horizontal y se desfasa en cada linea
		const yOnda = y + amplitud * Math.sin((ancho * 2 * Math.PI) / longitudOnda + y);
		ctx.fillText(letra, x + ancho, yOnda);
		ancho += Metricas[letra];

		// una vez cruzado el borde derecho, bajamos a la línea siguiente
		if (ancho >= maxWidth) {
			y += lineHeight;
			// la última línea también cruza el borde inferior antes de parar
			if (y >= yFin + lineHeight)
				break;

			ancho = 0;
		}

		// cuando llegamos al final del texto, reseteamos para volver a empezar
		if (n === letras.length - 1)
			n = 0;
		else
			n++;
	}

	ctx.restore();
}
