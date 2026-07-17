/**
Gestos táctiles sobre la copia protegida: arrastre con un dedo para desplazar,
y pellizco con dos dedos para zoom y rotación fina.
https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events/Pinch_zoom_gestures
*/
'use strict';

// límites de los ajustes manuales por gestos
const ZoomMinimo = 0.2;
const ZoomMaximo = 10;
const RotacionMaxima = 10;

// punteros activos, para poder detectar gestos de dos dedos
const evCache = [];

// valores al empezar el gesto, para aplicar los cambios de forma relativa
let distanciaInicial;
let zoomInicial;
let anguloInicial;
let rotacionInicial;
let puntoInicial;
let desplazamientoInicial;
// escala con la que se está mostrando el canvas en pantalla, para convertir desplazamientos
let escalaImagen;

function initGestures() {
	const el = Previsualizacion;
	el.onpointerdown = pointerdownHandler;
	el.onpointermove = pointermoveHandler;

	// los eventos de soltar/cancelar/salir se tratan igual
	el.onpointerup = pointerupHandler;
	el.onpointercancel = pointerupHandler;
	el.onpointerout = pointerupHandler;
	el.onpointerleave = pointerupHandler;
}

/**
Calcula la distancia actual entre los dos dedos
*/
function CalcularDistancia() {
	const dx = evCache[1].clientX - evCache[0].clientX;
	const dy = evCache[1].clientY - evCache[0].clientY;
	return Math.sqrt(dx * dx + dy * dy);
}

/**
Calcula el ángulo entre los dos puntos de toque
*/
function CalcularAngulo() {
	const dx = evCache[1].clientX - evCache[0].clientX;
	const dy = evCache[1].clientY - evCache[0].clientY;
	return Math.atan2(dy, dx) * (180 / Math.PI);
}

function Limitar(valor, min, max) {
	return Math.min(max, Math.max(min, valor));
}

/**
Redibujar el resultado con los ajustes modificados por el gesto
*/
function AplicarGesto() {
	RedibujarDNI();
	AjustarVisibilidadResetear();
}

function pointerdownHandler(ev) {
	evCache.push(ev);

	if (evCache.length == 2) {
		// registrar datos iniciales para cambio de zoom y rotación
		distanciaInicial = CalcularDistancia();
		anguloInicial = CalcularAngulo();
		rotacionInicial = ajustesResultado.rotacion;
		zoomInicial = ajustesResultado.zoom;
	}
	if (evCache.length == 1)
		registrarUnPunto(ev);
}

function registrarUnPunto(ev) {
	puntoInicial = {
		x: ev.clientX,
		y: ev.clientY,
	}
	desplazamientoInicial = {
		x: ajustesResultado.horizontal,
		y: ajustesResultado.vertical,
	};
	escalaImagen = canvas.width / canvas.getBoundingClientRect().width;
}

function pointermoveHandler(ev) {
	// actualizar el registro de este puntero
	const index = evCache.findIndex(cachedEv => cachedEv.pointerId === ev.pointerId);
	evCache[index] = ev;

	// con dos dedos, pellizco para zoom y giro para rotación fina
	if (evCache.length === 2) {
		const cambioDistancia = CalcularDistancia() - distanciaInicial;
		ajustesResultado.zoom = Limitar(zoomInicial + cambioDistancia * 0.01, ZoomMinimo, ZoomMaximo);

		const cambioRotacion = CalcularAngulo() - anguloInicial;
		ajustesResultado.rotacion = Limitar(rotacionInicial + cambioRotacion, -RotacionMaxima, RotacionMaxima);

		AplicarGesto();
	}

	// con un dedo, desplazamiento horizontal/vertical
	if (evCache.length == 1) {
		ajustesResultado.horizontal = desplazamientoInicial.x + escalaImagen * (ev.clientX - puntoInicial.x);
		ajustesResultado.vertical = desplazamientoInicial.y + escalaImagen * (ev.clientY - puntoInicial.y);

		AplicarGesto();
	}
}

function pointerupHandler(ev) {
	// quitar este puntero del registro
	const index = evCache.findIndex(cachedEv => cachedEv.pointerId === ev.pointerId);
	evCache.splice(index, 1);

	if (evCache.length == 1)
		registrarUnPunto(evCache[0]);
}
