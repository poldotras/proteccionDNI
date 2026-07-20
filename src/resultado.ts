/**
 * Copia protegida: redibujado del DNI enderezado y las máscaras de censura.
 * La marca de agua que se superpone está en marcaAgua.ts.
 */
import { canvas, Previsualizacion, Formato, Validez, EnmascararDni } from './dom';
import { estado } from './estado';
import { FormatosDnis } from './formatos';
import type { Rectangulo } from './tipos';

// canvas con las máscaras que tapan datos
export const canvasMascara = document.createElement('canvas');
canvasMascara.width = canvas.width;
canvasMascara.height = canvas.height;
Previsualizacion.appendChild(canvasMascara);

// Saber si tenemos pendiente un redibujo del DNI para no saturar la CPU/GPU
let redibujoDNIpendiente = false;

export function RedibujarDNI(): void {
	if (estado.imagenDNI_BN == null)
		return;

	if (redibujoDNIpendiente)
		return;

	redibujoDNIpendiente = true;
	requestAnimationFrame(RedibujarDNIEnRAF);
}

/**
 * Función que vamos a llamar con un throttle de requestAnimationFrame, colapsando multiples llamadas consecutivas.
 * Dibuja la zona de la tarjeta enderezada llenando el canvas, de forma que las
 * máscaras de censura (definidas sobre el canvas) caigan donde corresponde
 */
function RedibujarDNIEnRAF(): void {
	redibujoDNIpendiente = false;
	if (!estado.imagenDNI_BN)
		return;

	const ctx = canvas.getContext('2d', { alpha: false })!;
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	const zona = estado.tarjetaResultado ? ZonaConProporcion(estado.tarjetaResultado) : ZonaPorDefecto();
	ctx.drawImage(estado.imagenDNI_BN, zona.x, zona.y, zona.w, zona.h, 0, 0, canvas.width, canvas.height);
}

/**
 * Amplía la zona indicada hasta la proporción del canvas, centrando el exceso,
 * para poder mostrarla sin deformarla
 */
function ZonaConProporcion(zona: Rectangulo): Rectangulo {
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

/** Sin tarjeta detectada se muestra un recorte centrado de la imagen con la proporción del canvas */
function ZonaPorDefecto(): Rectangulo {
	const imagen = estado.imagenDNI_BN!;
	const proporcion = canvas.width / canvas.height;
	let w = imagen.width;
	let h = w / proporcion;
	if (h > imagen.height) {
		h = imagen.height;
		w = h * proporcion;
	}
	return {
		x: (imagen.width - w) / 2,
		y: (imagen.height - h) / 2,
		w,
		h,
	};
}

/** Rectángulos que se censuran en negro con el formato y las opciones actuales */
export function BloquesCensurados(): Rectangulo[] {
	const DatosFormato = FormatosDnis[Formato.value];
	const bloques = DatosFormato.Mascaras.slice();
	if (Validez.checked && DatosFormato.DatosValidez)
		bloques.push(...DatosFormato.DatosValidez);
	return bloques;
}

/** Ocultar las partes de la imagen que no hacen ninguna falta, dependerá del formato de DNI y el lado */
export function DibujarMascara(): void {
	const DatosFormato = FormatosDnis[Formato.value];

	const ctx = canvasMascara.getContext('2d')!;
	function DibujarRectangulo(bloque: Rectangulo): void {
		ctx.beginPath();
		ctx.roundRect(bloque.x, bloque.y, bloque.w, bloque.h, 5);
		ctx.fill();
	}
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = 'black';
	BloquesCensurados().forEach(DibujarRectangulo);

	if (EnmascararDni.checked && DatosFormato.MascarasDni) {
		const bloquesDni = DatosFormato.MascarasDni;
		ctx.fillStyle = 'white';
		bloquesDni.forEach(DibujarRectangulo);

		let bloque = bloquesDni[0];
		if (bloque.h == 50)
			ctx.font = '74px sans-serif';
		else
			ctx.font = '82px sans-serif';
		ctx.fillStyle = 'black';
		ctx.fillText('***', bloque.x, bloque.y + bloque.h + 20);
		bloque = bloquesDni[1];
		ctx.fillText('**', bloque.x, bloque.y + bloque.h + 20);
	}
}
