/**
 * Utilidades matemáticas de ORBIS.
 *
 * Aquí vive la mecánica orbital. Todo lo que se calcula parte de los elementos
 * keplerianos que JPL Horizons publica para cada cuerpo: nada de posiciones
 * inventadas ni de órbitas circulares «que ya se parecen bastante».
 */

export const GRADOS = Math.PI / 180;
export const DOS_PI = Math.PI * 2;

/** Restringe un valor a un intervalo. */
export const acotar = (valor, minimo, maximo) => Math.min(maximo, Math.max(minimo, valor));

/** Interpolación lineal. */
export const mezclar = (a, b, t) => a + (b - a) * t;

/**
 * Interpolación exponencial independiente de la tasa de fotogramas.
 *
 * Un `mezclar(actual, objetivo, 0.1)` por fotograma se mueve al doble de
 * velocidad a 120 fps que a 60. Esta versión produce el mismo movimiento
 * en cualquier equipo.
 *
 * @param {number} suavizado fracción de distancia restante tras 1 segundo
 */
export function suavizar(actual, objetivo, suavizado, delta) {
  return mezclar(objetivo, actual, Math.exp(-delta / Math.max(1e-6, suavizado)));
}

/** Normaliza un ángulo en radianes al intervalo [0, 2π). */
export function normalizarAngulo(radianes) {
  const r = radianes % DOS_PI;
  return r < 0 ? r + DOS_PI : r;
}

/**
 * Resuelve la ecuación de Kepler  M = E − e·sen(E)  por Newton-Raphson.
 *
 * No tiene solución cerrada: hay que iterar. Con las excentricidades del
 * Sistema Solar (la mayor es la de Eris, 0,43) converge en tres o cuatro
 * pasos, así que el límite de ocho es holgado.
 *
 * @param {number} anomaliaMedia en radianes
 * @param {number} excentricidad
 * @returns {number} anomalía excéntrica E, en radianes
 */
export function resolverKepler(anomaliaMedia, excentricidad) {
  const M = normalizarAngulo(anomaliaMedia);
  let E = excentricidad < 0.8 ? M : Math.PI;

  for (let i = 0; i < 8; i++) {
    const f = E - excentricidad * Math.sin(E) - M;
    const df = 1 - excentricidad * Math.cos(E);
    const paso = f / df;
    E -= paso;
    if (Math.abs(paso) < 1e-10) break;
  }
  return E;
}

/**
 * Posición en el plano orbital a partir de los elementos keplerianos.
 *
 * Devuelve coordenadas en el propio plano de la órbita (z = 0); la orientación
 * en el espacio la aplica Orbit.js rotando el nodo que las contiene.
 *
 * @param {number} semiejeMayor  en las unidades que se quieran usar
 * @param {number} excentricidad
 * @param {number} anomaliaMedia en radianes
 */
export function posicionOrbital(semiejeMayor, excentricidad, anomaliaMedia) {
  const E = resolverKepler(anomaliaMedia, excentricidad);
  const cosE = Math.cos(E);
  const senE = Math.sin(E);

  return {
    x: semiejeMayor * (cosE - excentricidad),
    y: semiejeMayor * Math.sqrt(1 - excentricidad * excentricidad) * senE,
  };
}

/**
 * Convierte latitud y longitud de la superficie de un cuerpo a coordenadas
 * cartesianas locales. Se usa para anclar las anotaciones de la VISTA DE
 * CUERPO a puntos reales de la superficie.
 *
 * El convenio coincide con el de las texturas equirectangulares que usa
 * Three.js en SphereGeometry: longitud 0 al centro del mapa.
 */
export function latLonAVector(latitudGrados, longitudGrados, radio) {
  const phi = (90 - latitudGrados) * GRADOS;
  const theta = (longitudGrados + 180) * GRADOS;

  return {
    x: -radio * Math.sin(phi) * Math.cos(theta),
    y: radio * Math.cos(phi),
    z: radio * Math.sin(phi) * Math.sin(theta),
  };
}

/** Formatea un número grande con separadores de miles en español. */
export function formatearNumero(valor, decimales = 0) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  return valor.toLocaleString('es-CO', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}

/**
 * Formatea una cifra en notación científica legible: 1,898 × 10²⁷.
 * Se usa para las masas, que de otro modo ocuparían media pantalla.
 */
const SUPERINDICES = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };

export function formatearCientifico(valor, decimales = 3) {
  if (valor === null || valor === undefined || Number.isNaN(valor)) return null;
  if (valor === 0) return '0';

  const exponente = Math.floor(Math.log10(Math.abs(valor)));
  const mantisa = valor / 10 ** exponente;
  const exp = String(exponente)
    .split('')
    .map((c) => SUPERINDICES[c] ?? c)
    .join('');

  return `${mantisa.toFixed(decimales).replace('.', ',')} × 10${exp}`;
}
