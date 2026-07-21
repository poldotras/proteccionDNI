/** Tipos internos del worker */
import type { Esquinas, Rectangulo } from '../tipos';

/** Resultado de la detección: encuadre de la tarjeta y, si es fiable, sus esquinas */
export interface Deteccion {
	tarjeta: Rectangulo;
	esquinas?: Esquinas | null;
	recortada?: boolean;
}
