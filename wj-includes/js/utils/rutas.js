/**
 * Resolución de rutas relativas a la raíz de la aplicación.
 *
 * ORBIS puede estar desplegado en la raíz de un dominio (https://ejemplo.org/)
 * o en un subdirectorio (https://ejemplo.org/juegos/orbis/). Nada en el código
 * puede dar por hecha la primera opción: una ruta absoluta como
 * «/vendor/three/…» apuntaría a la raíz del dominio y devolvería 404.
 *
 * La raíz se deduce de la URL de este mismo módulo
 * (wj-includes/js/utils/rutas.js), que cuelga TRES niveles por debajo de la
 * raíz de la aplicación. Es más fiable que document.baseURI, que cambia según
 * se visite con barra final o sin ella.
 *
 * Si algún día se mueve este archivo, este es el número que hay que cambiar, y
 * el síntoma de no haberlo cambiado es que TODO devuelve 404 a la vez.
 */

/** URL absoluta de la raíz de la aplicación, con barra final. */
export const RAIZ = new URL('../../../', import.meta.url).href;

/**
 * Convierte una ruta interna en una URL absoluta válida se despliegue donde
 * se despliegue la aplicación.
 *
 *   rutaDatos('sistema-solar.json')
 *   → https://ejemplo.org/juegos/orbis/data/sistema-solar.json
 *
 * @param {string} ruta ruta relativa a la raíz de ORBIS, sin barra inicial
 * @returns {string} URL absoluta
 */
export function rutaApp(ruta) {
  return new URL(String(ruta).replace(/^\/+/, ''), RAIZ).href;
}

/**
 * Las tres carpetas del proyecto, en un solo sitio.
 *
 * El backend tiene lo mismo en Config::contenido() y Config::includes(). La
 * regla es la misma en los dos lados: ningún módulo escribe «wj-content/…» a
 * mano, porque entonces mover una carpeta obliga a buscar por todo el código
 * y siempre queda una sin cambiar.
 */
const CONTENIDO = 'wj-content/';
const INCLUDES = 'wj-includes/';

/** Un endpoint del backend: rutaApi('tts.php'). */
export const rutaApi = (archivo) => rutaApp(`${INCLUDES}api/${archivo}`);

/** Un archivo de datos: rutaDatos('sistema-solar.json'). */
export const rutaDatos = (archivo) => rutaApp(`${CONTENIDO}data/${archivo}`);

/** Un medio: rutaMedios('textures/sol.jpg'), rutaMedios('models/manos.task'). */
export const rutaMedios = (archivo) => rutaApp(`${CONTENIDO}assets/${archivo}`);

/** Una librería de terceros del frontend: rutaExterna('mediapipe/wasm'). */
export const rutaExterna = (archivo) => rutaApp(`${INCLUDES}externos/${archivo}`);

/**
 * Igual que rutaApp() pero devuelve la ruta relativa al origen, más corta y
 * más legible para mostrarla en un mensaje de la interfaz.
 */
export function rutaVisible(ruta) {
  return new URL(rutaApp(ruta)).pathname;
}
