/**
 * Barra superior: identidad del sistema, reloj de misión, pestañas de módulo e
 * indicadores de estado.
 *
 * Los indicadores dicen la verdad: el de cámara y el de micrófono están en gris
 * hasta que el usuario los activa de verdad, y el de red refleja el estado real
 * de `navigator.onLine`. Un panel de estado que siempre está en verde no es
 * decoración, es desinformación.
 */

import { crear, $ } from '../../utils/dom.js';
import { App } from '../../core/App.js';

/**
 * Pestañas de módulo. Todas filtran la columna derecha y todas hacen algo: no
 * queda ninguna apagada.
 *
 * TECNOLOGÍA se ha eliminado. Llevaba desde la fase 4 desactivada prometiendo
 * un módulo que nunca entró en el alcance, y no había con qué llenarlo: en el
 * catálogo no hay ni un dato de misiones ni de sondas. Una pestaña que no va a
 * existir ocupa sitio y promete algo que no llega.
 *
 * CURIOSIDADES es lo que antes se llamaba «Asistente»: la lista de lo que se
 * puede preguntar sobre el cuerpo que se está mirando, con las preguntas ya
 * escritas. Sigue siendo útil precisamente por eso: enseña qué hay.
 *
 * ASISTENTE es ahora otra cosa: una conversación de verdad, donde se pregunta
 * lo que sea. Son dos formas distintas de lo mismo —explorar sin saber qué
 * pedir, o pedir lo que ya se sabe— y por eso conviven.
 */
const MODULOS = [
  { id: 'sistema', etiqueta: 'Sistema', activo: true, nota: 'todos los paneles' },
  { id: 'sensores', etiqueta: 'Sensores', activo: true, nota: 'atmósfera, geología y magnetosfera' },
  { id: 'analitica', etiqueta: 'Analítica', activo: true, nota: 'mapa orbital y datos comparados' },
  { id: 'curiosidades', etiqueta: 'Curiosidades', activo: true, nota: 'qué puedes preguntarme sobre este cuerpo' },
  { id: 'asistente', etiqueta: 'Asistente', activo: true, nota: 'habla con ORBIS: pregúntale cualquier cosa' },
];

/**
 * Indicadores de estado. Los dos primeros son además el interruptor de su
 * entrada: pulsarlos enciende o apaga la cámara y el micrófono.
 *
 * POR QUÉ AQUÍ, SI YA HAY BOTONES EN OTROS SITIOS
 * ──────────────────────────────────────────────
 * Los otros dos sitios desaparecen cuando más falta hacen. El panel de entradas
 * se oculta por debajo de 1024 px y la ventana de invitación vive dentro del
 * viewport central, que por debajo de 720 px tampoco se dibuja. En un teléfono
 * no quedaba ninguna forma de encender la cámara o el micrófono. Estos
 * indicadores sí están siempre, y ya decían el estado: darles el interruptor es
 * juntar en un sitio lo que estaba separado sin motivo.
 *
 * NO SE PIDE NINGÚN PERMISO DESDE AQUÍ
 * ────────────────────────────────────
 * El botón emite un evento y se desentiende. Quien decide es el subsistema, que
 * es también quien explica lo que implica el permiso antes de pedirlo. La barra
 * no sabe nada de MediaPipe ni de reconocimiento de voz, y así sigue.
 */
const INDICADORES = [
  {
    id: 'camara', etiqueta: 'Cámara', simbolo: '◉',
    evento: 'entrada:solicitar-camara',
    encender: 'Encender la cámara para controlar con gestos. El vídeo se procesa en tu navegador y no sale de él.',
    apagar: 'Apagar la cámara y dejar de seguir las manos.',
  },
  {
    id: 'microfono', etiqueta: 'Micrófono', simbolo: '▮',
    evento: 'entrada:solicitar-microfono',
    encender: 'Encender el micrófono para hablar con ORBIS y hacerle preguntas.',
    apagar: 'Apagar el micrófono y dejar de escuchar.',
  },
  { id: 'red', etiqueta: 'Red', simbolo: '≋' },
  { id: 'fps', etiqueta: 'FPS', simbolo: '' },
];

export class BarraSuperior {
  constructor(contenedor, { alCambiarModulo } = {}) {
    this.alCambiarModulo = alCambiarModulo;
    this.indicadores = new Map();
    this._inicioSesion = Date.now();

    this.reloj = crear('span', { class: 'barra__reloj panel__cifra', text: '0:00:00' });
    this.fecha = crear('span', { class: 'barra__fecha panel__cifra', text: '—' });

    this.pestanas = crear('nav', { class: 'barra__modulos', 'aria-label': 'Módulos' },
      MODULOS.map((m) =>
        crear('button', {
          class: 'barra__modulo',
          type: 'button',
          dataset: { modulo: m.id },
          'aria-pressed': m.id === 'sistema' ? 'true' : 'false',
          disabled: !m.activo,
          title: `${m.etiqueta} — ${m.nota}`,
          onclick: () => this._seleccionarModulo(m.id),
          text: m.etiqueta,
        })));

    this.grupoIndicadores = crear('ul', { class: 'barra__indicadores', 'aria-label': 'Estado de las entradas' },
      INDICADORES.map((i) => {
        const valor = crear('span', { class: 'indicador__valor', text: i.id === 'fps' ? '—' : 'off' });
        const contenido = [
          i.simbolo ? crear('span', { class: 'indicador__simbolo', 'aria-hidden': 'true', text: i.simbolo }) : null,
          crear('span', { class: 'indicador__etiqueta', text: i.etiqueta }),
          valor,
        ];

        // Solo la cámara y el micrófono se pueden encender. La red y los FPS se
        // leen y ya está: convertirlos en botones prometería una acción que no
        // existe, y un botón que no hace nada es peor que ningún botón.
        const interruptor = i.evento
          ? crear('button', {
            class: 'indicador__accion',
            type: 'button',
            'aria-pressed': 'false',
            title: i.encender,
            onclick: () => App.emitir(i.evento, {}),
          }, contenido)
          : null;

        const nodo = crear('li', {
          class: 'indicador',
          dataset: { indicador: i.id, estado: 'inactivo' },
        }, interruptor ? [interruptor] : contenido);

        this.indicadores.set(i.id, { nodo, valor, interruptor, definicion: i });
        if (interruptor) this._describirInterruptor(i.id, 'inactivo', 'off');
        return nodo;
      }));

    // La barra se queda con la identidad y nada más: comparte renglón con el
    // panel de controles, y todo lo que no cabía en esa línea baja a la fila de
    // debajo. Antes ocupaba tres columnas —identidad, título central y tiempos—
    // y se comía una franja de pantalla que hace falta para ver la escena.
    this.panel = crear('div', { class: 'barra' }, [
      crear('p', { class: 'barra__marca', text: 'ORBIS' }),
      crear('p', { class: 'barra__version', text: `Interfaz operativa · v${App.version}` }),
    ]);

    // Segunda fila, bajo los controles: pestañas de módulo a un lado e
    // indicadores de estado al otro.
    this.secundaria = crear('div', { class: 'barra-secundaria' }, [
      this.pestanas,
      this.grupoIndicadores,
    ]);

    // El reloj de misión y la fecha simulada dejan de mostrarse. Los nodos
    // siguen existiendo y actualizándose —el resto del código los usa y no hay
    // motivo para romperlo— pero no ocupan sitio en pantalla.
    this.tiempos = crear('div', { class: 'barra__tiempos', hidden: true }, [
      crear('span', { class: 'barra__rotulo', text: 'Misión' }), this.reloj,
      crear('span', { class: 'barra__rotulo', text: 'Fecha simulada' }), this.fecha,
    ]);

    /**
     * El antiguo título central pasa a ser una región viva invisible.
     *
     * Por ahí llegan avisos que importan —«toca la pantalla para permitir el
     * audio», el cambio de motor de narración, el aviso de escala— y borrar el
     * elemento los habría hecho desaparecer para todo el mundo. Así los lectores
     * de pantalla los siguen recibiendo y ningún `establecerSubtitulo` revienta.
     * Lo que se pierde es su sitio VISIBLE, que es lo que se pidió.
     */
    this.centro = crear('div', { class: 'barra__centro visualmente-oculto', role: 'status' }, [
      crear('p', { class: 'barra__subtitulo', id: 'barra-subtitulo', text: '' }),
    ]);

    this.panel.append(this.tiempos, this.centro);
    contenedor.append(this.panel, this.secundaria);

    this._alCambiarRed = () => this.actualizarRed();
    window.addEventListener('online', this._alCambiarRed);
    window.addEventListener('offline', this._alCambiarRed);
    this.actualizarRed();
  }

  _seleccionarModulo(id) {
    for (const boton of this.pestanas.children) {
      boton.setAttribute('aria-pressed', boton.dataset.modulo === id ? 'true' : 'false');
    }
    this.alCambiarModulo?.(id);
  }

  /** Reloj de misión: tiempo transcurrido desde que se abrió la sesión. */
  actualizarReloj(fechaSimulada) {
    const segundos = Math.floor((Date.now() - this._inicioSesion) / 1000);
    const h = Math.floor(segundos / 3600);
    const m = String(Math.floor((segundos % 3600) / 60)).padStart(2, '0');
    const s = String(segundos % 60).padStart(2, '0');
    this.reloj.textContent = `${h}:${m}:${s}`;

    if (fechaSimulada) {
      this.fecha.textContent = fechaSimulada.toLocaleDateString('es-CO', {
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
    }
  }

  establecerIndicador(id, estado, texto) {
    const indicador = this.indicadores.get(id);
    if (!indicador) return;
    indicador.nodo.dataset.estado = estado;
    indicador.valor.textContent = texto;
    if (indicador.interruptor) this._describirInterruptor(id, estado, texto);
  }

  /**
   * Pone al día lo que el interruptor dice de sí mismo.
   *
   * El nombre accesible empieza por el texto que se ve —«Cámara off»— porque el
   * criterio 2.5.3 de la WCAG exige que el nombre contenga la etiqueta visible:
   * quien dicta por voz nombra lo que lee, y si el nombre no lo incluye, no hay
   * forma de pulsarlo hablando. Detrás va lo que pasará al pulsar, que es lo
   * que de verdad hace falta saber.
   *
   * `aria-pressed` no sobra ni repite: dice si está encendido, no qué hará.
   */
  _describirInterruptor(id, estado, texto) {
    const { interruptor, definicion } = this.indicadores.get(id);
    const encendido = estado === 'activo';
    interruptor.setAttribute('aria-pressed', String(encendido));

    const accion = encendido ? definicion.apagar : definicion.encender;
    interruptor.title = accion;
    interruptor.setAttribute('aria-label', `${definicion.etiqueta} ${texto}. ${accion}`);
  }

  actualizarFps(fps) {
    // El umbral de color coincide con el objetivo del proyecto: 60 fps
    // sostenidos, nunca por debajo de 30.
    const estado = fps >= 50 ? 'activo' : fps >= 30 ? 'aviso' : 'alerta';
    this.establecerIndicador('fps', estado, String(fps));
  }

  actualizarRed() {
    const enLinea = navigator.onLine;
    this.establecerIndicador('red', enLinea ? 'activo' : 'alerta', enLinea ? 'ok' : 'sin red');
  }

  establecerSubtitulo(texto) {
    $('#barra-subtitulo', this.panel).textContent = texto;
  }

  destruir() {
    window.removeEventListener('online', this._alCambiarRed);
    window.removeEventListener('offline', this._alCambiarRed);
    this.panel.remove();
  }
}
