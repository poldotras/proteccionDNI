'use strict'

function CodigoWorker() {
	// Proporción del canvas de previsualización (1000x625), que es también la proporción a la que se ajusta el DNI
	const ProporcionCanvas = 1.6;

	/**
	* Convertir todo a blanco y negro, modificando los píxeles directamente
	*/
	function ConvertirBN(imgPixels) {
		const data = imgPixels.data;
		for (let i = 0; i < data.length; i += 4) {
			const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
			data[i] = avg;
			data[i + 1] = avg;
			data[i + 2] = avg;
		}
	}

	function Mediana(muestras) {
		muestras.sort((a, b) => a - b);
		return muestras[muestras.length >> 1];
	}

	/**
	* Posibles luminosidades del fondo: la mediana de las 4 esquinas de la foto
	* (robusta con encuadres ajustados, donde los bordes los ocupa la tarjeta) y la
	* mediana de los bordes (mejor cuando las esquinas caen en otra superficie).
	* Se devuelven sin repetir para que la detección pruebe con cada una.
	*/
	function FondosCandidatos(imgPixels) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const data = imgPixels.data;

		const lado = Math.round(Math.min(w, h) * 0.08);
		const esquinas = [];
		[[0, 0], [w - lado, 0], [0, h - lado], [w - lado, h - lado]].forEach(function ([x0, y0]) {
			for (let y = y0; y < y0 + lado; y += 2) {
				for (let x = x0; x < x0 + lado; x += 2)
					esquinas.push(data[(y * w + x) * 4]);
			}
		});

		const bordes = [];
		const salto = 10;
		for (let x = 0; x < w; x += salto) {
			bordes.push(data[x * 4], data[((h - 1) * w + x) * 4]);
		}
		for (let y = 0; y < h; y += salto) {
			bordes.push(data[y * w * 4], data[(y * w + w - 1) * 4]);
		}

		const fondos = [Mediana(esquinas)];
		const porBordes = Mediana(bordes);
		if (Math.abs(porBordes - fondos[0]) > 12)
			fondos.push(porBordes);

		// percentil alto de todas las muestras: rescata fondos claros cuyo tono baja
		// en las esquinas por el viñeteado de la cámara
		const todas = esquinas.concat(bordes).sort((a, b) => a - b);
		const claro = todas[Math.floor(todas.length * 0.85)];
		if (fondos.every(fondo => Math.abs(claro - fondo) > 12))
			fondos.push(claro);
		return fondos;
	}

	/**
	* Crear una máscara binaria a tamaño reducido marcando las zonas que contrastan con el fondo.
	* Al agrupar los píxeles en celdas se elimina de paso el ruido de píxeles sueltos.
	*/
	function CrearMascara(imgPixels, fondo, umbral) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const data = imgPixels.data;

		const factor = Math.max(1, Math.round(w / 500));
		const mw = Math.floor(w / factor);
		const mh = Math.floor(h / factor);
		const mascara = new Uint8Array(mw * mh);
		// una celda se activa si al menos el 10% de sus píxeles contrastan con el fondo
		const minCuenta = Math.max(1, factor * factor * 0.1);
		for (let my = 0; my < mh; my++) {
			for (let mx = 0; mx < mw; mx++) {
				let cuenta = 0;
				for (let y = my * factor; y < (my + 1) * factor; y++) {
					const base = y * w;
					for (let x = mx * factor; x < (mx + 1) * factor; x++) {
						if (Math.abs(data[(base + x) * 4] - fondo) > umbral)
							cuenta++;
					}
				}
				mascara[my * mw + mx] = cuenta >= minCuenta ? 1 : 0;
			}
		}

		return { mascara, mw, mh, factor };
	}

	/**
	* Expandir la máscara para unir en un solo bloque los elementos impresos de la tarjeta
	*/
	function Dilatar(m, veces) {
		const { mw, mh } = m;
		let mascara = m.mascara;
		for (let v = 0; v < veces; v++) {
			const salida = new Uint8Array(mascara);
			for (let y = 0; y < mh; y++) {
				for (let x = 0; x < mw; x++) {
					const p = y * mw + x;
					if (mascara[p])
						continue;
					if ((x > 0 && mascara[p - 1]) || (x < mw - 1 && mascara[p + 1]) ||
						(y > 0 && mascara[p - mw]) || (y < mh - 1 && mascara[p + mw]))
						salida[p] = 1;
				}
			}
			mascara = salida;
		}
		m.mascara = mascara;
	}

	/**
	* Encoger la máscara: borra los trazos finos (letras o líneas del fondo)
	* conservando los bloques sólidos como la tarjeta
	*/
	function Erosionar(m, veces) {
		const { mw, mh } = m;
		let mascara = m.mascara;
		for (let v = 0; v < veces; v++) {
			const salida = new Uint8Array(mascara);
			for (let y = 0; y < mh; y++) {
				for (let x = 0; x < mw; x++) {
					const p = y * mw + x;
					if (!mascara[p])
						continue;
					if (x == 0 || !mascara[p - 1] || x == mw - 1 || !mascara[p + 1] ||
						y == 0 || !mascara[p - mw] || y == mh - 1 || !mascara[p + mw])
						salida[p] = 0;
				}
			}
			mascara = salida;
		}
		m.mascara = mascara;
	}

	/**
	* Encontrar el mayor bloque de celdas conectadas de la máscara, que debería ser el DNI
	*/
	function MayorComponente(m) {
		const { mascara, mw, mh } = m;
		const etiquetas = new Int32Array(mw * mh);
		const pila = new Int32Array(mw * mh);
		let mejor = 0;
		let mejorTam = 0;
		let etiqueta = 0;

		for (let i = 0; i < mascara.length; i++) {
			if (!mascara[i] || etiquetas[i])
				continue;

			etiqueta++;
			let tam = 0;
			let np = 0;
			pila[np++] = i;
			etiquetas[i] = etiqueta;
			while (np > 0) {
				const p = pila[--np];
				tam++;
				const x = p % mw;
				const vecinos = [];
				if (x > 0) vecinos.push(p - 1);
				if (x < mw - 1) vecinos.push(p + 1);
				if (p >= mw) vecinos.push(p - mw);
				if (p < mw * (mh - 1)) vecinos.push(p + mw);
				for (const vecino of vecinos) {
					if (mascara[vecino] && !etiquetas[vecino]) {
						etiquetas[vecino] = etiqueta;
						pila[np++] = vecino;
					}
				}
			}

			if (tam > mejorTam) {
				mejorTam = tam;
				mejor = etiqueta;
			}
		}

		return { etiquetas, mejor, tam: mejorTam };
	}

	/**
	* Buscar las 4 esquinas aproximadas del bloque detectado: se estima su orientación
	* con los ejes principales de las celdas y se toma el rectángulo entre los cuantiles
	* del 2% en cada eje. Los cuantiles hacen que un apéndice pegado (un cordón, una
	* letra del fondo) apenas desplace el rectángulo, al contrario que los extremos.
	*/
	function EsquinasComponente(m, etiquetas, mejor, dilataciones) {
		const { mw, mh, factor } = m;

		// centro de masas del bloque
		let n = 0, sumaX = 0, sumaY = 0;
		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				if (etiquetas[y * mw + x] != mejor)
					continue;
				n++;
				sumaX += x;
				sumaY += y;
			}
		}
		const cx = sumaX / n;
		const cy = sumaY / n;

		// orientación con la covarianza (ejes principales), limitada a ±45º para que
		// el eje u sea siempre el más horizontal y las esquinas queden bien etiquetadas
		let sxx = 0, sxy = 0, syy = 0;
		const us = new Float64Array(n);
		const vs = new Float64Array(n);
		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				if (etiquetas[y * mw + x] != mejor)
					continue;
				const dx = x - cx;
				const dy = y - cy;
				sxx += dx * dx;
				sxy += dx * dy;
				syy += dy * dy;
			}
		}
		let angulo = 0.5 * Math.atan2(2 * sxy, sxx - syy);
		if (angulo > Math.PI / 4)
			angulo -= Math.PI / 2;
		else if (angulo < -Math.PI / 4)
			angulo += Math.PI / 2;
		const cos = Math.cos(angulo);
		const sin = Math.sin(angulo);

		// proyectar las celdas sobre los ejes
		let i = 0;
		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				if (etiquetas[y * mw + x] != mejor)
					continue;
				const dx = x - cx;
				const dy = y - cy;
				us[i] = dx * cos + dy * sin;
				vs[i] = -dx * sin + dy * cos;
				i++;
			}
		}
		us.sort();
		vs.sort();

		const cuantil = 0.02;
		const corte = Math.floor(n * cuantil);
		let u0 = us[corte], u1 = us[n - 1 - corte];
		let v0 = vs[corte], v1 = vs[n - 1 - corte];

		// deshacer el recorte del cuantil (en un bloque lleno el cuantil q entra q·anchura)
		// y compensar la expansión de la dilatación en cada lado
		const margenU = (u1 - u0) / (1 - 2 * cuantil) * cuantil - dilataciones;
		const margenV = (v1 - v0) / (1 - 2 * cuantil) * cuantil - dilataciones;
		u0 -= margenU;
		u1 += margenU;
		v0 -= margenV;
		v1 += margenV;

		// pasar de celdas de la máscara a coordenadas de la imagen
		const esquina = (u, v) => ({
			x: (cx + u * cos - v * sin + 0.5) * factor,
			y: (cy + u * sin + v * cos + 0.5) * factor,
		});
		return [esquina(u0, v0), esquina(u1, v0), esquina(u1, v1), esquina(u0, v1)];
	}

	/**
	* Afinar las esquinas aproximadas trabajando sobre la imagen en gris a resolución completa.
	* Para cada lado se busca el borde real de la tarjeta en una franja estrecha alrededor del
	* segmento entre esquinas y se ajusta una recta; como el DNI tiene las esquinas redondeadas,
	* la esquina buscada es la intersección de las rectas de los dos lados, no el borde en sí.
	*/
	/**
	* Tono típico del interior de la tarjeta: la mediana de una rejilla de muestras
	* alrededor del centro del cuadrilátero detectado
	*/
	function TonoInterior(imgPixels, esquinas) {
		const data = imgPixels.data;
		const cx = (esquinas[0].x + esquinas[1].x + esquinas[2].x + esquinas[3].x) / 4;
		const cy = (esquinas[0].y + esquinas[1].y + esquinas[2].y + esquinas[3].y) / 4;
		const xs = esquinas.map(p => p.x);
		const ys = esquinas.map(p => p.y);
		const dx = (Math.max(...xs) - Math.min(...xs)) * 0.2;
		const dy = (Math.max(...ys) - Math.min(...ys)) * 0.2;

		const muestras = [];
		for (let j = -5; j <= 5; j++) {
			for (let i = -5; i <= 5; i++) {
				const x = Math.round(cx + i * dx / 5);
				const y = Math.round(cy + j * dy / 5);
				if (x >= 0 && y >= 0 && x < imgPixels.width && y < imgPixels.height)
					muestras.push(data[(y * imgPixels.width + x) * 4]);
			}
		}
		muestras.sort((a, b) => a - b);
		return muestras[muestras.length >> 1];
	}

	function RefinarEsquinas(imgPixels, esquinas, fondo, umbralMascara) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const data = imgPixels.data;

		// umbral más sensible que el de la máscara para pillar también bordes débiles,
		// que no da problemas porque solo se busca en la franja alrededor del segmento
		const umbral = Math.min(25, umbralMascara);
		const franja = 25;
		const tonoTarjeta = TonoInterior(imgPixels, esquinas);
		const margenTono = 35;

		function contrasta(x, y) {
			if (x < 0 || y < 0 || x >= w || y >= h)
				return false;
			return Math.abs(data[(y * w + x) * 4] - fondo) > umbral;
		}

		function pareceTarjeta(x, y) {
			if (x < 0 || y < 0 || x >= w || y >= h)
				return false;
			return Math.abs(data[(y * w + x) * 4] - tonoTarjeta) <= margenTono;
		}

		/**
		* Puntos del borde de un lado. Primero se exige que tras el borde venga el tono
		* de la tarjeta (lo que descarta sombras pegadas y vetas del fondo); si así no
		* se cubre suficiente lado (por ejemplo con una banda oscura impresa hasta el
		* borde), se reintenta pidiendo solo contraste sostenido con el fondo.
		*/
		function puntosLado(pa, pb, porColumnas, desdeElPrincipio) {
			const conTono = EscanearLado(pa, pb, porColumnas, desdeElPrincipio, true);
			if (conTono.cobertura >= 0.35)
				return conTono;
			return EscanearLado(pa, pb, porColumnas, desdeElPrincipio, false);
		}

		/**
		* Para cada posición entre las dos esquinas (descartando un 15% en cada extremo
		* por el redondeo) se busca desde fuera el primer píxel con contraste dentro de
		* la franja que dé paso, de forma sostenida, al interior de la tarjeta.
		* porColumnas recorre x buscando en y (lados horizontales) o al revés.
		*/
		function EscanearLado(pa, pb, porColumnas, desdeElPrincipio, usarTono) {
			const ua = porColumnas ? pa.x : pa.y;
			const ub = porColumnas ? pb.x : pb.y;
			const va = porColumnas ? pa.y : pa.x;
			const vb = porColumnas ? pb.y : pb.x;

			const esInterior = usarTono ? pareceTarjeta : contrasta;

			const puntos = [];
			const margen = Math.abs(ub - ua) * 0.15;
			const u0 = Math.round(Math.min(ua, ub) + margen);
			const u1 = Math.round(Math.max(ua, ub) - margen);
			for (let u = u0; u <= u1; u += 2) {
				const vSegmento = va + (vb - va) * (u - ua) / (ub - ua);
				const vInicio = Math.round(desdeElPrincipio ? vSegmento - franja : vSegmento + franja);
				const paso = desdeElPrincipio ? 1 : -1;
				for (let i = 0; i <= franja * 2; i++) {
					const v = vInicio + i * paso;
					if (porColumnas ? contrasta(u, v) : contrasta(v, u)) {
						// si ya hay contraste en el primer píxel es que la franja está dentro
						// de la tarjeta y no estamos viendo el borde: no vale como punto
						if (i == 0)
							break;

						// tras el borde debe venir el interior de forma sostenida:
						// un par de píxeles sueltos (una veta del fondo) no valen
						let dentro = 0;
						for (let k = 1; k <= 8; k++) {
							const vk = v + paso * k;
							if (porColumnas ? esInterior(u, vk) : esInterior(vk, u))
								dentro++;
						}
						if (dentro >= 7) {
							puntos.push({ u, v });
							break;
						}
					}
				}
			}
			return { puntos, cobertura: puntos.length / Math.max(1, (u1 - u0) / 2) };
		}

		/**
		* Ajuste de recta v = a + b·u por mínimos cuadrados de forma iterativa:
		* en cada pasada se descartan los puntos que se alejan del ajuste anterior
		* (sombras, brillos o ruido en el borde) y se vuelve a calcular
		*/
		function AjustarRecta(lado) {
			function calcular(pts) {
				let su = 0, sv = 0, suu = 0, suv = 0;
				pts.forEach(p => {
					su += p.u;
					sv += p.v;
					suu += p.u * p.u;
					suv += p.u * p.v;
				});
				const n = pts.length;
				const den = n * suu - su * su;
				if (Math.abs(den) < 1e-9)
					return null;
				const b = (n * suv - su * sv) / den;
				return [(sv - b * su) / n, b];
			}

			// exigir haber encontrado el borde en una parte razonable del lado
			if (lado.cobertura < 0.35 || lado.puntos.length < 10)
				return null;

			let puntos = lado.puntos;
			let recta = calcular(puntos);
			if (!recta)
				return null;

			for (let pasada = 0; pasada < 3; pasada++) {
				const residuos = puntos.map(p => Math.abs(p.v - (recta[0] + recta[1] * p.u)));
				const ordenados = [...residuos].sort((a, b) => a - b);
				const limite = Math.max(2, ordenados[ordenados.length >> 1] * 2);
				const cerca = puntos.filter((p, i) => residuos[i] <= limite);
				// si hay que descartar demasiados puntos es que esto no es un borde recto
				if (cerca.length < lado.puntos.length * 0.5)
					return null;

				const nueva = calcular(cerca);
				if (!nueva)
					return null;
				recta = nueva;
				puntos = cerca;
			}
			return recta;
		}

		const [tl, tr, br, bl] = esquinas;
		const rectaSup = AjustarRecta(puntosLado(tl, tr, true, true));
		const rectaInf = AjustarRecta(puntosLado(bl, br, true, false));
		const rectaIzq = AjustarRecta(puntosLado(tl, bl, false, true));
		const rectaDer = AjustarRecta(puntosLado(tr, br, false, false));

		// se informa de cuántos lados tienen el borde real bien ajustado, como
		// medida de la confianza en la detección
		const lados = [rectaSup, rectaInf, rectaIzq, rectaDer].filter(Boolean).length;

		// si algún lado no es fiable, quedarse con las esquinas aproximadas
		if (lados < 4)
			return { esquinas, lados };

		// la esquina es la intersección de las rectas horizontal (y = h0 + h1·x) y vertical (x = v0 + v1·y)
		function interseccion(recH, recV) {
			const y = (recH[0] + recH[1] * recV[0]) / (1 - recH[1] * recV[1]);
			return { x: recV[0] + recV[1] * y, y };
		}

		return {
			lados,
			esquinas: [
				interseccion(rectaSup, rectaIzq),
				interseccion(rectaSup, rectaDer),
				interseccion(rectaInf, rectaDer),
				interseccion(rectaInf, rectaIzq),
			],
		};
	}

	function Distancia(p1, p2) {
		return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
	}

	/**
	* Comprobar que las 4 esquinas forman un cuadrilátero convexo con la pinta de un DNI en una foto.
	* Devuelve null si no es fiable; el recuadro que lo delimita si ya está recto,
	* y además las esquinas si merece la pena enderezarlo con corrección de perspectiva.
	*/
	function ValidarEsquinas(esquinas, w, h) {
		const [tl, tr, br, bl] = esquinas;

		const minX = Math.min(tl.x, tr.x, br.x, bl.x);
		const maxX = Math.max(tl.x, tr.x, br.x, bl.x);
		const minY = Math.min(tl.y, tr.y, br.y, bl.y);
		const maxY = Math.max(tl.y, tr.y, br.y, bl.y);
		const tarjeta = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };

		// si la zona detectada es demasiado pequeña, mejor no fiarse de la detección
		if (tarjeta.w < w * 0.2 || tarjeta.h < h * 0.2)
			return null;

		// comprobar que es convexo: todos los giros entre lados consecutivos en el mismo sentido
		for (let i = 0; i < 4; i++) {
			const a = esquinas[i];
			const b = esquinas[(i + 1) % 4];
			const c = esquinas[(i + 2) % 4];
			const cruz = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
			if (cruz <= 0)
				return { tarjeta };
		}

		const arriba = Distancia(tl, tr);
		const abajo = Distancia(bl, br);
		const izquierda = Distancia(tl, bl);
		const derecha = Distancia(tr, br);

		// los lados opuestos deben ser parecidos y la proporción similar a la de un DNI;
		// si no, aplicamos solo el encuadre sin corregir la perspectiva
		const proporcion = (arriba + abajo) / (izquierda + derecha);
		const apaisada = proporcion >= 1;
		const proporcionNormal = apaisada ? proporcion : 1 / proporcion;
		// un DNI es 1.586; el margen restante cubre la deformación por perspectiva
		if (Math.min(arriba, abajo) / Math.max(arriba, abajo) < 0.7 ||
			Math.min(izquierda, derecha) / Math.max(izquierda, derecha) < 0.7 ||
			proporcionNormal < 1.38 || proporcionNormal > 1.85)
			return { tarjeta };

		// más de ~35º de inclinación no es una foto normal de un DNI, sino algún
		// elemento diagonal de la imagen que ha pasado los filtros anteriores
		const inclinacion = Math.abs(Math.atan2(tr.y - tl.y, tr.x - tl.x)) * 180 / Math.PI;
		if (Math.min(inclinacion, 180 - inclinacion) > 35)
			return { tarjeta };

		// una tarjeta vertical (típico de un escaneo girado) se acepta reordenando las
		// esquinas, con lo que el enderezado la deja apaisada de paso; al venir de
		// escaneos sin apenas perspectiva, la proporción se exige más estricta
		if (!apaisada) {
			if (proporcionNormal < 1.45 || proporcionNormal > 1.75)
				return { tarjeta };
			return { tarjeta, esquinas: [esquinas[3], esquinas[0], esquinas[1], esquinas[2]] };
		}

		// si las esquinas ya están casi en las esquinas del recuadro, no hace falta enderezar nada
		const rectas = [
			Distancia(tl, { x: minX, y: minY }),
			Distancia(tr, { x: maxX, y: minY }),
			Distancia(br, { x: maxX, y: maxY }),
			Distancia(bl, { x: minX, y: maxY }),
		];
		const margenRecto = 0.008 * (tarjeta.w + tarjeta.h) / 2;
		if (Math.max(...rectas) < margenRecto)
			return { tarjeta };

		return { tarjeta, esquinas };
	}

	/**
	* Detectar el DNI buscando el contraste con el fondo (normalmente blanco).
	* Devuelve null si no hay detección fiable, o un objeto con el recuadro que delimita la tarjeta
	* y sus 4 esquinas si además conviene corregir la perspectiva.
	*/
	function DetectarTarjeta(imgPixels) {
		const fondos = FondosCandidatos(imgPixels);

		// el contraste tarjeta-fondo varía mucho entre fotos (una tarjeta clara sobre una
		// mesa blanca apenas contrasta): se prueba de mayor a menor exigencia y nos
		// quedamos con el primer umbral que encuentra las 4 esquinas.
		// primero con apertura (que despega del DNI las letras o dibujos del fondo);
		// sin ella de reserva, porque una tarjeta que apenas contrasta da una máscara
		// con claros que la erosión podría romper
		const area = tarjeta => tarjeta.w * tarjeta.h;
		const areaImagen = imgPixels.width * imgPixels.height;
		let recuadro = null;
		let esquinasPequenas = null;
		for (const fondo of fondos) {
			for (const conApertura of [true, false]) {
				for (const umbral of [40, 20, 10]) {
					const deteccion = DetectarConUmbral(imgPixels, fondo, umbral, conApertura);
					if (!deteccion)
						continue;

					if (deteccion.esquinas) {
						// una detección con un tamaño normal es definitiva; una pequeña
						// puede ser un elemento interior (la foto de la cara de un
						// escaneo) y se contrasta luego con los recuadros encontrados
						if (area(deteccion.tarjeta) >= areaImagen * 0.15)
							return deteccion;
						if (!esquinasPequenas)
							esquinasPequenas = deteccion;
						continue;
					}

					// si nada da esquinas, recordamos el mejor recuadro: el de proporción
					// más cercana a la de un DNI, o el primero que haya
					const proporcion = deteccion.tarjeta.w / deteccion.tarjeta.h;
					const puntuacion = proporcion > 1.1 && proporcion < 2.4 ? Math.abs(proporcion - 1.586) : 99;
					if (!recuadro || puntuacion < recuadro.puntuacion)
						recuadro = { tarjeta: deteccion.tarjeta, puntuacion };
				}
			}
		}

		// unas esquinas pequeñas solo valen si no hay un recuadro bastante mayor
		// que sugiera que el documento real es otro
		if (esquinasPequenas && (!recuadro || area(esquinasPequenas.tarjeta) >= area(recuadro.tarjeta) * 0.5))
			return esquinasPequenas;
		return recuadro && { tarjeta: recuadro.tarjeta };
	}

	/**
	* Recuadro que abarca todas las celdas del bloque, compensando la dilatación.
	* Sirve de encuadre de reserva: a diferencia del rectángulo por cuantiles,
	* no recorta los bloques dispersos (como el contenido impreso de la tarjeta)
	*/
	function ExtensionComponente(m, etiquetas, mejor, dilataciones) {
		const { mw, mh, factor } = m;
		let minX = mw, maxX = 0, minY = mh, maxY = 0;
		for (let y = 0; y < mh; y++) {
			for (let x = 0; x < mw; x++) {
				if (etiquetas[y * mw + x] != mejor)
					continue;
				if (x < minX) minX = x;
				if (x > maxX) maxX = x;
				if (y < minY) minY = y;
				if (y > maxY) maxY = y;
			}
		}
		return {
			x: (minX + dilataciones) * factor,
			y: (minY + dilataciones) * factor,
			w: (maxX - minX + 1 - 2 * dilataciones) * factor,
			h: (maxY - minY + 1 - 2 * dilataciones) * factor,
		};
	}

	/**
	* Cuántas de las 4 esquinas de la foto contienen celdas del bloque indicado
	*/
	function EsquinasFotoOcupadas(m, etiquetas, mejor) {
		const { mw, mh } = m;
		const lado = Math.max(2, Math.round(Math.min(mw, mh) * 0.08));
		let ocupadas = 0;
		[[0, 0], [mw - lado, 0], [0, mh - lado], [mw - lado, mh - lado]].forEach(function ([x0, y0]) {
			let celdas = 0;
			for (let y = y0; y < y0 + lado; y++) {
				for (let x = x0; x < x0 + lado; x++) {
					if (etiquetas[y * mw + x] == mejor)
						celdas++;
				}
			}
			// la esquina cuenta como ocupada si el bloque cubre la mayor parte de ella
			if (celdas > lado * lado * 0.6)
				ocupadas++;
		});
		return ocupadas;
	}

	/**
	* Una pasada de detección con un umbral de contraste concreto
	*/
	function DetectarConUmbral(imgPixels, fondo, umbral, conApertura) {
		const m = CrearMascara(imgPixels, fondo, umbral);

		if (conApertura) {
			// apertura morfológica: borra letras y trazos finos del fondo, para que la
			// dilatación posterior no los pegue a la tarjeta
			const erosiones = 3;
			Erosionar(m, erosiones);
			Dilatar(m, erosiones);
		}

		const dilataciones = 4;
		Dilatar(m, dilataciones);

		const { etiquetas, mejor, tam } = MayorComponente(m);
		// exigir un tamaño mínimo del 4% de la imagen para descartar detecciones espurias
		if (!mejor || tam < m.mw * m.mh * 0.04)
			return null;

		// un bloque que cubre 3+ esquinas de la foto no puede ser la tarjeta, porque
		// las esquinas se consideran fondo (se permiten 2 por los fondos con degradado,
		// donde una parte del fondo sí contrasta con el tono estimado)
		if (EsquinasFotoOcupadas(m, etiquetas, mejor) >= 3)
			return null;

		// dos pasadas de refinado: la primera acerca las esquinas al borde real y la segunda,
		// con la franja de búsqueda ya bien centrada, las deja clavadas
		let esquinas = EsquinasComponente(m, etiquetas, mejor, dilataciones);
		esquinas = RefinarEsquinas(imgPixels, esquinas, fondo, umbral).esquinas;
		const refinado = RefinarEsquinas(imgPixels, esquinas, fondo, umbral);
		esquinas = refinado.esquinas;

		// las intersecciones de las rectas pueden quedar algo fuera de la imagen, las limitamos
		esquinas = esquinas.map(p => ({
			x: Math.min(Math.max(p.x, 0), imgPixels.width),
			y: Math.min(Math.max(p.y, 0), imgPixels.height),
		}));

		// un lado apoyado en el borde de la foto no es un borde real de la tarjeta
		// (fuera no hay imagen con la que contrastar), y 2+ esquinas recortadas al
		// limitar son extrapolaciones sin base: en ambos casos las esquinas no valen,
		// aunque el recuadro que delimitan sigue sirviendo de encuadre aproximado
		let bordeApoyado = false;
		let recortadas = 0;
		for (let i = 0; i < 4; i++) {
			const a = esquinas[i];
			const b = esquinas[(i + 1) % 4];
			if ((a.x <= 1 && b.x <= 1) || (a.x >= imgPixels.width - 1 && b.x >= imgPixels.width - 1) ||
				(a.y <= 1 && b.y <= 1) || (a.y >= imgPixels.height - 1 && b.y >= imgPixels.height - 1))
				bordeApoyado = true;
			if (a.x <= 0 || a.x >= imgPixels.width || a.y <= 0 || a.y >= imgPixels.height)
				recortadas++;
		}

		let resultado = ValidarEsquinas(esquinas, imgPixels.width, imgPixels.height);
		if (!resultado)
			return null;
		if (bordeApoyado || recortadas >= 2)
			resultado.esquinas = null;

		// solo con los 4 lados bien ajustados al borde real la detección es fiable;
		// si no, las esquinas son en parte una estimación y es mejor quedarse con un
		// encuadre (la extensión completa del bloque) y que la persona ponga los puntos
		if (!resultado.esquinas || refinado.lados < 4)
			resultado = { tarjeta: ExtensionComponente(m, etiquetas, mejor, dilataciones) };

		// una tarjeta no puede ocupar prácticamente toda la foto: o es el fondo entero
		// colándose como bloque, o es una foto ya recortada al DNI donde no hay nada
		// que detectar (y los puntos por defecto ya aciertan)
		if (resultado.tarjeta.w * resultado.tarjeta.h > imgPixels.width * imgPixels.height * 0.92)
			return null;
		return resultado;
	}

	/**
	* Resolver un sistema de ecuaciones lineales por eliminación de Gauss-Jordan con pivote parcial
	*/
	function ResolverSistema(A, b) {
		const n = b.length;
		for (let col = 0; col < n; col++) {
			let maxFila = col;
			for (let f = col + 1; f < n; f++) {
				if (Math.abs(A[f][col]) > Math.abs(A[maxFila][col]))
					maxFila = f;
			}
			[A[col], A[maxFila]] = [A[maxFila], A[col]];
			[b[col], b[maxFila]] = [b[maxFila], b[col]];

			const pivote = A[col][col];
			if (Math.abs(pivote) < 1e-10)
				return null;

			for (let f = 0; f < n; f++) {
				if (f == col)
					continue;
				const factor = A[f][col] / pivote;
				for (let c = col; c < n; c++)
					A[f][c] -= factor * A[col][c];
				b[f] -= factor * b[col];
			}
		}
		return b.map((valor, i) => valor / A[i][i]);
	}

	/**
	* Calcular la transformación de perspectiva (homografía) que lleva cada punto de destino a su origen
	*/
	function ResolverHomografia(destino, origen) {
		const A = [];
		const b = [];
		for (let i = 0; i < 4; i++) {
			const { x: u, y: v } = destino[i];
			const { x, y } = origen[i];
			A.push([u, v, 1, 0, 0, 0, -x * u, -x * v]);
			b.push(x);
			A.push([0, 0, 0, u, v, 1, -y * u, -y * v]);
			b.push(y);
		}
		return ResolverSistema(A, b);
	}

	/**
	* Enderezar la imagen con una corrección de perspectiva que convierte el cuadrilátero
	* de las esquinas detectadas en un rectángulo recto con la proporción del canvas.
	* Devuelve los nuevos píxeles y el rectángulo donde queda la tarjeta, o null si falla.
	*/
	function EnderezarTarjeta(imgPixels, esquinas) {
		const w = imgPixels.width;
		const h = imgPixels.height;
		const [tl, tr, br, bl] = esquinas;

		// rectángulo destino: la anchura media de la tarjeta detectada con la proporción del canvas,
		// centrado donde está la tarjeta pero sin salirse de la imagen
		let wDest = (Distancia(tl, tr) + Distancia(bl, br)) / 2;
		wDest = Math.min(wDest, w * 0.98, h * ProporcionCanvas * 0.98);
		if (wDest < 10)
			return null;
		const hDest = wDest / ProporcionCanvas;

		let cx = (tl.x + tr.x + br.x + bl.x) / 4;
		let cy = (tl.y + tr.y + br.y + bl.y) / 4;
		cx = Math.min(Math.max(cx, wDest / 2), w - wDest / 2);
		cy = Math.min(Math.max(cy, hDest / 2), h - hDest / 2);

		const destino = [
			{ x: cx - wDest / 2, y: cy - hDest / 2 },
			{ x: cx + wDest / 2, y: cy - hDest / 2 },
			{ x: cx + wDest / 2, y: cy + hDest / 2 },
			{ x: cx - wDest / 2, y: cy + hDest / 2 },
		];

		const homografia = ResolverHomografia(destino, esquinas);
		if (!homografia)
			return null;

		const [a, b, c, d, e, f, g, k] = homografia;

		// recorrer cada píxel del destino buscando su origen con la homografía, e interpolar el valor
		const salida = new ImageData(w, h);
		const sdata = salida.data;
		const ddata = imgPixels.data;
		let i = 0;
		for (let v = 0; v < h; v++) {
			for (let u = 0; u < w; u++, i += 4) {
				const den = g * u + k * v + 1;
				const x = (a * u + b * v + c) / den;
				const y = (d * u + e * v + f) / den;

				let valor = 255;
				if (x >= 0 && y >= 0 && x <= w - 1 && y <= h - 1) {
					const x0 = x | 0;
					const y0 = y | 0;
					const x1 = Math.min(x0 + 1, w - 1);
					const y1 = Math.min(y0 + 1, h - 1);
					const fx = x - x0;
					const fy = y - y0;
					const v00 = ddata[(y0 * w + x0) * 4];
					const v10 = ddata[(y0 * w + x1) * 4];
					const v01 = ddata[(y1 * w + x0) * 4];
					const v11 = ddata[(y1 * w + x1) * 4];
					valor = v00 * (1 - fx) * (1 - fy) + v10 * fx * (1 - fy) + v01 * (1 - fx) * fy + v11 * fx * fy;
				}

				sdata[i] = sdata[i + 1] = sdata[i + 2] = valor;
				sdata[i + 3] = 255;
			}
		}

		return {
			imgPixels: salida,
			tarjeta: { x: destino[0].x, y: destino[0].y, w: wDest, h: hDest },
		};
	}

	// Si la imagen parece estar en vertical, girarla automáticamente por defecto
	function PonerHorizontal(img) {
		let width = img.width;
		let height = img.height;

		if (height > width) {
			const ancho = height;
			const alto = width;
			const canvasGiro = new OffscreenCanvas(ancho, alto);

			const ctxRotado = canvasGiro.getContext('2d');
			ctxRotado.clearRect(0, 0, ancho, alto);
			// save the unrotated context of the canvas so we can restore it later
			// the alternative is to untranslate & unrotate after drawing
			ctxRotado.save();

			// move to the center of the canvas
			ctxRotado.translate(ancho / 2, alto / 2);

			// rotate the canvas to the specified degrees
			ctxRotado.rotate(270 * Math.PI / 180);

			// draw the image
			// since the context is rotated, the image will be rotated also
			ctxRotado.drawImage(img, - width / 2, - height / 2);

			// we’re done with the rotating so restore the unrotated context
			ctxRotado.restore();

			return canvasGiro;
		}

		const canvas = new OffscreenCanvas(img.width, img.height);
		const ctxImagen = canvas.getContext('2d');
		ctxImagen.drawImage(img, 0, 0);
		return canvas;
	}

	function ReducirAnchura(canvas) {
		// Limitamos a un ancho máximo de 2000px para mejorar rendimiento posterior
		const anchoMaximo = 2000;
		if (canvas.width <= anchoMaximo)
			return canvas;

		const width = anchoMaximo;
		const height = anchoMaximo * canvas.height / canvas.width;

		const canvasEscalado = new OffscreenCanvas(width, height);
		const ctxImagen = canvasEscalado.getContext('2d');
		ctxImagen.drawImage(canvas, 0, 0, width, height);
		return canvasEscalado;
	}

	// Tono mínimo de la copia protegida: los negros puros quedan como un gris oscuro
	const NegroMinimo = 35;

	/**
	* Reescalar los tonos al rango [NegroMinimo, 255] para que la copia
	* no tenga negros totalmente puros. Modifica la imagen y la devuelve.
	*/
	function AclararNegros(imgPixels) {
		const datos = imgPixels.data;
		const factor = (255 - NegroMinimo) / 255;
		for (let i = 0; i < datos.length; i += 4) {
			const tono = NegroMinimo + datos[i] * factor;
			datos[i] = datos[i + 1] = datos[i + 2] = tono;
		}
		return imgPixels;
	}

	// Imagen en escala de grises de la última foto procesada, para poder enderezarla
	// de nuevo cada vez que se ajusten las esquinas sin reprocesarlo todo
	let imagenGris = null;

	// La misma imagen en color, para mostrarla en el editor de esquinas
	let imagenColor = null;

	/**
	* Procesar una foto nueva: girar si está en vertical, pasar a blanco y negro
	* y detectar las esquinas del DNI. No endereza; eso se pide en un mensaje aparte.
	* Devuelve el bitmap en blanco y negro y otro en color para el editor de esquinas.
	*/
	function ProcesarImagenNueva(datos) {
		const canvas = ReducirAnchura(PonerHorizontal(datos.bitmap));
		const ctx = canvas.getContext('2d', { willReadFrequently: true });

		imagenGris = null;
		imagenColor = null;
		let bitmapColor = null;
		let esquinas = null;
		let tarjeta = null;
		try {
			const imgPixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
			// guardamos una copia en color antes de convertir a blanco y negro
			imagenColor = new ImageData(new Uint8ClampedArray(imgPixels.data), imgPixels.width, imgPixels.height);
			// transferir vacía el canvas, pero mantiene su tamaño y se puede seguir dibujando
			bitmapColor = canvas.transferToImageBitmap();

			ConvertirBN(imgPixels);
			imagenGris = imgPixels;

			const deteccion = DetectarTarjeta(imgPixels);
			if (deteccion) {
				tarjeta = deteccion.tarjeta;
				esquinas = deteccion.esquinas || null;
			}

			// para la salida se aclaran los negros sobre una copia; imagenGris mantiene
			// el rango completo, que es el que usan la detección y el enderezado
			const salida = new ImageData(new Uint8ClampedArray(imgPixels.data), imgPixels.width, imgPixels.height);
			ctx.putImageData(AclararNegros(salida), 0, 0);
		} catch (e) {
			// getImageData da error al usar imagen de prueba con file://
		}

		const bitmap = canvas.transferToImageBitmap();
		self.postMessage({ id: datos.id, bitmap, bitmapColor, esquinas, tarjeta });
	}

	/**
	* Enderezar la última foto procesada usando las esquinas indicadas
	*/
	function ProcesarEnderezado(datos) {
		if (!imagenGris) {
			self.postMessage({ id: datos.id, bitmap: null });
			return;
		}

		const enderezado = EnderezarTarjeta(imagenGris, datos.esquinas);
		if (!enderezado) {
			self.postMessage({ id: datos.id, bitmap: null });
			return;
		}

		const canvas = new OffscreenCanvas(imagenGris.width, imagenGris.height);
		canvas.getContext('2d').putImageData(AclararNegros(enderezado.imgPixels), 0, 0);
		const bitmap = canvas.transferToImageBitmap();
		self.postMessage({ id: datos.id, bitmap, tarjeta: enderezado.tarjeta });
	}

	/**
	* Girar 90º una imagen, en el sentido indicado por el signo
	*/
	function GirarImageData(origen, girar) {
		const w = origen.width;
		const h = origen.height;
		const datosOrigen = origen.data;
		const salida = new ImageData(h, w);
		const destino = salida.data;

		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				const xd = girar > 0 ? h - 1 - y : y;
				const yd = girar > 0 ? x : w - 1 - x;
				const i = (y * w + x) * 4;
				const j = (yd * h + xd) * 4;
				destino[j] = datosOrigen[i];
				destino[j + 1] = datosOrigen[i + 1];
				destino[j + 2] = datosOrigen[i + 2];
				destino[j + 3] = 255;
			}
		}

		return salida;
	}

	function BitmapDeImageData(imgPixels) {
		const canvas = new OffscreenCanvas(imgPixels.width, imgPixels.height);
		canvas.getContext('2d').putImageData(imgPixels, 0, 0);
		return canvas.transferToImageBitmap();
	}

	/**
	* Girar 90º las imágenes guardadas y devolverlas, para cuando la foto está en la orientación equivocada
	*/
	function ProcesarGiro(datos) {
		if (!imagenGris) {
			self.postMessage({ id: datos.id, bitmap: null });
			return;
		}

		imagenGris = GirarImageData(imagenGris, datos.girar);

		let bitmapColor = null;
		if (imagenColor) {
			imagenColor = GirarImageData(imagenColor, datos.girar);
			bitmapColor = BitmapDeImageData(imagenColor);
		}

		self.postMessage({ id: datos.id, bitmap: BitmapDeImageData(imagenGris), bitmapColor });
	}

	self.addEventListener('message', e => {
		if (e.data.bitmap)
			ProcesarImagenNueva(e.data);
		else if (e.data.esquinas)
			ProcesarEnderezado(e.data);
		else if (e.data.girar)
			ProcesarGiro(e.data);
	});
}

// https://gist.github.com/ahem/d19ee198565e20c6f5e1bcd8f87b3408
function createWorker(f) {
	return new Worker(URL.createObjectURL(new Blob([`(${f})()`])));
}

if (typeof window == 'undefined')
	CodigoWorker();
else
	procesadorDNI = createWorker(CodigoWorker)