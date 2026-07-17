/**
Código específico para la página de pruebas
*/
'use strict';

querySelector_Array('#Ejemplos img')
	.forEach(imagenDemo => {
		imagenDemo.title = imagenDemo.alt;
		imagenDemo.addEventListener('click', CambiarImagenTest);
	});

function CambiarImagenTest(ev) {
	const actual = document.querySelector('.Elegida');
	if (actual)
		actual.classList.remove('Elegida');

	const img = ev.target;
	img.classList.add('Elegida');

	nombreFichero = img.src;

	MostrarEdicion();
	tarjetaResultado = null;

	// si el nombre coincide con el de un formato, seleccionarlo automáticamente
	const match = /ejemplos\/(.*)\.webp/.exec(img.src);
	if (match) {
		ActualizarValorInput(Formato, match[1]);
	}

	if (nombreFichero.startsWith('file:')) {
		// sin servidor web no funciona el worker, se usa la imagen tal cual sin procesar
		const canvasTmp = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
		canvasTmp.getContext('2d').drawImage(img, 0, 0);

		imagenDNI_BN = canvasTmp.transferToImageBitmap();
		imagenOriginalBN = imagenDNI_BN;
		esquinasDNI = EsquinasPorDefecto();
		DibujarEditorEsquinas();

		RedibujarDNI();
	} else {
		PrepararDNI(img)
			.then(() => RedibujarDNI());
	}

	DibujarMascara();
	DibujarMarcaAgua();
}
