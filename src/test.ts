/**
 * Página de pruebas: descarga la estructura del editor desde editor.html para no
 * duplicarla, carga los módulos del editor una vez inyectada y añade la galería
 * de DNIs de ejemplo y un panel con las coordenadas de los 4 puntos.
 * Necesita un servidor web (no funciona abriendo el fichero directamente).
 */
import './estilos.css';
import './test.css';

async function iniciar(): Promise<void> {
	const html = await (await fetch('editor.html')).text();
	// quitar el noscript antes de parsear: DOMParser interpretaría su <style> interno
	const doc = new DOMParser().parseFromString(html.replace(/<noscript>[\s\S]*?<\/noscript>/g, ''), 'text/html');

	// inyectar la sección del editor y el bloque oculto con las respuestas de ayuda
	const contenedor = document.getElementById('ContenedorEditor')!;
	contenedor.appendChild(doc.getElementById('pasos')!);
	contenedor.appendChild(doc.querySelector('main > div.Oculto')!);

	// ahora que el DOM del editor existe, cargar sus módulos (su código de
	// inicialización se ejecuta al importarlos y necesita ese DOM presente)
	const [app, editorEsquinas, dom, { estado }] = await Promise.all([
		import('./app'),
		import('./editorEsquinas'),
		import('./dom'),
		import('./estado'),
	]);

	ActivarGaleria(app.ComenzarEdicion, dom.Formato, estado);
	ActivarPanelEsquinas(editorEsquinas.observarMarco, estado);
}

/**
 * Panel de depuración con las coordenadas de los 4 puntos, para poder comparar
 * dónde ha colocado las esquinas la detección y dónde deberían estar.
 * Se actualiza con cada redibujado del marco (detección, arrastre o giro).
 */
function ActivarPanelEsquinas(observarMarco: (cb: () => void) => void, estado: typeof import('./estado').estado): void {
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

function ActivarGaleria(
	comenzarEdicion: (img: HTMLImageElement) => void,
	Formato: HTMLSelectElement,
	estado: typeof import('./estado').estado,
): void {
	document.querySelectorAll<HTMLImageElement>('#Ejemplos img')
		.forEach(imagenDemo => {
			imagenDemo.title = imagenDemo.alt;
			imagenDemo.addEventListener('click', () => CambiarImagenTest(imagenDemo, comenzarEdicion, Formato, estado));
		});
}

function CambiarImagenTest(
	img: HTMLImageElement,
	comenzarEdicion: (img: HTMLImageElement) => void,
	Formato: HTMLSelectElement,
	estado: typeof import('./estado').estado,
): void {
	const actual = document.querySelector('.Elegida');
	if (actual)
		actual.classList.remove('Elegida');

	img.classList.add('Elegida');
	estado.nombreFichero = img.src;

	// si el nombre coincide con el de un formato, seleccionarlo automáticamente
	const match = /ejemplos\/(.*)\.webp/.exec(img.src);
	if (match) {
		Formato.value = match[1];
		Formato.dispatchEvent(new Event('change'));
	}

	comenzarEdicion(img);
}

iniciar().catch(function (error) {
	console.error(error);
	alert('No se ha podido cargar el editor.\r\nLa página de pruebas necesita un servidor web, no funciona abriendo el fichero directamente.');
});
