/**
 * Referencias tipadas a los elementos del editor.
 * Se resuelven al importar el módulo, cuando el DOM del editor ya existe
 * (los scripts type="module" se ejecutan tras analizar el HTML; en la página
 * de pruebas el editor se inyecta antes de importar estos módulos).
 */

function el<T extends Element>(id: string): T {
	const elemento = document.getElementById(id);
	if (!elemento)
		throw new Error(`Falta el elemento #${id}`);
	return elemento as unknown as T;
}

export const Previsualizacion = el<HTMLDivElement>('Previsualizacion');
export const canvas = el<HTMLCanvasElement>('canvas');

export const canvasOriginal = el<HTMLCanvasElement>('canvasOriginal');
export const MarcoEsquinas = el<SVGSVGElement>('MarcoEsquinas');
export const PoligonoEsquinas = el<SVGPolygonElement>('PoligonoEsquinas');
export const Lupa = el<HTMLCanvasElement>('Lupa');

export const SelectorFichero = el<HTMLInputElement>('SelectorFichero');
export const Formato = el<HTMLSelectElement>('Formato');
export const Watermark = el<HTMLInputElement>('Watermark');
export const EnmascararDni = el<HTMLInputElement>('EnmascararDni');
export const DivMascaraDni = el<HTMLDivElement>('DivMascaraDni');
export const Validez = el<HTMLInputElement>('Validez');
export const DivValidez = el<HTMLDivElement>('DivValidez');
export const botonGuardar = el<HTMLButtonElement>('Guardar');
