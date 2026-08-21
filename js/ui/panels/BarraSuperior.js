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
 * Pestañas de módulo del pliego. Las tres primeras filtran la columna derecha;
 * las dos últimas no existen y se declaran como tales, desactivadas y con el
 * motivo en el título. Una pestaña que se puede pulsar y no hace nada es peor
 * que una pestaña apagada que explica por qué.
 *
 * La nota decía «llega en la fase 7» y «llega en la fase 8», y ambas fases ya
 * están cerradas sin que estos dos módulos entraran en el alcance: la promesa
 * había caducado y seguía en pantalla.
 */
const MODULOS = [
  { id: 'sistema', etiqueta: 'Sistema', activo: true, nota: 'todos los paneles' },
  { id: 'sensores', etiqueta: 'Sensores', activo: true, nota: 'atmósfera, geología y magnetosfera' },
  { id: 'analitica', etiqueta: 'Analítica', activo: true, nota: 'mapa orbital y datos comparados' },
  { id: 'asistente', etiqueta: 'Asistente', activo: false, nota: 'no implementado' },
  { id: 'tecnologia', etiqueta: 'Tecnología', activo: false, nota: 'no implementado' },
];

const INDICADORES = [
  { id: 'camara', etiqueta: 'Cámara', simbolo: '◉' },
  { id: 'microfono', etiqueta: 'Micrófono', simbolo: '▮' },
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
        const nodo = crear('li', {
          class: 'indicador',
          dataset: { indicador: i.id, estado: 'inactivo' },
        }, [
          i.simbolo ? crear('span', { class: 'indicador__simbolo', 'aria-hidden': 'true', text: i.simbolo }) : null,
          crear('span', { class: 'indicador__etiqueta', text: i.etiqueta }),
          valor,
        ]);
        this.indicadores.set(i.id, { nodo, valor });
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
