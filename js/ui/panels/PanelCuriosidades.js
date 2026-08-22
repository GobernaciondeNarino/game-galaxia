/**
 * Panel del módulo ASISTENTE.
 *
 * La pestaña llevaba desde la fase 4 apagada y con la nota «no implementado».
 * Lo que faltaba no era un interruptor: era esto.
 *
 * QUÉ HACE QUE VALGA LA PENA
 * ──────────────────────────
 * Un asistente al que hay que adivinarle las preguntas no sirve de mucho. Aquí
 * están escritas todas las que entiende —las diecinueve, ni una más ni una
 * menos, sacadas del mismo data/preguntas.json que usa el reconocedor de voz—,
 * y cada una se puede pulsar para preguntarla sobre el cuerpo que se esté
 * mirando. Quien no quiera hablar obtiene lo mismo con el ratón, y quien vaya a
 * hablar ya sabe qué decir.
 *
 * La lista se genera del vocabulario, no se escribe a mano: si mañana se añade
 * un atributo, aparece aquí solo. Una lista copiada se habría quedado obsoleta
 * a la primera.
 *
 * LO QUE NO HACE
 * ──────────────
 * No inventa respuestas ni las guarda. Pulsar una pregunta es exactamente lo
 * mismo que decirla en voz alta: pasa por el mismo reconocedor y la contesta el
 * mismo servidor, con su fuente. Si el catálogo no tiene el dato, dice que no
 * lo tiene, igual que por voz.
 */

import { crear, $ } from '../../utils/dom.js';
import { App } from '../../core/App.js';

export class PanelCuriosidades {
  /**
   * @param {HTMLElement} contenedor  la columna derecha
   * @param {object} opciones
   * @param {(texto: string) => Promise<boolean>} opciones.alPreguntar
   * @param {() => void} opciones.alCambiarNombre
   */
  constructor(contenedor, { alPreguntar, alCambiarNombre } = {}) {
    this.alPreguntar = alPreguntar;
    this.alCambiarNombre = alCambiarNombre;
    this.cuerpoMostrado = null;

    this.nombre = crear('p', { class: 'curiosidades__nombre' });
    this.botonNombre = crear('button', {
      class: 'curiosidades__enlace',
      type: 'button',
      onclick: () => this.alCambiarNombre?.(),
    });

    // El sujeto de las preguntas. Sin él, «¿cuánto pesa?» no tiene a quién
    // preguntarle, y una fila de botones que no dicen sobre qué preguntan es
    // una fila de botones a ciegas.
    this.sujeto = crear('strong', { class: 'curiosidades__sujeto', text: '—' });

    this.preguntas = crear('div', { class: 'curiosidades__preguntas' });

    this.ultimo = crear('p', { class: 'curiosidades__ultimo', text: 'Nada todavía.' });

    this.panel = crear('section', {
      class: 'panel panel--derecha panel--curiosidades',
      dataset: { modulos: 'curiosidades' },
    }, [
      crear('h2', { class: 'panel__titulo', text: 'Asistente' }),

      crear('div', { class: 'curiosidades__bloque' }, [
        this.nombre,
        this.botonNombre,
      ]),

      crear('div', { class: 'curiosidades__bloque' }, [
        crear('p', { class: 'curiosidades__rotulo' }, [
          'Pregúntame sobre ', this.sujeto,
        ]),
        this.preguntas,
        crear('p', { class: 'curiosidades__pie', text: 'Pulsa una, o dila en voz alta con el micrófono encendido. Responde con el dato del catálogo y su fuente; si no lo tiene, te lo dice.' }),
      ]),

      crear('div', { class: 'curiosidades__bloque' }, [
        crear('p', { class: 'curiosidades__rotulo', text: 'Lo último que entendí' }),
        this.ultimo,
      ]),
    ]);

    contenedor.append(this.panel);

    this._cancelaciones = [
      App.al('estado:nombre', () => this.actualizarNombre()),
      // Lo que llega por voz y lo que se pulsa aquí se muestran en el mismo
      // sitio a propósito: son la misma conversación por dos vías distintas.
      App.al('voz:comando', ({ texto }) => this.mostrarUltimo(texto, 'voz')),
    ];

    this.actualizarNombre();
  }

  /**
   * Rellena la lista de preguntas a partir del vocabulario.
   *
   * Se llama una vez, cuando el reconocedor está listo. Antes de eso el panel
   * existe y dice que aún no puede: prometer preguntas que todavía no se
   * entienden sería mentir durante los dos segundos de la carga.
   */
  establecerVocabulario(atributos) {
    this.preguntas.replaceChildren(...atributos.map(({ id, etiqueta, ejemplo }) =>
      crear('button', {
        class: 'curiosidades__pregunta',
        type: 'button',
        dataset: { atributo: id },
        title: `Preguntar «${ejemplo}»`,
        onclick: () => this._preguntar(ejemplo, etiqueta),
      }, [etiqueta])));
  }

  async _preguntar(ejemplo, etiqueta) {
    this.mostrarUltimo(`${etiqueta} de ${this.sujeto.textContent}`, 'pulsacion');
    const respondida = await this.alPreguntar?.(ejemplo);
    if (!respondida) {
      this.ultimo.textContent = `«${etiqueta}» — no he podido responder a eso.`;
    }
  }

  /** El cuerpo sobre el que preguntan los botones. */
  mostrar(cuerpo) {
    this.cuerpoMostrado = cuerpo;
    this.sujeto.textContent = cuerpo?.nombre ?? '—';
  }

  mostrarUltimo(texto, origen) {
    if (!texto) return;
    this.ultimo.textContent = origen === 'voz' ? `Te oí: «${texto}»` : `Preguntaste: ${texto}`;
  }

  actualizarNombre() {
    const nombre = App.estado.nombre;
    this.nombre.textContent = nombre
      ? `Te llamo ${nombre}.`
      : 'Aún no me has dicho cómo llamarte, así que hablo en general.';
    this.botonNombre.textContent = nombre ? 'Cambiar el nombre' : 'Decirme tu nombre';
  }

  destruir() {
    for (const cancelar of this._cancelaciones ?? []) cancelar();
    this.panel.remove();
  }
}

/** El identificador del panel, para las pruebas. */
export const SELECTOR_CURIOSIDADES = '.panel--curiosidades';

/** Atajo para las pruebas: los botones de pregunta que hay ahora mismo. */
export const preguntasVisibles = (raiz = document) =>
  [...raiz.querySelectorAll('.curiosidades__pregunta')].map((b) => b.dataset.atributo);

export const tituloCuriosidades = (raiz = document) =>
  $('.panel--curiosidades .panel__titulo', raiz)?.textContent ?? '';
