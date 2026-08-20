/**
 * Diagnóstico de arranque.
 *
 * Comprueba, en el propio navegador del usuario, que el entorno reúne lo
 * necesario para ejecutar ORBIS y lo escribe en la pantalla de arranque. Sirve
 * como prueba de humo del despliegue: si algo falla en Plesk (un MIME mal
 * configurado, la carpeta vendor/ sin subir, PHP sin curl) se ve aquí, sin
 * abrir la consola.
 */

import { $, crear } from '../utils/dom.js';

/** Resultados posibles de un chequeo. */
export const OK = 'ok';
export const AVISO = 'aviso';
export const ERROR = 'error';

const MARCAS = { [OK]: '✔', [AVISO]: '▲', [ERROR]: '✘' };

/** Comprueba que el navegador puede crear un contexto WebGL 2. */
function comprobarWebGL() {
  const lienzo = document.createElement('canvas');
  const gl = lienzo.getContext('webgl2');

  if (!gl) {
    const gl1 = lienzo.getContext('webgl');
    return gl1
      ? { resultado: ERROR, nota: 'solo WebGL 1 — ORBIS requiere WebGL 2' }
      : { resultado: ERROR, nota: 'no disponible o desactivado' };
  }

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const tarjeta = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'GPU no identificada';
  // Un contexto por software (SwiftShader, llvmpipe) funciona pero a 5-10 fps.
  const porSoftware = /swiftshader|llvmpipe|software/i.test(String(tarjeta));

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return porSoftware
    ? { resultado: AVISO, nota: 'render por software — el rendimiento será bajo' }
    : { resultado: OK, nota: String(tarjeta).slice(0, 42) };
}

/** Carga Three.js desde /vendor y devuelve la revisión encontrada. */
async function comprobarThree() {
  try {
    const THREE = await import('three');
    return { resultado: OK, nota: `r${THREE.REVISION} · local`, extra: THREE };
  } catch (err) {
    return {
      resultado: ERROR,
      nota: 'no se pudo importar — revisa /vendor y el MIME de .js',
      error: err,
    };
  }
}

/** Verifica que las fuentes autoalojadas están disponibles. */
async function comprobarFuentes() {
  if (!document.fonts?.load) return { resultado: AVISO, nota: 'API de fuentes no disponible' };
  try {
    // load() fuerza la descarga: check() por sí solo devuelve false mientras la
    // fuente no se haya solicitado todavía, aunque el @font-face sea correcto.
    const cargadas = await Promise.all([
      document.fonts.load('400 1rem Oswald'),
      document.fonts.load('400 1rem "Hind Madurai"'),
    ]);
    const faltan = cargadas.filter((f) => f.length === 0).length;
    if (faltan === 0) return { resultado: OK, nota: 'Oswald + Hind Madurai' };
    return { resultado: AVISO, nota: `${faltan} de 2 no disponibles — se usa la de respaldo` };
  } catch (err) {
    return { resultado: AVISO, nota: 'no se pudieron cargar', error: err };
  }
}

/** Descarga los datos maestros del sistema. */
async function comprobarDatos() {
  try {
    const res = await fetch('data/sistema-solar.json', { cache: 'no-cache' });
    if (!res.ok) return { resultado: ERROR, nota: `HTTP ${res.status}` };
    const datos = await res.json();
    const total = datos.cuerpos?.length ?? 0;
    return total === 0
      ? { resultado: AVISO, nota: 'catálogo vacío — se completa en la fase 2', extra: datos }
      : { resultado: OK, nota: `${total} cuerpos catalogados`, extra: datos };
  } catch (err) {
    return { resultado: ERROR, nota: 'JSON ilegible o inaccesible', error: err };
  }
}

/**
 * Consulta api/health.php. Es un AVISO y no un ERROR a propósito: abriendo
 * index.html con un servidor estático (sin PHP) la escena funciona igual;
 * solo se pierde la narración con voz de ElevenLabs.
 */
async function comprobarBackend() {
  try {
    const res = await fetch('api/health.php', { cache: 'no-store' });
    if (!res.ok) return { resultado: AVISO, nota: `sin PHP (HTTP ${res.status}) — narración local` };
    const salud = await res.json();
    if (salud.estado === 'ok') return { resultado: OK, nota: `PHP ${salud.php?.version ?? '?'}` };
    const fallos = (salud.comprobaciones ?? [])
      .filter((c) => c.resultado !== 'ok')
      .map((c) => c.clave)
      .join(', ');
    return { resultado: AVISO, nota: fallos || 'configuración incompleta', extra: salud };
  } catch {
    return { resultado: AVISO, nota: 'no alcanzable — narración con voz del navegador' };
  }
}

/** Contexto seguro: sin él no hay cámara ni micrófono. */
function comprobarContextoSeguro() {
  if (!window.isSecureContext) {
    return { resultado: AVISO, nota: 'sin HTTPS — gestos y voz quedarán desactivados' };
  }
  // localhost cuenta como contexto seguro aunque se sirva por HTTP plano.
  const esLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  return {
    resultado: OK,
    nota: location.protocol === 'https:' ? 'HTTPS' : esLocal ? 'localhost' : 'contexto seguro',
  };
}

const CHEQUEOS = [
  { clave: 'webgl',    etiqueta: 'WebGL 2',            fn: comprobarWebGL,          critico: true },
  { clave: 'three',    etiqueta: 'Three.js (local)',   fn: comprobarThree,          critico: true },
  { clave: 'fuentes',  etiqueta: 'Tipografías',        fn: comprobarFuentes,        critico: false },
  { clave: 'datos',    etiqueta: 'Datos del sistema',  fn: comprobarDatos,          critico: true },
  { clave: 'seguro',   etiqueta: 'Contexto seguro',    fn: comprobarContextoSeguro, critico: false },
  { clave: 'backend',  etiqueta: 'Backend PHP',        fn: comprobarBackend,        critico: false },
];

/**
 * Ejecuta todos los chequeos en secuencia, informando del progreso real.
 *
 * @param {(fraccion:number, texto:string)=>void} alProgresar
 * @returns {Promise<{ok:boolean, resultados:Object}>}
 */
export async function ejecutarDiagnostico(alProgresar) {
  const lista = $('#arranque-chequeos');
  const resultados = {};
  let criticoFallado = false;

  for (const [indice, chequeo] of CHEQUEOS.entries()) {
    alProgresar((indice) / CHEQUEOS.length, `Comprobando ${chequeo.etiqueta.toLowerCase()}…`);

    let salida;
    try {
      salida = await chequeo.fn();
    } catch (err) {
      salida = { resultado: ERROR, nota: err.message, error: err };
    }

    resultados[chequeo.clave] = salida;
    if (chequeo.critico && salida.resultado === ERROR) criticoFallado = true;

    lista?.append(
      crear('li', { class: 'chequeo', dataset: { resultado: salida.resultado } }, [
        crear('span', { class: 'chequeo__marca', 'aria-hidden': 'true', text: MARCAS[salida.resultado] }),
        crear('span', { text: chequeo.etiqueta }),
        crear('span', { class: 'chequeo__nota', text: salida.nota ?? '' }),
      ]),
    );

    if (salida.error) console.error(`[ORBIS] ${chequeo.etiqueta}:`, salida.error);
  }

  alProgresar(1, criticoFallado ? 'Diagnóstico con errores.' : 'Diagnóstico completado.');
  return { ok: !criticoFallado, resultados };
}
