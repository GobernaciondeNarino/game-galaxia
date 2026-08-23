/**
 * Bienvenida — el saludo del asistente y la pregunta por el nombre.
 *
 * Aparece una sola vez, al terminar de cargar. Es lo primero que se ve, así que
 * tiene tres obligaciones y ninguna es decorativa:
 *
 *   1. NO BLOQUEAR. Se puede seguir sin dar el nombre, y el botón de seguir sin
 *      darlo está a la vista desde el principio, no escondido. Pedir un dato
 *      para dejar entrar es de formulario, no de asistente.
 *   2. NO PEDIR PERMISOS. Ni cámara ni micrófono. El pliego lo prohíbe al
 *      cargar y aquí es justo cuando más tentador sería.
 *   3. NO GUARDAR NADA. El nombre vive en memoria mientras dure la pestaña.
 *      Ni localStorage ni cookies ni una petición al servidor para conservarlo.
 *      Se dice explícitamente en pantalla, porque escribir tu nombre en una web
 *      merece saber a dónde va.
 *
 * El foco entra en el campo al abrirse y no puede salirse del diálogo mientras
 * está abierto: es modal de verdad, no un panel con aspecto de modal.
 */

import { crear, $, anunciar } from '../utils/dom.js';
import { App } from '../core/App.js';

/** Lo mismo que valida el servidor en api/lib/Asistente.php. */
const MAX_NOMBRE = 24;
const MAX_PALABRAS = 3;
const FORMA_NOMBRE = /^[\p{L}][\p{L} '’-]*$/u;

/**
 * ¿Esto parece un nombre? Se comprueba aquí solo para poder avisar al momento;
 * quien decide de verdad es el servidor, que vuelve a validarlo por su cuenta.
 * Una validación en el navegador es una cortesía, nunca una defensa.
 */
export function pareceNombre(crudo) {
  const nombre = String(crudo ?? '').replace(/\s+/gu, ' ').trim();
  if (!nombre || nombre.length > MAX_NOMBRE) return null;
  if (!FORMA_NOMBRE.test(nombre)) return null;
  if (nombre.split(' ').length > MAX_PALABRAS) return null;
  return nombre;
}

export class Bienvenida {
  /**
   * @param {object} acciones { alTerminar(nombre|null) }
   */
  constructor({ alTerminar } = {}) {
    this.alTerminar = alTerminar;
    this._cerrada = false;

    this.campo = crear('input', {
      class: 'bienvenida__campo',
      type: 'text',
      id: 'bienvenida-nombre',
      name: 'nombre',
      autocomplete: 'given-name',
      maxlength: String(MAX_NOMBRE),
      placeholder: 'Escribe tu nombre',
      'aria-describedby': 'bienvenida-aviso bienvenida-error',
      oninput: () => this._validarEnVivo(),
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this._aceptar(); }
      },
    });

    this.error = crear('p', { class: 'bienvenida__error', id: 'bienvenida-error', role: 'alert', hidden: true });

    this.botonAceptar = crear('button', {
      class: 'controles__boton bienvenida__principal',
      type: 'button',
      onclick: () => this._aceptar(),
      text: 'Encantado',
    });

    this.botonOmitir = crear('button', {
      class: 'controles__boton',
      type: 'button',
      onclick: () => this._cerrar(null),
      text: 'Prefiero no decirlo',
    });

    this.panel = crear('div', {
      class: 'panel bienvenida',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'bienvenida-titulo',
      onkeydown: (e) => this._teclado(e),
    }, [
      crear('p', { class: 'bienvenida__marca', text: 'ORBIS' }),
      crear('h2', { class: 'bienvenida__titulo', id: 'bienvenida-titulo', text: 'Hola. Soy ORBIS.' }),
      crear('p', { class: 'bienvenida__texto' }, [
        crear('span', { text: 'Voy a acompañarte por el Sistema Solar. Todo lo que te cuente son medidas reales, con su fuente: si de algo no hay dato, te lo diré en vez de inventarlo.' }),
      ]),
      crear('p', { class: 'bienvenida__pregunta', text: '¿Cómo te llamo?' }),
      crear('label', { class: 'bienvenida__etiqueta', for: 'bienvenida-nombre', text: 'Tu nombre' }),
      this.campo,
      this.error,
      crear('p', { class: 'bienvenida__aviso', id: 'bienvenida-aviso', text: 'Se queda en esta pestaña y se olvida al recargar. No se guarda en ningún sitio ni se comparte.' }),
      crear('div', { class: 'bienvenida__botones' }, [this.botonAceptar, this.botonOmitir]),
    ]);

    this.velo = crear('div', { class: 'bienvenida__velo' }, [this.panel]);
    document.body.append(this.velo);

    this._focoAnterior = document.activeElement;
    this.campo.focus();
    anunciar('Hola, soy ORBIS. ¿Cómo te llamo? Puedes seguir sin decirlo.');
  }

  /** Avisa mientras se escribe, sin regañar por adelantado. */
  _validarEnVivo() {
    const crudo = this.campo.value;
    // Con el campo vacío no hay nada que corregir: el botón de omitir sigue ahí.
    if (!crudo.trim()) {
      this._mostrarError(null);
      return;
    }
    this._mostrarError(pareceNombre(crudo) ? null : 'Solo letras, espacios, apóstrofos y guiones.');
  }

  _mostrarError(texto) {
    this.error.hidden = !texto;
    this.error.textContent = texto ?? '';
    this.campo.setAttribute('aria-invalid', texto ? 'true' : 'false');
  }

  _aceptar() {
    const crudo = this.campo.value;
    // Sin nada escrito, «Encantado» equivale a seguir sin nombre. Es lo que
    // espera quien pulsa un botón sin haber rellenado nada.
    if (!crudo.trim()) {
      this._cerrar(null);
      return;
    }

    const nombre = pareceNombre(crudo);
    if (!nombre) {
      this._mostrarError('Solo letras, espacios, apóstrofos y guiones.');
      this.campo.focus();
      return;
    }
    this._cerrar(nombre);
  }

  /** Atrapa el foco dentro del diálogo y deja salir con Escape. */
  _teclado(evento) {
    if (evento.key === 'Escape') {
      evento.preventDefault();
      this._cerrar(null);
      return;
    }
    if (evento.key !== 'Tab') return;

    const focos = this.panel.querySelectorAll('input, button');
    if (!focos.length) return;
    const primero = focos[0];
    const ultimo = focos[focos.length - 1];

    if (evento.shiftKey && document.activeElement === primero) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primero.focus();
    }
  }

  _cerrar(nombre) {
    if (this._cerrada) return;
    this._cerrada = true;

    this.velo.dataset.saliendo = 'si';
    // Se espera a que termine la transición antes de retirarlo del DOM, pero
    // sin depender de que el evento llegue: con movimiento reducido la
    // transición dura un milisegundo y `transitionend` puede no dispararse.
    setTimeout(() => this.destruir(), 400);

    App.definir('nombre', nombre);
    this.alTerminar?.(nombre);
  }

  destruir() {
    this.velo.remove();
    if (this._focoAnterior?.isConnected) this._focoAnterior.focus();
    else $('#hud')?.querySelector('button')?.focus?.();
  }
}
