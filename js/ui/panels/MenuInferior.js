/**
 * MenuInferior — la barra fija de navegación, abajo.
 *
 * PARA QUÉ PANTALLAS
 * ──────────────────
 * Solo por debajo de 1024 px. En un escritorio la HUD ya tiene sitio para
 * enseñarlo todo a la vez —dos columnas de paneles, la tira de cuerpos y los
 * controles— y una barra fija abajo le robaría alto sin ordenar nada. En una
 * pantalla estrecha pasa lo contrario: no cabe todo, hay que elegir, y sin un
 * sitio fijo donde elegir la aplicación se convierte en un montón de cosas
 * apiladas.
 *
 * CINCO DESTINOS, NI UNO MÁS
 * ──────────────────────────
 * Es el tope que fija Material Design para una barra inferior, y no es
 * arbitrario: con seis o más, los rótulos dejan de caber en un teléfono de 320
 * px y los objetivos táctiles bajan de los 44 px. Cada uno lleva icono Y
 * rótulo; solo con iconos, la mitad de la gente adivina mal para qué sirven.
 *
 * SOLO NIVEL SUPERIOR
 * ───────────────────
 * Una barra inferior lleva a SITIOS, no ejecuta acciones sueltas ni anida
 * submenús. Por eso no están aquí ni el reloj, ni la escala, ni el volumen:
 * esos son ajustes de lo que se está viendo y viven en el panel de controles,
 * donde llevan desde la fase 2.
 *
 * EL ÁREA SEGURA NO ES OPCIONAL
 * ─────────────────────────────
 * En un iPhone la franja de abajo la ocupa el indicador de inicio, y cualquier
 * cosa pegada al borde queda debajo de él: se ve, pero no se puede pulsar. De
 * ahí el `env(safe-area-inset-bottom)` en el CSS. La captura de referencia que
 * motivó esta barra era justamente un iPhone.
 */

import { crear, anunciar } from '../../utils/dom.js';

/**
 * Los cinco destinos.
 *
 * Los símbolos son texto y no imágenes a propósito: no hay que servir ni
 * liberar nada, escalan con el tipo de letra y se pueden leer en voz alta si
 * hiciera falta. Van con `aria-hidden` porque el rótulo de al lado ya nombra el
 * destino, y leerlo dos veces cansa.
 */
const DESTINOS = [
  {
    id: 'sistema', etiqueta: 'Sistema', simbolo: '☀',
    titulo: 'Vista general del Sistema Solar',
  },
  {
    id: 'galaxia', etiqueta: 'Galaxia', simbolo: '◎',
    titulo: 'Alejar hasta ver el disco de la Vía Láctea',
  },
  {
    id: 'cuerpos', etiqueta: 'Cuerpos', simbolo: '◍',
    titulo: 'Elegir un cuerpo del Sistema Solar',
  },
  {
    id: 'datos', etiqueta: 'Datos', simbolo: '▤',
    titulo: 'Ficha del cuerpo que se está mirando',
  },
  {
    id: 'asistente', etiqueta: 'Asistente', simbolo: '◈',
    titulo: 'Hablar con ORBIS y preguntarle lo que sea',
  },
];

export class MenuInferior {
  /**
   * @param {HTMLElement} contenedor
   * @param {object} acciones { alElegir(id) }
   */
  constructor(contenedor, { alElegir } = {}) {
    this.alElegir = alElegir;
    this.botones = new Map();

    this.nav = crear('nav', {
      class: 'menu-inferior',
      'aria-label': 'Secciones de ORBIS',
    }, DESTINOS.map((d) => {
      const boton = crear('button', {
        class: 'menu-inferior__destino',
        type: 'button',
        dataset: { destino: d.id },
        title: d.titulo,
        // `aria-current="page"` y no `aria-pressed`: esto es navegación entre
        // secciones, no un interruptor que se queda hundido.
        onclick: () => this.elegir(d.id),
      }, [
        crear('span', { class: 'menu-inferior__simbolo', 'aria-hidden': 'true', text: d.simbolo }),
        crear('span', { class: 'menu-inferior__rotulo', text: d.etiqueta }),
      ]);
      this.botones.set(d.id, boton);
      return boton;
    }));

    contenedor.append(this.nav);
    this.marcar('sistema');
  }

  elegir(id) {
    this.marcar(id);
    this.alElegir?.(id);
    const destino = DESTINOS.find((d) => d.id === id);
    if (destino) anunciar(`${destino.etiqueta}. ${destino.titulo}.`);
  }

  /** Deja marcado el destino activo, sin ejecutar su acción. */
  marcar(id) {
    this.activo = id;
    for (const [clave, boton] of this.botones) {
      if (clave === id) boton.setAttribute('aria-current', 'page');
      else boton.removeAttribute('aria-current');
    }
    document.body.dataset.seccion = id;
  }

  /** El destino marcado ahora mismo. Lo usan las pruebas. */
  get seleccionado() {
    return this.activo;
  }

  destruir() {
    this.nav.remove();
    delete document.body.dataset.seccion;
  }
}
