/**
 * EstrellaFugaz — el trazo que cruza el cielo cada cierto tiempo.
 *
 * POR QUÉ ES UNA CAPA 2D Y NO GEOMETRÍA DE THREE.JS
 * ─────────────────────────────────────────────────
 * Podría ser una malla en la escena, pero saldría peor por tres motivos. La
 * escena abarca desde 0,011 hasta cuatro millones y medio de unidades, así que
 * colocar un trazo a una distancia que se vea bien en la vista general y
 * también con la cámara pegada a Encélado es un problema sin solución buena.
 * Segundo: para poder pulsarlo haría falta un raycast, y eso deja fuera a quien
 * navega con teclado. Tercero: habría que crear y destruir geometría cada
 * quince minutos durante toda la sesión.
 *
 * Siendo un `<button>` de verdad en la capa de la HUD, se puede pulsar con el
 * ratón, con el dedo y con el tabulador; se anuncia a los lectores de pantalla;
 * y respetar `prefers-reduced-motion` es cambiar una animación, no rehacerlo.
 *
 * LO QUE SE VE ES SIMULACIÓN; LO QUE SE CUENTA, NO
 * ───────────────────────────────────────────────
 * El trazo es decorativo y lleva su marca. Lo que aparece al pulsarlo son datos
 * reales de la lluvia de meteoros que de verdad está activa en la fecha
 * simulada, con su fuente. Nunca se afirma que ESE trazo sea un meteoro
 * concreto que pasó: eso sería justo lo que el pliego prohíbe.
 *
 * SE PUEDE ATRAPAR SIN SER UN REFLEJO
 * ───────────────────────────────────
 * El trazo cruza en un par de segundos, pero sigue siendo pulsable unos
 * segundos más mientras se apaga. Un objetivo que solo dura lo que dura el
 * destello sería una prueba de reflejos, y eso deja fuera a demasiada gente
 * para lo poco que aporta.
 */

import { crear, anunciar } from '../utils/dom.js';

const REDUCIR = window.matchMedia?.('(prefers-reduced-motion: reduce)');

/** Cada cuánto cruza una, por omisión. */
export const MS_ENTRE_ESTRELLAS = 15 * 60 * 1000;

/** La primera llega antes: si no, nadie sabría que esto existe. */
const MS_PRIMERA = 90 * 1000;

/** Lo que tarda en cruzar. */
const MS_CRUCE = 2200;

/** Y cuánto más se la puede pulsar mientras se apaga. */
const MS_GRACIA = 3500;

export class EstrellaFugaz {
  /**
   * @param {HTMLElement} capa      dónde se dibuja
   * @param {object} opciones       { alObservar(), intervalo }
   */
  constructor(capa, { alObservar, intervalo = MS_ENTRE_ESTRELLAS } = {}) {
    this.capa = capa;
    this.alObservar = alObservar;
    this.intervalo = intervalo;

    this._temporizador = null;
    this._temporizadorFin = null;
    this._nodo = null;
    this._semilla = 20260821;

    this._programar(MS_PRIMERA);
  }

  /**
   * Aleatoriedad determinista para la TRAYECTORIA, que es decoración pura.
   *
   * El pliego prohíbe presentar `Math.random()` como información real, y aquí no
   * se presenta nada: por dónde cruza el trazo no es un dato de nada. Aun así
   * se usa un generador con semilla en lugar de Math.random, porque así la
   * secuencia es reproducible y las pruebas pueden comprobarla.
   */
  _aleatorio() {
    this._semilla = (this._semilla * 1664525 + 1013904223) >>> 0;
    return this._semilla / 4294967296;
  }

  _programar(ms) {
    clearTimeout(this._temporizador);
    this._temporizador = setTimeout(() => this.lanzar(), ms);
  }

  /** Hace cruzar una ahora mismo. */
  lanzar() {
    this._retirar();

    // Entra por el tercio superior y baja: es como se ven de verdad, y además
    // deja libre la parte de abajo, donde están los paneles.
    const desdeX = 8 + this._aleatorio() * 30;
    const desdeY = 4 + this._aleatorio() * 26;
    const largo = 26 + this._aleatorio() * 26;
    const caida = 14 + this._aleatorio() * 20;

    const boton = crear('button', {
      class: 'fugaz',
      type: 'button',
      title: '¿La has visto? Púlsala',
      'aria-label': 'Estrella fugaz. Púlsala para saber de qué lluvia de meteoros forma parte.',
      onclick: () => this._observada(),
    }, [
      crear('span', { class: 'fugaz__trazo', 'aria-hidden': 'true' }),
      crear('span', { class: 'fugaz__marca', text: 'SIMULACIÓN' }),
    ]);

    boton.style.setProperty('--desde-x', `${desdeX}vw`);
    boton.style.setProperty('--desde-y', `${desdeY}vh`);
    boton.style.setProperty('--hasta-x', `${desdeX + largo}vw`);
    boton.style.setProperty('--hasta-y', `${desdeY + caida}vh`);
    boton.style.setProperty('--giro', `${Math.atan2(caida, largo) * (180 / Math.PI)}deg`);

    // Con movimiento reducido no cruza: aparece, se queda quieta un momento y
    // se va. Sigue pudiéndose pulsar, que es lo que importa.
    if (REDUCIR?.matches) boton.dataset.quieta = 'si';

    this.capa.append(boton);
    this._nodo = boton;

    anunciar('Ha cruzado una estrella fugaz. Púlsala para saber más.');

    clearTimeout(this._temporizadorFin);
    this._temporizadorFin = setTimeout(() => this._retirar(), MS_CRUCE + MS_GRACIA);

    this._programar(this.intervalo);
  }

  _observada() {
    // Se retira al pulsarla: ya ha cumplido, y dejarla ahí mientras se lee la
    // ficha de la lluvia sería un botón que ya no lleva a ninguna parte.
    this._retirar();
    this.alObservar?.();
  }

  _retirar() {
    clearTimeout(this._temporizadorFin);
    this._nodo?.remove();
    this._nodo = null;
  }

  /** ¿Hay una cruzando ahora mismo? Lo usan las pruebas. */
  get visible() {
    return Boolean(this._nodo);
  }

  destruir() {
    clearTimeout(this._temporizador);
    this._retirar();
  }
}
