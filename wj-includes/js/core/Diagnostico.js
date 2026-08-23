/**
 * Diagnóstico de arranque.
 *
 * Comprueba, en el propio navegador del usuario, que el entorno reúne lo
 * necesario para ejecutar ORBIS y lo escribe en la pantalla de arranque. Sirve
 * como prueba de humo del despliegue: si algo falla en Plesk (un MIME mal
 * configurado, la carpeta vendor/ sin subir, PHP sin curl) se ve aquí, sin
 * abrir la consola.
 *
 * Cada chequeo devuelve, además del resultado, DE QUIÉN es el problema
 * (`culpa`) y CÓMO se arregla (`remedio`). Un fallo del servidor no debe
 * anunciarse como una limitación del navegador de quien visita la página.
 */

import { $, crear } from '../utils/dom.js';
import { rutaApi, rutaApp, rutaDatos, rutaVisible } from '../utils/rutas.js';
import { depuracion } from '../utils/debug.js';

/** Resultados posibles de un chequeo. */
export const OK = 'ok';
export const AVISO = 'aviso';
export const ERROR = 'error';

/** A quién señala un fallo. Determina el titular del mensaje de error. */
export const NAVEGADOR = 'navegador';
export const SERVIDOR = 'servidor';

const MARCAS = { [OK]: '✔', [AVISO]: '▲', [ERROR]: '✘' };

/** Comprueba que el navegador puede crear un contexto WebGL 2. */
function comprobarWebGL() {
  const lienzo = document.createElement('canvas');
  const gl = lienzo.getContext('webgl2');

  if (!gl) {
    const soloWebGL1 = Boolean(lienzo.getContext('webgl'));
    return {
      resultado: ERROR,
      culpa: NAVEGADOR,
      nota: soloWebGL1 ? 'solo WebGL 1 disponible' : 'no disponible o desactivado',
      remedio: soloWebGL1
        ? 'ORBIS necesita WebGL 2. Actualiza el navegador a una versión reciente de Chrome, Edge, Firefox o Safari.'
        : 'Activa la aceleración por hardware en los ajustes del navegador y comprueba que los controladores de la tarjeta gráfica están al día.',
    };
  }

  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const tarjeta = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'GPU no identificada';
  // Un contexto por software (SwiftShader, llvmpipe) funciona pero a 5-10 fps.
  const porSoftware = /swiftshader|llvmpipe|software/i.test(String(tarjeta));

  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return porSoftware
    ? {
        resultado: AVISO,
        culpa: NAVEGADOR,
        nota: 'render por software — el rendimiento será bajo',
        remedio: 'Activa la aceleración por hardware en los ajustes del navegador.',
      }
    : { resultado: OK, nota: String(tarjeta).slice(0, 46) };
}

/**
 * Averigua por qué no se pudo importar un módulo: si el archivo no está en el
 * servidor, si está pero se sirve con el tipo MIME equivocado, o si es otra
 * cosa. Sin esto, todos los fallos se ven igual y no orientan a nada.
 */
async function diagnosticarModulo(rutaInterna) {
  const ruta = rutaApp(rutaInterna);
  const visible = rutaVisible(rutaInterna);
  try {
    const res = await fetch(ruta, { cache: 'no-cache' });

    if (res.status === 404) {
      return {
        nota: `no está en el servidor (404)`,
        remedio: `Falta ${visible}. Ejecuta «node tools/vendor.mjs three» y sube la carpeta vendor/ completa al servidor.`,
      };
    }
    if (res.status === 403) {
      return {
        nota: 'acceso denegado (403)',
        remedio: `El servidor bloquea ${visible}. Revisa los permisos (644) y las reglas de .htaccess.`,
      };
    }
    if (!res.ok) {
      return {
        nota: `HTTP ${res.status}`,
        remedio: `El servidor devolvió ${res.status} al pedir ${visible}. Consulta el registro de errores del dominio en Plesk.`,
      };
    }

    const tipo = (res.headers.get('content-type') ?? '').split(';')[0].trim();
    const tiposValidos = ['application/javascript', 'text/javascript', 'module'];
    if (tipo && !tiposValidos.includes(tipo)) {
      return {
        nota: `tipo MIME incorrecto (${tipo})`,
        remedio:
          'Apache está sirviendo los .js como ' +
          `${tipo} y el navegador los rechaza. Comprueba que el archivo .htaccess ` +
          'llegó al servidor y que el vhost permite AllowOverride All.',
      };
    }

    // El archivo llega bien: el fallo está dentro del propio módulo.
    return {
      nota: 'el módulo se descarga pero no se ejecuta',
      remedio:
        'El archivo existe y su tipo MIME es correcto. Revisa la consola del ' +
        'navegador: puede faltar algún archivo que este módulo importa, o la ' +
        'CSP puede estar bloqueándolo.',
    };
  } catch {
    return {
      nota: 'no se pudo contactar con el servidor',
      remedio: `No hay respuesta al pedir ${visible}. Comprueba la conexión y que la ruta de despliegue es correcta.`,
    };
  }
}

/** Carga Three.js desde vendor/ y devuelve la revisión encontrada. */
async function comprobarThree() {
  try {
    const THREE = await import('three');
    return { resultado: OK, nota: `r${THREE.REVISION} · local`, extra: THREE };
  } catch (err) {
    const causa = await diagnosticarModulo('vendor/three/build/three.module.min.js');
    return { resultado: ERROR, culpa: SERVIDOR, ...causa, error: err };
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
    return {
      resultado: AVISO,
      culpa: SERVIDOR,
      nota: `${faltan} de 2 no disponibles — se usa la de respaldo`,
      remedio: 'Comprueba que assets/fonts/ llegó al servidor y que .woff2 tiene su tipo MIME.',
    };
  } catch (err) {
    return { resultado: AVISO, nota: 'no se pudieron cargar', error: err };
  }
}

/** Descarga los datos maestros del sistema. */
async function comprobarDatos() {
  const ruta = rutaDatos('sistema-solar.json');
  const visible = rutaVisible(rutaDatos('sistema-solar.json'));
  try {
    const res = await fetch(ruta, { cache: 'no-cache' });
    if (!res.ok) {
      return {
        resultado: ERROR,
        culpa: SERVIDOR,
        nota: `HTTP ${res.status}`,
        remedio: `No se pudo leer ${visible}. Comprueba que la carpeta data/ llegó al servidor.`,
      };
    }
    const datos = await res.json();
    const total = datos.cuerpos?.length ?? 0;
    return total === 0
      ? { resultado: AVISO, nota: 'catálogo vacío — se completa en la fase 2', extra: datos }
      : { resultado: OK, nota: `${total} cuerpos catalogados`, extra: datos };
  } catch (err) {
    return {
      resultado: ERROR,
      culpa: SERVIDOR,
      nota: 'JSON ilegible o inaccesible',
      remedio: `Valida el contenido de ${visible}: debe ser JSON correcto y con permisos de lectura (644).`,
      error: err,
    };
  }
}

/**
 * Consulta api/health.php. Es un AVISO y no un ERROR a propósito: abriendo
 * index.html con un servidor estático (sin PHP) la escena funciona igual;
 * solo se pierde la narración con voz de ElevenLabs.
 */
async function comprobarBackend() {
  try {
    const res = await fetch(rutaApi('health.php'), { cache: 'no-store' });

    // Sin PHP, Apache devuelve el código fuente o un 404: en ambos casos no hay backend.
    const tipo = res.headers.get('content-type') ?? '';
    if (!tipo.includes('json')) {
      return {
        resultado: AVISO,
        culpa: SERVIDOR,
        nota: 'sin PHP — la narración usará la voz del navegador',
        remedio: 'El servidor no está ejecutando PHP en este directorio. Actívalo en Plesk si quieres la narración de ElevenLabs.',
      };
    }

    const salud = await res.json();
    if (salud.estado === 'ok') return { resultado: OK, nota: `PHP ${salud.php?.version ?? '?'}` };

    // Se muestran las etiquetas legibles, no las claves internas.
    const problemas = (salud.comprobaciones ?? []).filter((c) => c.resultado !== 'ok');
    const graves = problemas.filter((c) => c.resultado === 'error');
    const lista = problemas.map((c) => c.etiqueta ?? c.clave);

    return {
      resultado: graves.length > 0 ? ERROR : AVISO,
      culpa: SERVIDOR,
      nota: lista.length === 1 ? lista[0] : `${lista.length} puntos por revisar`,
      remedio:
        (lista.length > 1 ? `Pendiente: ${lista.join('; ')}. ` : '') +
        'El detalle completo está en api/health.php',
      extra: salud,
    };
  } catch {
    return {
      resultado: AVISO,
      culpa: SERVIDOR,
      nota: 'no alcanzable — narración con voz del navegador',
      remedio: 'api/health.php no respondió. Comprueba que la carpeta api/ llegó al servidor y que PHP está activo.',
    };
  }
}

/** Contexto seguro: sin él no hay cámara ni micrófono. */
function comprobarContextoSeguro() {
  if (!window.isSecureContext) {
    return {
      resultado: AVISO,
      culpa: SERVIDOR,
      nota: 'sin HTTPS — gestos y voz quedarán desactivados',
      remedio: 'Activa el certificado SSL del dominio: la cámara y el micrófono solo funcionan sobre HTTPS.',
    };
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
 * @returns {Promise<{ok:boolean, resultados:Object, fallos:Array}>}
 */
export async function ejecutarDiagnostico(alProgresar) {
  const lista = $('#arranque-chequeos');
  const resultados = {};
  const fallos = [];

  for (const [indice, chequeo] of CHEQUEOS.entries()) {
    alProgresar(indice / CHEQUEOS.length, `Comprobando ${chequeo.etiqueta.toLowerCase()}…`);

    let salida;
    try {
      salida = await chequeo.fn();
    } catch (err) {
      salida = { resultado: ERROR, nota: err.message, error: err };
    }

    resultados[chequeo.clave] = salida;
    if (chequeo.critico && salida.resultado === ERROR) {
      fallos.push({ ...chequeo, ...salida });
    }

    const fila = crear('li', { class: 'chequeo', dataset: { resultado: salida.resultado } }, [
      crear('span', { class: 'chequeo__marca', 'aria-hidden': 'true', text: MARCAS[salida.resultado] }),
      crear('span', { class: 'chequeo__etiqueta', text: chequeo.etiqueta }),
      crear('span', { class: 'chequeo__nota', text: salida.nota ?? '' }),
    ]);

    // El remedio en línea se reserva para lo que impide arrancar. Un aviso ya
    // se explica con su nota; mostrar instrucciones para todos convertiría un
    // despliegue sano en una pantalla llena de advertencias.
    if (salida.remedio && (salida.resultado === ERROR || depuracion.activo)) {
      fila.append(crear('span', { class: 'chequeo__remedio', text: salida.remedio }));
    }
    lista?.append(fila);

    if (salida.error) console.error(`[ORBIS] ${chequeo.etiqueta}:`, salida.error);
  }

  alProgresar(1, fallos.length ? 'Diagnóstico con errores.' : 'Diagnóstico completado.');
  return { ok: fallos.length === 0, resultados, fallos };
}

/**
 * Redacta el titular del fallo a partir de quién es el responsable.
 * Un archivo que falta en el servidor no es «tu navegador no puede».
 */
export function titularDeFallo(fallos) {
  if (fallos.length === 0) return 'Error de arranque.';

  const delServidor = fallos.filter((f) => f.culpa === SERVIDOR);
  const delNavegador = fallos.filter((f) => f.culpa === NAVEGADOR);

  if (delServidor.length > 0 && delNavegador.length === 0) {
    return fallos.length === 1
      ? `Falta algo en el servidor: no se pudo cargar «${fallos[0].etiqueta}».`
      : 'ORBIS no está bien desplegado: faltan archivos en el servidor.';
  }
  if (delNavegador.length > 0 && delServidor.length === 0) {
    return 'Este navegador no reúne los requisitos para ejecutar ORBIS.';
  }
  return 'ORBIS no puede arrancar: hay problemas en el servidor y en el navegador.';
}
