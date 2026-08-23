/**
 * Modo de depuración: se activa añadiendo ?debug=1 a la URL.
 * En la fase 1 alojará el panel de estadísticas (FPS, draw calls) y los
 * controles en caliente del bloom.
 */

const parametros = new URLSearchParams(location.search);

export const depuracion = {
  activo: parametros.get('debug') === '1',
  /** Nivel opcional: ?debug=1&verbose=1 */
  verboso: parametros.get('verbose') === '1',
};

/** Registro que solo escribe si ?debug=1. Evita ensuciar la consola en producción. */
export function log(...args) {
  if (depuracion.activo) console.log('%c[ORBIS]', 'color:#00E5FF', ...args);
}

/** Advertencias: siempre visibles, van precedidas de la marca del proyecto. */
export function aviso(...args) {
  console.warn('%c[ORBIS]', 'color:#E8A020', ...args);
}

/** Errores: siempre visibles. */
export function error(...args) {
  console.error('%c[ORBIS]', 'color:#FF5252', ...args);
}
