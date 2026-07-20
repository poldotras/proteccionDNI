/**
 * Punto de entrada de la página de pruebas: reutiliza el editor (su marcado se
 * incluye en la plantilla, no se inyecta por JS) y añade la galería de DNIs de
 * ejemplo y un panel con las coordenadas de los 4 puntos para depurar la detección.
 */
import '../test.css';
import { ComenzarEdicion } from './editor';
import { observarMarco } from './esquinas';
import { Formato } from './dom';
import { estado } from './estado';

/**
 * Panel con las coordenadas de los 4 puntos, para comparar dónde ha colocado
 * las esquinas la detección y dónde deberían estar. Se actualiza en cada
 * redibujado del marco (detección, arrastre o giro).
 */
function ActivarPanelEsquinas(): void {
	const panel = document.createElement('div');
	panel.id = 'CoordenadasEsquinas';
	document.getElementById('ZonaGuardar')!.before(panel);

	const nombres = ['arriba-izquierda', 'arriba-derecha', 'abajo-derecha', 'abajo-izquierda'];
	observarMarco(function MostrarCoordenadas() {
		if (!estado.esquinasDNI)
			return;

		const tamano = estado.imagenOriginalBN ? ` (imagen de ${estado.imagenOriginalBN.width}×${estado.imagenOriginalBN.height})` : '';
		panel.textContent = 'Esquinas' + tamano + ': ' + estado.esquinasDNI
			.map((p, i) => nombres[i] + ' ' + Math.round(p.x) + ',' + Math.round(p.y))
			.join(' | ');
	});
}

function ActivarGaleria(): void {
	document.querySelectorAll<HTMLImageElement>('#Ejemplos img').forEach(imagen => {
		imagen.title = imagen.alt;
		imagen.addEventListener('click', () => CargarEjemplo(imagen));
	});
}

function CargarEjemplo(img: HTMLImageElement): void {
	document.querySelector('.Elegida')?.classList.remove('Elegida');
	img.classList.add('Elegida');
	estado.nombreFichero = img.src;

	// si el nombre coincide con el de un formato, seleccionarlo automáticamente
	const match = /ejemplos\/(.*)\.webp/.exec(img.src);
	if (match) {
		Formato.value = match[1];
		Formato.dispatchEvent(new Event('change'));
	}

	ComenzarEdicion(img);
}

ActivarGaleria();
ActivarPanelEsquinas();
