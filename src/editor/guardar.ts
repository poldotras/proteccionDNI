/**
 * Generación de la imagen final combinando las capas, y su descarga o compartición.
 */
import { canvas } from './dom';
import { estado } from './estado';
import { canvasMascara } from './resultado';
import { canvasWatermark } from './marcaAgua';

// canvas donde se compone la imagen a descargar
const canvaComposicion = document.createElement('canvas');
canvaComposicion.width = canvas.width;
canvaComposicion.height = canvas.height;

/** Combinar los 3 canvas parciales (imagen, máscaras y marca de agua) en una sola imagen */
function ComponerImagen(): void {
	const ctx = canvaComposicion.getContext('2d')!;
	ctx.drawImage(canvas, 0, 0);
	ctx.drawImage(canvasMascara, 0, 0);
	ctx.drawImage(canvasWatermark, 0, 0);
}

/** Toma el nombre de fichero actual y lo devuelve añadiendo el sufijo ' - protegido.jpg' */
function GenerarNombreFichero(): string {
	const match = estado.nombreFichero.match(/([^/\\]+)(?=\.[^.]+$)/);
	if (match)
		return match[1] + ' - protegido.jpg';

	return 'protegido.jpg';
}

export function GrabarImagen(): void {
	ComponerImagen();

	const link = document.getElementById('grabar') as HTMLAnchorElement;
	link.download = GenerarNombreFichero();
	try {
		link.href = canvaComposicion.toDataURL('image/jpeg', 0.8);
		link.click();
	} catch (e) {
		alert('No se ha podido generar la imagen\r\n' + e);
	}
}

/** Activar el botón de compartir si el navegador soporta compartir ficheros (Firefox no lo tiene implementado) */
export function configurarCompartir(): void {
	const btnCompartir = document.getElementById('Compartir')!;

	if (typeof navigator.share == 'undefined' || !navigator.canShare({
		files: [new File([''], 'test.jpg', { type: 'image/jpeg' })],
	})) {
		btnCompartir.remove();
		return;
	}

	btnCompartir.addEventListener('click', async () => {
		ComponerImagen();

		let dataUrl: string;
		try {
			dataUrl = canvaComposicion.toDataURL('image/jpeg', 0.8);
		} catch (e) {
			alert('No se ha podido generar la imagen\r\n' + e);
			return;
		}

		let blob: Blob;
		try {
			blob = await (await fetch(dataUrl)).blob();
		} catch (e) {
			alert('Error convirtiendo la imagen\r\n' + e);
			return;
		}
		const file = new File([blob], GenerarNombreFichero(), { type: 'image/jpeg' });
		try {
			await navigator.share({
				title: 'Copia de mi DNI',
				text: 'Adjunto la copia de mi DNI para su uso exclusivo',
				files: [file],
			});
		} catch (err) {
			alert('Error: ' + err);
		}
	});
}
