/**
 * Resolución de rutas relativas a la raíz de la aplicación.
 *
 * ORBIS puede estar desplegado en la raíz de un dominio (https://ejemplo.org/)
 * o en un subdirectorio (https://ejemplo.org/juegos/orbis/). Nada en el código
 * puede dar por hecha la primera opción: una ruta absoluta como
 * «/vendor/three/…» apuntaría a la raíz del dominio y devolvería 404.
 *
 * La raíz se deduce de la URL de este mismo módulo (js/utils/rutas.js), que
 * siempre cuelga dos niveles por debajo de la raíz de la aplicación. Es más
 * fiable que document.baseURI, que cambia según se visite con barra final
 * o sin ella.
 */

/** URL absoluta de la raíz de la aplicación, con barra final. */
export const RAIZ = new URL('../../', import.meta.url).href;

/**
 * Convierte una ruta interna en una URL absoluta válida se despliegue donde
 * se despliegue la aplicación.
 *
 *   rutaApp('data/sistema-solar.json')
 *   → https://ejemplo.org/juegos/orbis/data/sistema-solar.json
 *
 * @param {string} ruta ruta relativa a la raíz de ORBIS, sin barra inicial
 * @returns {string} URL absoluta
 */
export function rutaApp(ruta) {
  return new URL(String(ruta).replace(/^\/+/, ''), RAIZ).href;
}

/**
 * Igual que rutaApp() pero devuelve la ruta relativa al origen, más corta y
 * más legible para mostrarla en un mensaje de la interfaz.
 */
export function rutaVisible(ruta) {
  return new URL(rutaApp(ruta)).pathname;
}
