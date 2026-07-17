/**
Encuadre automático de la copia protegida: calcula el zoom y los desplazamientos
para que la tarjeta llene el recuadro del resultado, y permite deshacer los
ajustes manuales volviendo a esos valores.
*/
'use strict';

// Valores de Zoom y desplazamiento calculados al encuadrar automáticamente el DNI en el recuadro
let posicionAutomatica = null;

// Límites por defecto de los controles de posición, para restaurarlos con cada foto nueva
const RangosPorDefecto = [Zoom, Horizontal, Vertical].map(control => ({ control, min: control.min, max: control.max }));

/**
Ajusta el zoom y los desplazamientos para encuadrar el DNI detectado en el recuadro de previsualización.
Si no se ha podido detectar la tarjeta, aplica el ajuste básico de escalado por anchura.
*/
function AjustarPosicionAutomatica(tarjeta) {
	posicionAutomatica = null;
	RangosPorDefecto.forEach(rango => {
		rango.control.min = rango.min;
		rango.control.max = rango.max;
	});

	if (tarjeta) {
		// escala para que la zona detectada llene el canvas sin márgenes,
		// de forma que las máscaras de censura caigan donde corresponde;
		// el control de Zoom se aplica sobre la anchura del canvas
		// (se redondea lo justo para que los valores sobrevivan el paso por los inputs de rango)
		const zoom = Math.round(Math.min(canvas.width / tarjeta.w, canvas.height / tarjeta.h) * imagenDNI_BN.width / canvas.width * 10000) / 10000;
		const escala = zoom * canvas.width / imagenDNI_BN.width;

		posicionAutomatica = {
			zoom,
			horizontal: Math.round((canvas.width - tarjeta.w * escala) / 2 - tarjeta.x * escala),
			vertical: Math.round((canvas.height - tarjeta.h * escala) / 2 - tarjeta.y * escala),
		};
	} else {
		// Vamos a intentar calcular si puede interesar hacer zoom y desplazar
		const altoEscalado = canvas.width * imagenDNI_BN.height / imagenDNI_BN.width;

		if (altoEscalado < canvas.height) {
			const zoom = Math.min(parseFloat(Zoom.max), Math.round(canvas.height / altoEscalado * 1000) / 1000);
			posicionAutomatica = {
				zoom,
				horizontal: Math.round((canvas.width - canvas.width * zoom) / 2),
				vertical: 0,
			};
		}
	}

	if (posicionAutomatica) {
		AsignarValorAmpliandoRango(Zoom, posicionAutomatica.zoom);
		AsignarValorAmpliandoRango(Horizontal, posicionAutomatica.horizontal);
		AsignarValorAmpliandoRango(Vertical, posicionAutomatica.vertical);
	}
}

/**
Asigna un valor a un control de rango ampliando sus límites si hace falta,
dejando holgura para que se pueda seguir ajustando a mano en ambas direcciones
*/
function AsignarValorAmpliandoRango(input, valor) {
	const holgura = (parseFloat(input.max) - parseFloat(input.min)) / 4;
	if (valor < parseFloat(input.min))
		input.min = valor - holgura;
	if (valor > parseFloat(input.max))
		input.max = valor + holgura;

	input.value = valor;
}

/**
Valor inicial de un control de posición, teniendo en cuenta el encuadre automático
*/
function ValorInicial(control) {
	if (posicionAutomatica) {
		switch (control) {
			case Zoom:
				return posicionAutomatica.zoom;
			case Horizontal:
				return posicionAutomatica.horizontal;
			case Vertical:
				return posicionAutomatica.vertical;
		}
	}
	return control.defaultValue;
}

/**
Vuelve a poner los controles de posición con los valores iniciales
*/
function ResetearControles() {
	[Rotacion, Horizontal, Vertical, Zoom].forEach(function (control) {
		control.value = ValorInicial(control);
	});
}

/**
El botón de deshacer solo se muestra cuando la posición difiere del encuadre automático
*/
function AjustarVisibilidadResetear() {
	const movido = [Rotacion, Horizontal, Vertical, Zoom]
		.some(control => control.value != ValorInicial(control));

	Resetear.style.display = movido ? '' : 'none';
}
