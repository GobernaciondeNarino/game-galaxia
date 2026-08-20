/**
 * App — el único objeto global de ORBIS.
 *
 * Todo lo demás son módulos ES sin estado compartido. App guarda el estado de
 * la sesión y hace de bus de eventos entre subsistemas (escena, HUD, entradas,
 * audio) para que ninguno tenga que conocer a los otros.
 */

import { preferencias } from '../utils/storage.js';

const oyentes = new Map();

export const App = {
  version: '0.1.0',
  faseImplementada: 0,

  /** Estado de sesión. Solo se modifica a través de App.definir(). */
  estado: {
    vista: 'sistema',        // 'sistema' | 'cuerpo'
    cuerpoActivo: null,      // id del cuerpo enfocado
    cargando: true,
    datos: null,             // contenido de data/sistema-solar.json
    fps: 0,
    tiempoSimulado: null,    // Date simulada del reloj de la escena
  },

  preferencias,

  /** Referencias a subsistemas, rellenadas por cada módulo al inicializarse. */
  subsistemas: {
    escena: null,
    hud: null,
    manos: null,
    voz: null,
    narrador: null,
  },

  /**
   * Cambia una clave del estado y emite `estado:<clave>` con el valor nuevo.
   * Evita re-emitir cuando el valor no cambia (importante para el bucle de
   * render, que actualiza fps en cada fotograma).
   */
  definir(clave, valor) {
    if (this.estado[clave] === valor) return valor;
    const anterior = this.estado[clave];
    this.estado[clave] = valor;
    this.emitir(`estado:${clave}`, { valor, anterior });
    return valor;
  },

  /** Suscribe a un evento. Devuelve la función de cancelación. */
  al(evento, fn) {
    if (!oyentes.has(evento)) oyentes.set(evento, new Set());
    oyentes.get(evento).add(fn);
    return () => oyentes.get(evento)?.delete(fn);
  },

  emitir(evento, detalle) {
    for (const fn of oyentes.get(evento) ?? []) {
      try {
        fn(detalle);
      } catch (err) {
        console.error(`[ORBIS] Fallo en un oyente de "${evento}":`, err);
      }
    }
  },
};

// Exposición explícita y única en window: facilita la depuración desde la
// consola del navegador sin que ningún módulo dependa del ámbito global.
globalThis.App = App;
