/**
 * Estado compartido entre los módulos del editor.
 * Al usar módulos ES no se puede reasignar un `export let` desde otro fichero,
 * así que el estado vive en un único objeto mutable que todos importan.
 */
import type { Esquinas, Rectangulo } from '../tipos';

interface Estado {
	/** Imagen del DNI a escala 1:1 en blanco y negro que se muestra como resultado
	    (ya enderezada si se aplicó la corrección de perspectiva) */
	imagenDNI_BN: ImageBitmap | null;
	/** Imagen original en blanco y negro sin enderezar, sobre la que se definen las esquinas */
	imagenOriginalBN: ImageBitmap | null;
	/** La misma imagen original en color, la que se muestra en el editor de esquinas */
	imagenOriginalColor: ImageBitmap | null;
	/** Las 4 esquinas del DNI sobre la imagen original */
	esquinasDNI: Esquinas | null;
	/** Zona de imagenDNI_BN donde queda la tarjeta enderezada */
	tarjetaResultado: Rectangulo | null;
	/** Nombre del fichero elegido, para generar el nombre de la copia protegida */
	nombreFichero: string;
}

export const estado: Estado = {
	imagenDNI_BN: null,
	imagenOriginalBN: null,
	imagenOriginalColor: null,
	esquinasDNI: null,
	tarjetaResultado: null,
	nombreFichero: '',
};
