/**
 * Datos de cada formato de DNI: los rectángulos a censurar y la marca de agua.
 * - Mascaras: rectángulos que se tapan con negro
 * - MascarasDni: cifras del número de DNI que se ocultan parcialmente (opcional)
 * - DatosValidez: fecha de nacimiento, validez y nº de soporte (opcional)
 * - Watermarks: zonas donde se repite el texto de la finalidad
 */
import type { FormatoDni, Watermark } from './tipos';

// La marca de agua es igual en todos los formatos: mayúsculas, monoespaciada,
// al 40 % y con la rotación sorteada en cada carga, cubriendo todo el documento.
const MARCA: Watermark = {
	fuente: "600 16px 'Courier New', monospace",
	estilo: 'rgb(0 0 0 / 40%)',
	mayusculas: true,
	angulo: 'aleatorio',
	bb: { x: 0, y: 0, w: 1000, h: 625 },
};

export const FormatosDnis: Record<string, FormatoDni> = {
	'-': {
		Nombre: ' ', // Sin máscara
		Mascaras: [],
		Watermarks: [MARCA],
	},
	'dni4-frontal': {
		Nombre: 'DNI Frontal (v4.0 desde 2021)',
		Mascaras: [
			{ x: 760, y: 90, w: 120, h: 50 },
			{ x: 820, y: 420, w: 140, h: 40 },
			{ x: 380, y: 480, w: 400, h: 90 }, // Firma
			{ x: 780, y: 510, w: 200, h: 60 }, // CAN
		],
		MascarasDni: [
			{ x: 440, y: 100, w: 110, h: 55 }, // Nº DNI 4 dígitos
			{ x: 680, y: 100, w: 65, h: 55 }, // ampliado a final DNI
			{ x: 20, y: 115, w: 160, h: 35 }, // DNI miniatura
		],
		DatosValidez: [
			{ x: 790, y: 320, w: 180, h: 40 }, // Fecha Nacimiento
			{ x: 380, y: 445, w: 400, h: 35 }, // NumeroSoporte
			{ x: 380, y: 380, w: 400, h: 35 }, // emisión, validez
		],
		Watermarks: [MARCA],
	},
	'dni4-trasera': {
		Nombre: 'DNI Trasera (v4.0 desde 2021)',
		Mascaras: [
			{ x: 110, y: 90, w: 120, h: 40 },
			{ x: 0, y: 180, w: 60, h: 190 }, // vertical
			{ x: 260, y: 210, w: 500, h: 80 }, // Nacimiento
			{ x: 260, y: 320, w: 500, h: 40 }, // Padres
			{ x: 20, y: 395, w: 960, h: 130 }, // Inferior
		],
		Watermarks: [MARCA],
	},
	'dni3-frontal': {
		Nombre: 'DNI Frontal (v3.0 2015-2021)',
		Mascaras: [
			{ x: 750, y: 80, w: 140, h: 60 },
			{ x: 780, y: 370, w: 160, h: 45 },
			{ x: 390, y: 480, w: 390, h: 120 }, // Firma
			{ x: 790, y: 525, w: 210, h: 75 }, // CAN
		],
		MascarasDni: [
			{ x: 90, y: 550, w: 90, h: 50 }, // Inicio DNI
			{ x: 300, y: 550, w: 70, h: 50 }, // Final DNI
		],
		DatosValidez: [
			{ x: 390, y: 380, w: 230, h: 35 }, // Fecha Nacimiento
			{ x: 390, y: 445, w: 170, h: 35 }, // NumeroSoporte
			{ x: 580, y: 445, w: 200, h: 35 }, // Validez
		],
		Watermarks: [MARCA],
	},
	'dni3-trasera': {
		Nombre: 'DNI Trasera (v3.0 2015-2021)',
		Mascaras: [
			{ x: 100, y: 100, w: 130, h: 40 },
			{ x: 0, y: 180, w: 60, h: 190 }, // vertical
			{ x: 240, y: 210, w: 500, h: 80 }, // Nacimiento
			{ x: 240, y: 340, w: 500, h: 40 }, // Padres
			{ x: 20, y: 410, w: 960, h: 130 }, // Inferior
		],
		Watermarks: [MARCA],
	},
	'dni1-frontal': {
		Nombre: 'DNI Frontal (v2.0 hasta 2015)',
		Mascaras: [
			{ x: 290, y: 440, w: 410, h: 170 }, // Firma
			{ x: 130, y: 430, w: 140, h: 80 },
		],
		DatosValidez: [
			{ x: 290, y: 300, w: 230, h: 35 }, // Fecha nacimiento
			{ x: 290, y: 350, w: 230, h: 35 }, // NumeroSoporte
			{ x: 290, y: 400, w: 230, h: 35 }, // Validez
		],
		Watermarks: [MARCA],
	},
	'dni1-trasera': {
		Nombre: 'DNI Trasera (v2.0 hasta 2015)',
		Mascaras: [
			{ x: 50, y: 45, w: 400, h: 40 }, // Nacimiento
			{ x: 50, y: 150, w: 400, h: 40 }, // Padres
			{ x: 620, y: 330, w: 280, h: 40 }, // Equipo
			{ x: 20, y: 410, w: 960, h: 120 }, // Inferior
		],
		Watermarks: [MARCA],
	},
};
