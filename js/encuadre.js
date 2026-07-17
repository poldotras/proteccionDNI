/**
Ajustes de posición de la copia protegida y su encuadre automático: calcula el zoom
y los desplazamientos para que la tarjeta llene el recuadro del resultado,
y permite deshacer los ajustes manuales volviendo a esos valores.
*/
'use strict';

// Ajustes con los que se dibuja la copia protegida: zoom sobre la anchura del canvas,
// desplazamientos en píxeles del canvas y rotación fina en grados.
// Los modifican el encuadre automático y los gestos táctiles.
const ajustesResultado = { zoom: 1, rotacion: 0, horizontal: 0, vertical: 0 };

// Valores de los ajustes calculados al encuadrar automáticamente el DNI en el recuadro
let posicionAutomatica = null;

// Límite del zoom que aplica el encuadre básico cuando no hay tarjeta detectada
const ZoomMaximoAutomatico = 3;

/**
Ajusta el zoom y los desplazamientos para encuadrar el DNI detectado en el recuadro de previsualización.
Si no se ha podido detectar la tarjeta, aplica el ajuste básico de escalado por anchura.
*/
function AjustarPosicionAutomatica(tarjeta) {
	posicionAutomatica = null;

	if (tarjeta) {
		// escala para que la zona detectada llene el canvas sin márgenes,
		// de forma que las máscaras de censura caigan donde corresponde;
		// el zoom se aplica sobre la anchura del canvas
		const zoom = Math.min(canvas.width / tarjeta.w, canvas.height / tarjeta.h) * imagenDNI_BN.width / canvas.width;
		const escala = zoom * canvas.width / imagenDNI_BN.width;

		posicionAutomatica = {
			zoom,
			horizontal: (canvas.width - tarjeta.w * escala) / 2 - tarjeta.x * escala,
			vertical: (canvas.height - tarjeta.h * escala) / 2 - tarjeta.y * escala,
		};
	} else {
		// Vamos a intentar calcular si puede interesar hacer zoom y desplazar
		const altoEscalado = canvas.width * imagenDNI_BN.height / imagenDNI_BN.width;

		if (altoEscalado < canvas.height) {
			const zoom = Math.min(ZoomMaximoAutomatico, canvas.height / altoEscalado);
			posicionAutomatica = {
				zoom,
				horizontal: (canvas.width - canvas.width * zoom) / 2,
				vertical: 0,
			};
		}
	}

	if (posicionAutomatica) {
		ajustesResultado.zoom = posicionAutomatica.zoom;
		ajustesResultado.horizontal = posicionAutomatica.horizontal;
		ajustesResultado.vertical = posicionAutomatica.vertical;
	}
}

/**
Valores de los ajustes sin cambios manuales: el encuadre automático si existe, o los neutros
*/
function AjustesIniciales() {
	return {
		zoom: posicionAutomatica ? posicionAutomatica.zoom : 1,
		rotacion: 0,
		horizontal: posicionAutomatica ? posicionAutomatica.horizontal : 0,
		vertical: posicionAutomatica ? posicionAutomatica.vertical : 0,
	};
}

/**
Vuelve a poner los ajustes de posición con los valores iniciales
*/
function ResetearAjustes() {
	Object.assign(ajustesResultado, AjustesIniciales());
}

/**
El botón de deshacer solo se muestra cuando la posición difiere del encuadre automático
*/
function AjustarVisibilidadResetear() {
	const iniciales = AjustesIniciales();
	const movido = Object.keys(iniciales)
		.some(clave => ajustesResultado[clave] != iniciales[clave]);

	Resetear.style.display = movido ? '' : 'none';
}
