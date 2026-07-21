/**
 * Comunicación con el WebWorker que procesa la imagen (blanco y negro,
 * detección de esquinas, enderezado y giros).
 * Cada petición lleva un id para resolver su promesa cuando el worker responde.
 */
import type { PeticionWorker } from '../tipos';

const worker = new Worker(new URL('../worker/worker.ts', import.meta.url), { type: 'module' });

let idMensaje = 0;
const respuestas = new Map<number, { resolver: (datos: unknown) => void; rechazar: (error: unknown) => void }>();

worker.addEventListener('message', (e: MessageEvent<{ id: number }>) => {
	const pendiente = respuestas.get(e.data.id);
	if (pendiente) {
		respuestas.delete(e.data.id);
		pendiente.resolver(e.data);
	}
});

// si el worker lanza un error no atendido, ninguna respuesta pendiente llegará:
// se rechazan todas para que quien esperaba se entere en vez de colgarse
worker.addEventListener('error', (e) => {
	const error = new Error('Error en el worker: ' + e.message);
	for (const { rechazar } of respuestas.values())
		rechazar(error);
	respuestas.clear();
});

/**
 * Envía una petición al worker y devuelve una promesa con su respuesta.
 * El tipo de la respuesta lo indica quien llama según la petición enviada.
 * `transferibles` mueve objetos al worker en vez de clonarlos (p. ej. el bitmap
 * de entrada, que el hilo principal ya no necesita).
 */
export function enviarAlWorker<R>(peticion: PeticionWorker, transferibles: Transferable[] = []): Promise<R> {
	return new Promise<R>((resolve, reject) => {
		const id = ++idMensaje;
		respuestas.set(id, { resolver: resolve as (datos: unknown) => void, rechazar: reject });
		worker.postMessage({ ...peticion, id }, transferibles);
	});
}

// En desarrollo se expone el envío al worker para los bancos de detección
// (end-to-end). Con el build de producción esta rama se elimina por completo.
if (import.meta.env.DEV)
	(window as unknown as { enviarAlWorker: typeof enviarAlWorker }).enviarAlWorker = enviarAlWorker;
