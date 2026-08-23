/**
 * Cursor holográfico y aro de progreso del barrido.
 *
 * Sin retroalimentación, el control por gestos es adivinar: el usuario no sabe
 * si la mano se está viendo, dónde está ni cuánto le falta para que el gesto
 * cuente. Estas tres cosas son las que resuelve este módulo:
 *
 *   · un punto que sigue la mano, para saber que se la está viendo y dónde;
 *   · un aro que se completa mientras se barre de un extremo a otro, con el
 *     nombre de lo que va a ocurrir, de modo que se pueda abortar a tiempo;
 *   · el nombre del gesto reconocido, escrito.
 *
 * El aro solo aparece en el barrido porque es el único gesto que no se ve
 * mientras se hace: rotar y hacer zoom mueven la escena desde el primer
 * fotograma y se corrigen solos.
 */

import { crear } from '../utils/dom.js';

const ETIQUETAS = {
  ninguno: '',
  pellizco: 'Pellizco · rotando',
  'pellizco-doble': 'Pellizco doble · acercar y alejar',
  'mano-abierta': 'Mano abierta · barre para pasar',
  // Se reconocen, pero no hacen nada: nombrarlos evita que parezca que la
  // cámara ha dejado de ver la mano.
  apuntando: 'Apuntando',
  puno: 'Puño · mantén para callar',
};

const ACCIONES = {
  siguiente: 'Siguiente',
  anterior: 'Anterior',
  callar: 'Detener la narración',
};

export class CursorGestual {
  constructor(capa) {
    this.aro = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.aro.setAttribute('class', 'cursor__aro');
    this.aro.setAttribute('cx', '22');
    this.aro.setAttribute('cy', '22');
    this.aro.setAttribute('r', '17');

    const pista = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    pista.setAttribute('class', 'cursor__pista');
    pista.setAttribute('cx', '22');
    pista.setAttribute('cy', '22');
    pista.setAttribute('r', '17');

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'cursor__svg');
    this.svg.setAttribute('viewBox', '0 0 44 44');
    this.svg.append(pista, this.aro);

    this.etiquetaAccion = crear('span', { class: 'cursor__accion' });
    this.punto = crear('span', { class: 'cursor__punto', 'aria-hidden': 'true' });

    this.nodo = crear('div', { class: 'cursor', hidden: true, 'aria-hidden': 'true' }, [
      this.svg, this.punto, this.etiquetaAccion,
    ]);

    this.etiquetaGesto = crear('p', { class: 'cursor__gesto', hidden: true, role: 'status' });

    capa.append(this.nodo, this.etiquetaGesto);

    // Perímetro del aro, para calcular el trazo del progreso.
    this._perimetro = 2 * Math.PI * 17;
    this.aro.setAttribute('stroke-dasharray', String(this._perimetro));
    this.aro.setAttribute('stroke-dashoffset', String(this._perimetro));
  }

  /**
   * @param {object} estado estado devuelto por GestureRecognizer.procesar
   */
  actualizar(estado) {
    if (!estado?.cursor) {
      this.nodo.hidden = true;
      this.etiquetaGesto.hidden = true;
      return;
    }

    // La imagen de la cámara va reflejada: la x se invierte para que mover la
    // mano a la derecha mueva el cursor a la derecha.
    const x = (1 - estado.cursor.x) * window.innerWidth;
    const y = estado.cursor.y * window.innerHeight;

    this.nodo.hidden = false;
    this.nodo.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
    this.nodo.dataset.gesto = estado.gesto;

    const progreso = estado.progreso ?? 0;
    this.aro.setAttribute('stroke-dashoffset', String(this._perimetro * (1 - progreso)));
    this.etiquetaAccion.textContent = progreso > 0.02 ? (ACCIONES[estado.accionSostenida] ?? '') : '';

    const etiqueta = ETIQUETAS[estado.gesto] ?? '';
    this.etiquetaGesto.hidden = !etiqueta;
    this.etiquetaGesto.textContent = etiqueta;
  }

  ocultar() {
    this.nodo.hidden = true;
    this.etiquetaGesto.hidden = true;
  }

  destruir() {
    this.nodo.remove();
    this.etiquetaGesto.remove();
  }
}
