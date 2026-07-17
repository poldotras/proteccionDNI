/**
Lógica de la página de información: abrir la pregunta enlazada al llegar con un hash,
reflejar en la dirección la pregunta abierta y llevar el parámetro "para" al editor.
Es independiente del resto de ficheros de js/, que son solo para el editor.
*/
'use strict';

// llevar los parámetros de la dirección (como "para") al enlace del editor
document.getElementById('IrEditor').href = 'editor.html' + location.search;

// si se ha cargado la página con un hash, abrir esa pregunta
const hash = document.location.hash;
if (hash) {
	const info = document.querySelector(hash);
	if (info && typeof info.open != 'undefined') {
		info.open = true;
		info.firstElementChild.focus();
	}
}

// reflejar en la dirección la pregunta abierta, para poder enlazarla
document.querySelectorAll('#FAQ details[id]').forEach(elmto => {
	elmto.addEventListener('click', () => {
		if (elmto.open)
			history.replaceState(null, '', ' ')
		else
			history.replaceState(null, '', '#' + elmto.id)
	});
});

// los enlaces internos a preguntas las dejan abiertas al saltar a ellas
document.querySelectorAll('.AbrirInfo').forEach(elmto => {
	elmto.addEventListener('click', () => {
		const info = document.querySelector(elmto.getAttribute('href'));
		if (info)
			info.open = true;
	});
});
