/**
Comunicación con el WebWorker que procesa la imagen
(blanco y negro, detección de esquinas, enderezado y giros).
*/
'use strict';

// WebWorker que procesa la imagen; null si no se ha podido crear
let procesadorDNI = CrearProcesador();

// Cada petición al worker lleva un id para resolver su promesa al responder
let idMensajeWorker = 0;
const respuestasWorker = new Map();
let workerEscuchado = null;

function CrearProcesador() {
	if (!window.Worker) {
		alert('El navegador no soporta WebWorkers');
		return null;
	}

	// Al usar la página como fichero, el meta CSP
	if (document.location.protocol == 'file:') {
		const metaCsp = document.getElementById('MetaCSP');
		if (metaCsp) {
			alert('Para poder ejecutar el programa desde tu ordenador necesitas eliminar la cabecera marcada como <meta id="MetaCSP"...>\r\n' +
				'Se trata de una protección adicional para el servidor web, pero en local el navegador está aplicando otras restricciones que no son compatibles.\r\n' +
				'Si no la eliminas, tendrás errores a continuación, o puede que no se muestre ningún error pero no veas tampoco la imagen de tu DNI (Firefox).');
			return null;
		}

		// al trabajar con file: no deja crear un worker usando un fichero externo, así que lo apañamos...
		// https://github.com/AlfonsoML/proteccionDNI/issues/18
		const script = document.createElement('script');
		script.src = 'worker.js';
		script.type = 'application/javascript';
		document.body.appendChild(script);

		return null;
	}

	try {
		return new Worker('worker.js');
	} catch (e) {
		console.log(e);
		alert('Error creando WebWorker\r\n' + e);
		return null;
	}
}

/**
Envía un mensaje al worker y devuelve una promesa que se resuelve con su respuesta
*/
function EnviarAlWorker(mensaje) {
	return new Promise(function (resolve, reject) {
		if (!procesadorDNI) {
			reject('No existe el objeto procesadorDNI');
			return;
		}

		// el worker se puede crear en diferido al usar file:, así que nos suscribimos al hacer la primera petición
		if (workerEscuchado != procesadorDNI) {
			procesadorDNI.addEventListener('message', function (e) {
				const resolver = respuestasWorker.get(e.data.id);
				respuestasWorker.delete(e.data.id);
				if (resolver)
					resolver(e.data);
			});
			workerEscuchado = procesadorDNI;
		}

		const id = ++idMensajeWorker;
		respuestasWorker.set(id, resolve);
		mensaje.id = id;
		procesadorDNI.postMessage(mensaje);
	});
}
