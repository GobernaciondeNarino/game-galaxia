/**
 * Avisos — los mensajes breves que aparecen sobre la escena.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * ──────────────────────────
 * La barra superior tenía un rótulo central donde caían mensajes de dos clases
 * muy distintas mezclados. Al reducir la barra a una sola línea ese rótulo
 * desapareció de la vista, y con él se fueron avisos que sí hacen falta: el más
 * grave, «el navegador bloquea el audio hasta que toques la pantalla». Sin ese
 * aviso, quien abre ORBIS y no oye nada no tiene forma de saber por qué.
 *
 * LA DISTINCIÓN QUE JUSTIFICA SEPARARLOS
 * ──────────────────────────────────────
 * · Un ESTADO —«Sesión de Ana», «Marte · seguimiento activo»— describe cómo
 *   está la aplicación ahora mismo. Es permanente mientras dure, y se pidió
 *   explícitamente que no ocupara sitio en pantalla. Sigue yendo por
 *   `BarraSuperior.establecerSubtitulo`, que hoy es una región viva invisible:
 *   los lectores de pantalla lo reciben y la vista no se estrecha.
 * · Un AVISO —«toca la pantalla para permitir el audio», «narración con la voz
 *   del navegador»— cuenta algo que ACABA DE PASAR y que puede requerir una
 *   reacción. Si no se ve, no sirve. Va aquí.
 *
 * Meter ambas cosas por el mismo canal obligaba a elegir entre estorbar
 * siempre o no avisar nunca. Separadas, cada una hace lo suyo.
 *
 * DECISIONES DE ACCESIBILIDAD
 * ───────────────────────────
 * · El contenedor es `role="status"` con `aria-live="polite"`: se anuncia sin
 *   robar el foco ni interrumpir lo que se esté leyendo. Por eso los avisos NO
 *   pasan además por `anunciar()`: se oirían dos veces.
 * · Todo aviso se puede cerrar a mano. Los que se van solos duran cinco
 *   segundos, y el reloj se detiene mientras el puntero está encima o el foco
 *   dentro: leer no puede ser una carrera.
 * · Los que piden una acción —el del audio bloqueado— no se van solos. Un aviso
 *   accionable que se desvanece antes de que dé tiempo a leerlo es peor que no
 *   ponerlo.
 * · No se apilan más de tres. A partir de ahí el más viejo cede el sitio: una
 *   columna creciente de avisos tapa justo lo que se ha venido a ver.
 */

import { crear } from '../utils/dom.js';

/** Lo que dura un aviso que se retira solo. */
const MS_VIDA = 5000;

/** Cuántos caben a la vez antes de que el más viejo ceda el sitio. */
const MAXIMO = 3;

/**
 * En un teléfono, uno.
 *
 * Medido a 320x568 y a 375x667: con dos avisos apilados, la pila baja hasta el
 * panel de perfil y tapa los datos del cuerpo. Un aviso que oculta justo aquello
 * de lo que avisa no es un aviso, es un estorbo. Con uno solo hay sitio de
 * sobra, y en una pantalla de ese tamaño tampoco es razonable pedir que se lean
 * tres cosas a la vez.
 */
const MAXIMO_ESTRECHO = 1;
const ESTRECHO = window.matchMedia?.('(max-width: 720px)');

export class Avisos {
  /** @param {HTMLElement} contenedor la zona de la HUD donde se dibujan */
  constructor(contenedor) {
    this.lista = crear('div', {
      class: 'avisos',
      role: 'status',
      'aria-live': 'polite',
      'aria-label': 'Avisos del sistema',
    });
    contenedor.append(this.lista);

    /** @type {Map<string, {nodo: HTMLElement, temporizador: number|null}>} */
    this.abiertos = new Map();
    this._siguienteClave = 0;
  }

  /**
   * Muestra un aviso.
   *
   * @param {string} texto        lo que se cuenta, en una frase
   * @param {object} opciones
   * @param {'info'|'aviso'|'alerta'} opciones.tono  cómo se colorea
   * @param {string}  [opciones.clave]        identidad del aviso: uno nuevo con
   *                                          la misma clave sustituye al
   *                                          anterior en lugar de apilarse
   * @param {boolean} [opciones.persistente]  si es true, no se va solo
   * @returns {string} la clave, para poder retirarlo luego
   */
  mostrar(texto, { tono = 'info', clave, persistente = false } = {}) {
    const id = clave ?? `aviso-${this._siguienteClave++}`;
    this.retirar(id);

    // Un aviso repetido palabra por palabra no aporta nada y sí desplaza a los
    // demás. Ocurre de verdad: el cambio de escala se emite varias veces
    // seguidas mientras la cámara se aleja.
    for (const [otraClave, abierto] of this.abiertos) {
      if (abierto.nodo.dataset.texto === texto) this.retirar(otraClave);
    }

    // Se consulta en cada aviso, no una vez al construir: la pantalla puede
    // girar, y un teléfono en horizontal pasa de 375 a 667 px de ancho.
    const tope = ESTRECHO?.matches ? MAXIMO_ESTRECHO : MAXIMO;
    while (this.abiertos.size >= tope) {
      this.retirar(this.abiertos.keys().next().value);
    }

    const cerrar = crear('button', {
      class: 'aviso__cerrar',
      type: 'button',
      'aria-label': 'Cerrar el aviso',
      onclick: () => this.retirar(id),
    }, [crear('span', { 'aria-hidden': 'true', text: '✕' })]);

    const nodo = crear('div', {
      class: 'aviso',
      dataset: { tono, texto },
    }, [
      crear('p', { class: 'aviso__texto', text: texto }),
      cerrar,
    ]);

    // El reloj se para mientras se está leyendo. Sin esto, un aviso largo se
    // desvanece a media frase en cuanto alguien se acerca a leerlo.
    const registro = { nodo, temporizador: null };
    if (!persistente) {
      const arrancar = () => {
        clearTimeout(registro.temporizador);
        registro.temporizador = setTimeout(() => this.retirar(id), MS_VIDA);
      };
      const parar = () => clearTimeout(registro.temporizador);

      nodo.addEventListener('pointerenter', parar);
      nodo.addEventListener('pointerleave', arrancar);
      nodo.addEventListener('focusin', parar);
      nodo.addEventListener('focusout', arrancar);
      arrancar();
    }

    this.lista.append(nodo);
    this.abiertos.set(id, registro);
    return id;
  }

  /** Retira un aviso por su clave. Si no existe, no pasa nada. */
  retirar(clave) {
    const abierto = this.abiertos.get(clave);
    if (!abierto) return;
    clearTimeout(abierto.temporizador);
    abierto.nodo.remove();
    this.abiertos.delete(clave);
  }

  /** ¿Está abierto ese aviso? Lo usan las pruebas. */
  tiene(clave) {
    return this.abiertos.has(clave);
  }

  /** Cuántos hay ahora mismo. Lo usan las pruebas. */
  get cantidad() {
    return this.abiertos.size;
  }

  destruir() {
    for (const clave of [...this.abiertos.keys()]) this.retirar(clave);
    this.lista.remove();
  }
}
