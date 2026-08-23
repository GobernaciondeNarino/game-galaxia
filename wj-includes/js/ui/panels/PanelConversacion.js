/**
 * PanelConversacion — el asistente con el que se habla.
 *
 * QUÉ ES Y QUÉ NO ES
 * ──────────────────
 * No es una lista de preguntas previstas: eso es CURIOSIDADES y sigue estando.
 * Aquí se escribe o se dicta cualquier cosa y el servidor contesta, moviendo la
 * escena cuando hace falta. Las respuestas las compone api/chat.php contra los
 * mismos datos de siempre; este archivo no sabe nada de astronomía y no debe
 * saberlo.
 *
 * POR QUÉ EL HISTORIAL VIVE AQUÍ Y NO EN EL SERVIDOR
 * ─────────────────────────────────────────────────
 * El pliego prohíbe localStorage y sessionStorage, y una conversación guardada
 * en el servidor haría falta identificar a quien pregunta. Ninguna de las dos
 * cosas hace falta: la conversación vive en memoria, se envía entera en cada
 * turno y se olvida al recargar. Es lo correcto además de lo obligado — esto es
 * para preguntar un rato, no para que nadie lleve un registro.
 *
 * SE PUEDE USAR SIN MICRÓFONO Y SIN ALTAVOZ
 * ─────────────────────────────────────────
 * El campo de texto es la vía principal y siempre está. El micrófono es un
 * añadido, y la respuesta se lee además de oírse. Un asistente de voz que solo
 * funciona hablando deja fuera a demasiada gente.
 */

import { crear, anunciar } from '../../utils/dom.js';

/** Cuántos turnos se recuerdan. El servidor recorta igualmente. */
const TURNOS = 12;

export class PanelConversacion {
  /**
   * @param {HTMLElement} contenedor
   * @param {object} opciones { alPreguntar, alDictar, disponible }
   */
  constructor(contenedor, { alPreguntar, alDictar } = {}) {
    this.alPreguntar = alPreguntar;
    this.alDictar = alDictar;
    /** @type {{rol: string, texto: string, fuentes?: string[]}[]} */
    this.turnos = [];
    this.esperando = false;
    this.dictando = false;

    this.hilo = crear('div', {
      class: 'charla__hilo',
      role: 'log',
      'aria-live': 'polite',
      'aria-label': 'Conversación con ORBIS',
    });

    this.campo = crear('input', {
      class: 'charla__campo',
      type: 'text',
      id: 'charla-campo',
      autocomplete: 'off',
      placeholder: 'Pregúntame lo que quieras…',
      onkeydown: (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this._enviarEscrito(); }
      },
    });

    this.botonEnviar = crear('button', {
      class: 'charla__enviar', type: 'button',
      onclick: () => this._enviarEscrito(),
      text: 'Preguntar',
    });

    this.botonDictar = crear('button', {
      class: 'charla__dictar', type: 'button',
      'aria-pressed': 'false',
      title: 'Dictar la pregunta en voz alta',
      onclick: () => this.alDictar?.(),
    }, [
      crear('span', { 'aria-hidden': 'true', text: '▮' }),
      crear('span', { class: 'visualmente-oculto', text: 'Dictar la pregunta' }),
    ]);

    this.aviso = crear('p', { class: 'charla__aviso', hidden: true, role: 'status' });

    this.panel = crear('section', {
      class: 'panel panel--derecha panel--charla',
      dataset: { modulos: 'asistente' },
    }, [
      crear('h2', { class: 'panel__titulo', text: 'Asistente' }),
      this.hilo,
      this.aviso,
      crear('div', { class: 'charla__entrada' }, [
        crear('label', { class: 'visualmente-oculto', for: 'charla-campo', text: 'Tu pregunta' }),
        this.campo,
        this.botonDictar,
        this.botonEnviar,
      ]),
      crear('p', { class: 'charla__pie', text: 'Responde con los datos del catálogo y su fuente. Lo que no tiene medido, lo dice.' }),
    ]);

    contenedor.append(this.panel);
    this._pintar();
  }

  /** Deja constancia de que la conversación libre no está disponible. */
  desactivar(motivo) {
    this.desactivado = true;
    this.campo.disabled = true;
    this.botonEnviar.disabled = true;
    this.botonDictar.disabled = true;
    this.aviso.hidden = false;
    this.aviso.dataset.tono = 'aviso';
    this.aviso.textContent = motivo;
  }

  _enviarEscrito() {
    const texto = this.campo.value.trim();
    if (!texto) return;
    this.campo.value = '';
    this.preguntar(texto);
  }

  /** Lanza una pregunta, venga del teclado o del micrófono. */
  async preguntar(texto) {
    if (this.desactivado || this.esperando || !texto) return;

    this.turnos.push({ rol: 'usuario', texto });
    this.esperando = true;
    this._pintar();
    this._estado('Pensando…');

    try {
      const r = await this.alPreguntar?.(this.turnos.slice(-TURNOS));
      if (r?.texto) {
        this.turnos.push({ rol: 'asistente', texto: r.texto, fuentes: r.fuentes ?? [] });
        anunciar(r.texto);
        this._estado(null);
      } else {
        this._estado(r?.motivo ?? 'No he podido responder a eso ahora mismo.', 'alerta');
      }
    } catch (err) {
      this._estado('No he podido responder: falló la conexión con el servidor.', 'alerta');
    } finally {
      this.esperando = false;
      this._pintar();
    }
  }

  /** Refleja si el micrófono está escuchando para esta conversación. */
  establecerDictado(activo) {
    this.dictando = activo;
    this.botonDictar.setAttribute('aria-pressed', String(activo));
    this.botonDictar.title = activo ? 'Dejar de dictar' : 'Dictar la pregunta en voz alta';
    if (activo) this._estado('Te escucho…');
  }

  /** Muestra lo que se va oyendo, antes de darlo por bueno. */
  mostrarDictado(texto) {
    if (texto) this.campo.value = texto;
  }

  _estado(texto, tono = 'info') {
    this.aviso.hidden = !texto;
    this.aviso.dataset.tono = tono;
    this.aviso.textContent = texto ?? '';
  }

  _pintar() {
    this.hilo.replaceChildren(...this.turnos.map((t) => {
      const burbuja = crear('div', {
        class: 'charla__turno',
        dataset: { rol: t.rol },
      }, [
        crear('p', { class: 'charla__texto', text: t.texto }),
      ]);

      // La fuente se muestra igual que en el resto de la aplicación: no es un
      // adorno, es la diferencia entre un dato y una afirmación.
      if (t.fuentes?.length) {
        burbuja.append(crear('p', {
          class: 'charla__fuente',
          text: `Fuente: ${t.fuentes.join(' · ')}`,
        }));
      }
      return burbuja;
    }));

    if (this.esperando) {
      this.hilo.append(crear('div', { class: 'charla__turno', dataset: { rol: 'esperando' } }, [
        crear('p', { class: 'charla__texto', text: '…' }),
      ]));
    }

    this.campo.disabled = this.esperando || Boolean(this.desactivado);
    this.botonEnviar.disabled = this.campo.disabled;
    this.hilo.scrollTop = this.hilo.scrollHeight;
  }

  /** ¿Hay conversación empezada? Lo usan las pruebas. */
  get cantidadTurnos() {
    return this.turnos.length;
  }

  destruir() {
    this.panel.remove();
  }
}
