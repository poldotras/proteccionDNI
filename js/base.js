/**
Referencias a los elementos de la página, estado compartido entre el resto
de ficheros y pequeñas utilidades genéricas.
Debe cargarse antes que los demás ficheros de js/.
*/
'use strict';

window.onerror = (a, b, c, d, e) => {
	console.log(`Error message: ${a}`, `lineno: ${c}`, `colno: ${d}`);
	console.error(e);

	alert(`Error inesperado: ${a}`)
};

//////////////////////////////////////
//
// Referencias a los elementos de la página
//
//////////////////////////////////////

const Previsualizacion = document.getElementById('Previsualizacion');
// canvas donde dibujamos el DNI enderezado con los ajustes de posición
const canvas = document.getElementById('canvas');

// canvas del editor de esquinas con la imagen original y sus elementos
const canvasOriginal = document.getElementById('canvasOriginal');
const MarcoEsquinas = document.getElementById('MarcoEsquinas');
const PoligonoEsquinas = document.getElementById('PoligonoEsquinas');
const Lupa = document.getElementById('Lupa');

const SelectorFichero = document.getElementById('SelectorFichero');
const Formato = document.getElementById('Formato');
const Watermark = document.getElementById('Watermark');
const EnmascararDni = document.getElementById('EnmascararDni');
const DivMascaraDni = document.getElementById('DivMascaraDni');
const Validez = document.getElementById('Validez');
const DivValidez = document.getElementById('DivValidez');
const botonGrabar = document.getElementById('Guardar');
const Resetear = document.getElementById('Resetear');

// controles ocultos que guardan los ajustes de posición del resultado;
// se modifican con los gestos táctiles y el encuadre automático
const Rotacion = document.getElementById('Rotacion');
const Horizontal = document.getElementById('Horizontal');
const Vertical = document.getElementById('Vertical');
const Zoom = document.getElementById('Zoom');

//////////////////////////////////////
//
// Estado compartido
//
//////////////////////////////////////

// Imagen del DNI a escala 1:1 y en blanco y negro que se muestra como resultado.
// Si se ha aplicado la corrección de perspectiva, contiene ya la imagen enderezada
let imagenDNI_BN = null;

// Imagen original en blanco y negro sin enderezar, la que se muestra en el editor de esquinas
let imagenOriginalBN = null;

// Las 4 esquinas del DNI sobre la imagen original, en orden: sup-izda, sup-dcha, inf-dcha, inf-izda
let esquinasDNI = null;

// Nombre del fichero elegido, para generar el nombre de la copia protegida
let nombreFichero = '';

//////////////////////////////////////
//
// Utilidades
//
//////////////////////////////////////

/**
Detecta click o que activamos un elemento mediante el teclado con espacio o la tecla de enter
*/
function activarClickConTeclado(elmto, callback) {
	elmto.tabIndex = '0';
	elmto.addEventListener('keydown', function (ev) {
		if (ev.key == 'Enter' || ev.key == ' ')
			callback(ev.currentTarget, ev);
	});
	elmto.addEventListener('click', ev => callback(ev.currentTarget, ev));
}

/**
Asigna un valor a un input y dispara sus eventos como si lo hubiera cambiado el usuario
*/
function ActualizarValorInput(input, value) {
	input.value = value;
	input.dispatchEvent(new Event('input'));
	input.dispatchEvent(new Event('change'));
}

/**
Returns an Array with the result of a querySelectorAll call (a NodeList)
*/
function querySelector_Array(selector, root) {
	return [].slice.call((root || document).querySelectorAll(selector));
}
