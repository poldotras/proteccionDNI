/**
 * Comunicación con el WebWorker que procesa la imagen (blanco y negro,
 * detección de esquinas, enderezado y giros).
 * Cada petición lleva un id para resolver su promesa cuando el worker responde.
 */
import type { PeticionWorker } from '../tipos';

const worker = new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' });

let idMensaje = 0;
const respuestas = new Map<number, (datos: unknown) => void>();

worker.addEventListener('message', (e: MessageEvent<{ id: number }>) => {
	const resolver = respuestas.get(e.data.id);
	respuestas.delete(e.data.id);
	if (resolver)
		resolver(e.data);
});

/**
 * Envía una petición al worker y devuelve una promesa con su respuesta.
 * El tipo de la respuesta lo indica quien llama según la petición enviada.
 */
export function enviarAlWorker<R>(peticion: PeticionWorker): Promise<R> {
	return new Promise<R>((resolve) => {
		const id = ++idMensaje;
		respuestas.set(id, resolve as (datos: unknown) => void);
		worker.postMessage({ ...peticion, id });
	});
}

// En desarrollo se expone el envío al worker para los bancos de detección
// (end-to-end). Con el build de producción esta rama se elimina por completo.
if (import.meta.env.DEV)
	(window as unknown as { enviarAlWorker: typeof enviarAlWorker }).enviarAlWorker = enviarAlWorker;
