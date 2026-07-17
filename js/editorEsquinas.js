/**
Editor de esquinas sobre la imagen original: el marco con los 4 puntos arrastrables,
la lupa de precisión, los giros de 90º y la petición de enderezado al worker.
*/
'use strict';

// escala y desplazamiento con los que se muestra la imagen original dentro del editor de esquinas
let transformacionEditor = { escala: 1, x: 0, y: 0 };

// Control para no acumular peticiones de enderezado mientras se arrastran las esquinas
let enderezadoEnCurso = false;
let enderezadoPendiente = false;

function RectanguloAEsquinas(rect) {
	return [
		{ x: rect.x, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y },
		{ x: rect.x + rect.w, y: rect.y + rect.h },
		{ x: rect.x, y: rect.y + rect.h },
	];
}

function EsquinasPorDefecto() {
	const w = imagenOriginalBN.width;
	const h = imagenOriginalBN.height;
	return RectanguloAEsquinas({ x: w * 0.05, y: h * 0.05, w: w * 0.9, h: h * 0.9 });
}

/**
Comprueba que las 4 esquinas forman un cuadrilátero convexo en el orden esperado (sentido horario)
*/
function EsConvexo(esquinas) {
	for (let i = 0; i < 4; i++) {
		const a = esquinas[i];
		const b = esquinas[(i + 1) % 4];
		const c = esquinas[(i + 2) % 4];
		if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) <= 0)
			return false;
	}
	return true;
}

/**
Dibujar la imagen original en el editor y colocar el marco con las 4 esquinas
*/
function DibujarEditorEsquinas() {
	if (!imagenOriginalBN || !esquinasDNI)
		return;

	const ctx = canvasOriginal.getContext('2d', { alpha: false });
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, canvasOriginal.width, canvasOriginal.height);

	const imagen = imagenOriginalColor || imagenOriginalBN;
	const escala = Math.min(canvasOriginal.width / imagen.width, canvasOriginal.height / imagen.height);
	transformacionEditor = {
		escala,
		x: (canvasOriginal.width - imagen.width * escala) / 2,
		y: (canvasOriginal.height - imagen.height * escala) / 2,
	};
	ctx.drawImage(imagen, transformacionEditor.x, transformacionEditor.y, imagen.width * escala, imagen.height * escala);

	ActualizarMarcoEsquinas();
}

/**
Pasa un punto de coordenadas de la imagen original a coordenadas del canvas del editor
*/
function EsquinaAEditor(punto) {
	return {
		x: transformacionEditor.x + punto.x * transformacionEditor.escala,
		y: transformacionEditor.y + punto.y * transformacionEditor.escala,
	};
}

/**
Actualizar el polígono y los puntos arrastrables con la posición actual de las esquinas
*/
function ActualizarMarcoEsquinas() {
	const puntos = esquinasDNI.map(EsquinaAEditor);
	PoligonoEsquinas.setAttribute('points', puntos.map(p => p.x + ',' + p.y).join(' '));
	PoligonoEsquinas.classList.toggle('invalido', !EsConvexo(esquinasDNI));

	// se posicionan tanto los círculos visibles como sus zonas de toque ampliadas
	querySelector_Array('.esquina', MarcoEsquinas)
		.forEach(function (circulo) {
			const punto = puntos[circulo.dataset.indice];
			circulo.setAttribute('cx', punto.x);
			circulo.setAttribute('cy', punto.y);
		});
}

/**
Permitir arrastrar las 4 esquinas con ratón o dedo; al soltar se endereza la imagen.
Mientras se arrastra se muestra una lupa para colocar el punto con precisión.
*/
function configurarEditorEsquinas() {
	let indiceArrastre = null;

	MarcoEsquinas.addEventListener('pointerdown', function (ev) {
		const esquina = ev.target.closest('.esquina');
		if (!esquina || !esquinasDNI)
			return;

		indiceArrastre = parseInt(esquina.dataset.indice, 10);
		MarcoEsquinas.setPointerCapture(ev.pointerId);
		Lupa.style.display = 'block';
		ActualizarLupa(indiceArrastre);
		ev.stopPropagation();
		ev.preventDefault();
	});

	MarcoEsquinas.addEventListener('pointermove', function (ev) {
		if (indiceArrastre == null)
			return;

		// pasar de coordenadas de pantalla a coordenadas de la imagen original
		const bb = MarcoEsquinas.getBoundingClientRect();
		const x = (ev.clientX - bb.left) * canvasOriginal.width / bb.width;
		const y = (ev.clientY - bb.top) * canvasOriginal.height / bb.height;

		esquinasDNI[indiceArrastre] = {
			x: Math.min(Math.max((x - transformacionEditor.x) / transformacionEditor.escala, 0), imagenOriginalBN.width),
			y: Math.min(Math.max((y - transformacionEditor.y) / transformacionEditor.escala, 0), imagenOriginalBN.height),
		};
		ActualizarMarcoEsquinas();
		ActualizarLupa(indiceArrastre);
		ev.stopPropagation();
	});

	function soltar(ev) {
		if (indiceArrastre == null)
			return;

		indiceArrastre = null;
		Lupa.style.display = '';
		SolicitarEnderezado();
		ev.stopPropagation();
	}
	MarcoEsquinas.addEventListener('pointerup', soltar);
	MarcoEsquinas.addEventListener('pointercancel', soltar);
}

/**
Dibujar en la lupa la zona ampliada alrededor de la esquina que se está arrastrando,
con una cruz en el centro y las líneas del marco hacia las esquinas vecinas,
y colocarla junto al punto sin taparlo ni salirse del editor
*/
function ActualizarLupa(indice) {
	const punto = esquinasDNI[indice];
	const centro = Lupa.width / 2;

	// zona de la imagen original que se amplía, proporcional a su tamaño
	const lado = Math.max(80, Math.round(imagenOriginalBN.width * 0.08));
	const ampliacion = Lupa.width / lado;

	const ctx = Lupa.getContext('2d', { alpha: false });
	ctx.fillStyle = 'white';
	ctx.fillRect(0, 0, Lupa.width, Lupa.height);
	ctx.drawImage(imagenOriginalColor || imagenOriginalBN, punto.x - lado / 2, punto.y - lado / 2, lado, lado, 0, 0, Lupa.width, Lupa.height);

	// líneas del marco hacia las dos esquinas vecinas, para poder alinear con los bordes
	ctx.strokeStyle = 'rgb(13 110 253 / .8)';
	ctx.lineWidth = 3;
	[1, 3].forEach(function (salto) {
		const vecino = esquinasDNI[(indice + salto) % 4];
		ctx.beginPath();
		ctx.moveTo(centro, centro);
		ctx.lineTo(centro + (vecino.x - punto.x) * ampliacion, centro + (vecino.y - punto.y) * ampliacion);
		ctx.stroke();
	});

	// cruz de precisión en el centro
	ctx.strokeStyle = '#DC1E1E';
	ctx.lineWidth = 2;
	ctx.beginPath();
	ctx.moveTo(centro - 22, centro);
	ctx.lineTo(centro - 6, centro);
	ctx.moveTo(centro + 6, centro);
	ctx.lineTo(centro + 22, centro);
	ctx.moveTo(centro, centro - 22);
	ctx.lineTo(centro, centro - 6);
	ctx.moveTo(centro, centro + 6);
	ctx.lineTo(centro, centro + 22);
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(centro, centro, 6, 0, 2 * Math.PI);
	ctx.stroke();

	// colocar la lupa por encima del punto (o por debajo si no cabe), sin salirse del editor
	const anchoPct = 30; // debe coincidir con la anchura definida en el CSS
	const altoPct = anchoPct * canvasOriginal.width / canvasOriginal.height;
	const pe = EsquinaAEditor(punto);

	let izquierda = pe.x / canvasOriginal.width * 100 - anchoPct / 2;
	izquierda = Math.min(Math.max(izquierda, 0), 100 - anchoPct);

	let arriba = pe.y / canvasOriginal.height * 100 - altoPct - 8;
	if (arriba < 0)
		arriba = pe.y / canvasOriginal.height * 100 + 12;

	Lupa.style.left = izquierda + '%';
	Lupa.style.top = arriba + '%';
}

/**
Pide al worker enderezar la imagen con las esquinas actuales y actualiza la previsualización
*/
function AplicarEsquinas() {
	return EnviarAlWorker({ esquinas: esquinasDNI })
		.then(function (respuesta) {
			// el worker devuelve null si las esquinas no permiten calcular la transformación
			if (!respuesta.bitmap)
				return;

			imagenDNI_BN = respuesta.bitmap;
			tarjetaResultado = respuesta.tarjeta;
			RedibujarDNI();
		});
}

/**
Enderezar la imagen con las esquinas actuales, sin acumular peticiones si llegan más
mientras el worker está ocupado (por ejemplo al arrastrar una esquina rápidamente)
*/
function SolicitarEnderezado() {
	if (!esquinasDNI || !EsConvexo(esquinasDNI))
		return;

	if (enderezadoEnCurso) {
		enderezadoPendiente = true;
		return;
	}

	enderezadoEnCurso = true;
	AplicarEsquinas()
		.catch(error => console.error(error))
		.finally(function () {
			enderezadoEnCurso = false;
			if (enderezadoPendiente) {
				enderezadoPendiente = false;
				SolicitarEnderezado();
			}
		});
}

/**
Giros de 90º de la imagen original
*/
function configurarGiro() {
	querySelector_Array('.girar')
		.forEach(boton => boton.addEventListener('click', girarDNI));
}

function girarDNI(ev) {
	const giro = parseInt(ev.currentTarget.dataset.giro, 10);

	EnviarAlWorker({ girar: giro })
		.then(function (respuesta) {
			if (!respuesta.bitmap)
				return;

			const anchoPrevio = imagenOriginalBN.width;
			const altoPrevio = imagenOriginalBN.height;
			imagenOriginalBN = respuesta.bitmap;
			imagenOriginalColor = respuesta.bitmapColor || respuesta.bitmap;

			// girar también las esquinas, desplazando su orden para que
			// el punto 0 siga siendo el de arriba a la izquierda
			const giradas = esquinasDNI.map(p => giro > 0
				? { x: altoPrevio - p.y, y: p.x }
				: { x: p.y, y: anchoPrevio - p.x });
			esquinasDNI = giro > 0
				? [giradas[3], giradas[0], giradas[1], giradas[2]]
				: [giradas[1], giradas[2], giradas[3], giradas[0]];

			DibujarEditorEsquinas();
			SolicitarEnderezado();
		})
		.catch(error => console.error(error));
}
