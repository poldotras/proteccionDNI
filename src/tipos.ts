/**
 * Tipos compartidos entre la interfaz y el worker.
 */

/** Un punto en coordenadas de la imagen */
export interface Punto {
	x: number;
	y: number;
}

/** Las 4 esquinas del DNI en orden horario: sup-izda, sup-dcha, inf-dcha, inf-izda */
export type Esquinas = [Punto, Punto, Punto, Punto];

/** Un rectángulo (zona a censurar, encuadre de la tarjeta, etc.) */
export interface Rectangulo {
	x: number;
	y: number;
	w: number;
	h: number;
}

/** Marca de agua de un formato: fuente, color, y zona donde se repite el texto */
export interface Watermark {
	fuente: string;
	estilo: string;
	mayusculas: boolean;
	/** grados de rotación, o 'aleatorio' para sortearlos en cada carga */
	angulo: number | 'aleatorio';
	bb: Rectangulo;
}

/** Datos de un formato de DNI: qué se censura y cómo se marca */
export interface FormatoDni {
	Nombre: string;
	Mascaras: Rectangulo[];
	MascarasDni?: Rectangulo[];
	DatosValidez?: Rectangulo[];
	Watermarks: Watermark[];
}

//
// Mensajes con el worker: cada petición lleva un id para resolver su promesa
//

export type PeticionWorker =
	| { tipo: 'procesar'; bitmap: ImageBitmap; generacion: number }
	| { tipo: 'detectar' }
	| { tipo: 'enderezar'; esquinas: Esquinas }
	| { tipo: 'girar'; giro: number };

export interface RespuestaProcesar {
	bitmap: ImageBitmap | null;
	bitmapColor: ImageBitmap | null;
	esquinas: Esquinas | null;
	tarjeta: Rectangulo | null;
	recortada: boolean;
}

export interface RespuestaEnderezar {
	bitmap: ImageBitmap | null;
	tarjeta?: Rectangulo;
}

export interface RespuestaGirar {
	bitmap: ImageBitmap | null;
	bitmapColor: ImageBitmap | null;
}

export interface RespuestaDetectar {
	esquinas: Esquinas | null;
	tarjeta: Rectangulo | null;
}

/** Envoltorio que añade el id de correlación a cualquier mensaje */
export type ConId<T> = T & { id: number };
