/**
 * Gráficos de la HUD, en SVG.
 *
 * SVG y no <canvas> por tres motivos: escala sin pixelarse en cualquier
 * pantalla, hereda las variables de color del CSS, y su contenido es texto real
 * que un lector de pantalla puede anunciar.
 *
 * REGLA DE RIGOR. Cada función distingue dos casos:
 *   · hay datos → se dibujan tal cual, con sus valores visibles;
 *   · no hay datos → se devuelve el cartel SIN DATOS, nunca una línea inventada.
 * Las funciones cuya forma es puramente ornamental llevan «simulacion» en el
 * nombre y la interfaz las etiqueta como tales.
 */

import { crear } from '../utils/dom.js';
import { formatearNumero } from '../utils/math.js';

const SVG = 'http://www.w3.org/2000/svg';

/** Crea un elemento SVG con atributos. */
function svg(etiqueta, atributos = {}, hijos = []) {
  const el = document.createElementNS(SVG, etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'text') el.textContent = valor;
    else el.setAttribute(clave, valor);
  }
  for (const hijo of [hijos].flat()) if (hijo) el.append(hijo);
  return el;
}

/** Cartel que sustituye a cualquier gráfico sin datos. */
export function sinDatos(mensaje = null) {
  return crear('p', { class: 'grafico-vacio' }, [
    crear('span', { class: 'sin-datos' }),
    mensaje ? crear('span', { class: 'grafico-vacio__nota', text: mensaje }) : null,
  ]);
}

/**
 * Gráfico de barras horizontales para la composición atmosférica.
 *
 * Se usa escala logarítmica opcional porque las atmósferas reales son muy
 * desiguales: en la de Marte, el CO₂ al 95,32 % dejaría el CO al 0,08 %
 * literalmente invisible, y ese componente traza es justamente el interesante.
 */
export function barrasComposicion(componentes, { logaritmica = true } = {}) {
  if (!componentes?.length) return sinDatos();

  const conocidos = componentes.filter((c) => typeof c.porcentaje === 'number');
  if (!conocidos.length) {
    return crear('ul', { class: 'barras barras--sin-cifras' },
      componentes.map((c) =>
        crear('li', { class: 'barras__fila' }, [
          crear('span', { class: 'barras__etiqueta', text: c.compuesto }),
          crear('span', { class: 'sin-datos' }),
        ])));
  }

  const maximo = Math.max(...conocidos.map((c) => c.porcentaje));
  const anchoDe = (p) => {
    if (!logaritmica) return (p / maximo) * 100;
    // log(1 + x) mantiene el orden y da amplitud visible a los trazas.
    return (Math.log10(1 + p * 9) / Math.log10(1 + maximo * 9)) * 100;
  };

  return crear('ul', { class: 'barras', role: 'list' },
    componentes.map((c) => {
      const tiene = typeof c.porcentaje === 'number';
      return crear('li', {
        class: 'barras__fila',
        title: tiene ? `${c.compuesto}: ${c.porcentaje} %` : `${c.compuesto}: sin cuantificar`,
      }, [
        crear('span', { class: 'barras__etiqueta', text: c.compuesto }),
        crear('span', { class: 'barras__pista' }, [
          crear('span', {
            class: 'barras__relleno',
            style: `width:${tiene ? anchoDe(c.porcentaje).toFixed(1) : 0}%`,
          }),
        ]),
        tiene
          ? crear('span', { class: 'barras__valor panel__cifra', text: `${formatearNumero(c.porcentaje, c.porcentaje < 1 ? 2 : 1)} %` })
          : crear('span', { class: 'sin-datos' }),
      ]);
    }));
}

/**
 * Traza tipo sismograma.
 *
 * NO representa medidas sísmicas: no existe una serie temporal sismológica
 * publicada para la mayoría de estos cuerpos. La amplitud se deriva del estado
 * geológico real y documentado —activa, residual o inactiva— y la forma es
 * ornamental. Por eso el panel que la usa la etiqueta como SIMULACIÓN.
 *
 * La forma es determinista (semilla fija a partir del identificador): el mismo
 * cuerpo produce siempre el mismo trazo, así que no parpadea ni se reinventa
 * en cada repintado.
 */
export function trazaSismica(id, estado, { ancho = 240, alto = 54, puntos = 120 } = {}) {
  const amplitudes = { activa: 0.9, residual: 0.32, inactiva: 0.1 };
  const amplitud = amplitudes[estado] ?? 0.05;

  let semilla = [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  const aleatorio = () => {
    semilla = (semilla * 1664525 + 1013904223) >>> 0;
    return semilla / 4294967296;
  };

  const medio = alto / 2;
  const trozos = [];
  for (let i = 0; i <= puntos; i++) {
    const x = (i / puntos) * ancho;
    // Ruido de baja frecuencia más picos ocasionales: el aspecto de un
    // sismograma real sin pretender ser uno.
    const base = (aleatorio() - 0.5) * 0.35;
    const pico = aleatorio() > 0.94 ? (aleatorio() - 0.5) * 2 : 0;
    const y = medio - (base + pico) * amplitud * medio * 1.6;
    trozos.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${Math.max(1, Math.min(alto - 1, y)).toFixed(1)}`);
  }

  return svg('svg', {
    class: 'traza', viewBox: `0 0 ${ancho} ${alto}`,
    preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false',
  }, [
    svg('line', { x1: 0, y1: medio, x2: ancho, y2: medio, class: 'traza__eje' }),
    svg('path', { d: trozos.join(' '), class: 'traza__linea' }),
  ]);
}

/**
 * Onda de la densidad magnetosférica.
 *
 * La amplitud SÍ es un dato real: procede del campo magnético en superficie en
 * nanoteslas, en escala logarítmica porque va de 300 nT en Mercurio a 428.000
 * en Júpiter. La ondulación es ornamental y el panel lo declara.
 */
export function ondaMagnetica(campoNt, { ancho = 240, alto = 46 } = {}) {
  const medio = alto / 2;
  // Normaliza entre 100 nT y 500.000 nT en escala logarítmica.
  const normal = campoNt
    ? Math.min(1, Math.max(0.08, Math.log10(campoNt / 100) / Math.log10(5000)))
    : 0;

  const trozos = [];
  for (let i = 0; i <= 160; i++) {
    const t = i / 160;
    const x = t * ancho;
    const envolvente = Math.sin(t * Math.PI) ** 0.6;
    const y = medio - Math.sin(t * Math.PI * 14) * envolvente * normal * (medio - 3);
    trozos.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }

  return svg('svg', {
    class: 'onda', viewBox: `0 0 ${ancho} ${alto}`,
    preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false',
  }, [
    svg('line', { x1: 0, y1: medio, x2: ancho, y2: medio, class: 'onda__eje' }),
    svg('path', { d: trozos.join(' '), class: 'onda__linea' }),
  ]);
}

/**
 * Dial radial. Se usa para el albedo geométrico, que es un dato real publicado
 * por Horizons y comparable entre cuerpos: la fracción de luz que reflejan.
 */
export function dial(valor, { maximo = 1, etiqueta = '', unidad = '', tamano = 92 } = {}) {
  if (valor === null || valor === undefined) return sinDatos(etiqueta);

  const radio = tamano / 2 - 8;
  const centro = tamano / 2;
  const perimetro = 2 * Math.PI * radio;
  const fraccion = Math.min(1, Math.max(0, valor / maximo));
  // Arco de 270°: deja hueco abajo para la cifra, como en la interfaz de referencia.
  const arco = perimetro * 0.75;

  return crear('figure', { class: 'dial' }, [
    svg('svg', { viewBox: `0 0 ${tamano} ${tamano}`, class: 'dial__svg', 'aria-hidden': 'true', focusable: 'false' }, [
      svg('circle', {
        cx: centro, cy: centro, r: radio, class: 'dial__pista',
        'stroke-dasharray': `${arco} ${perimetro}`,
        transform: `rotate(135 ${centro} ${centro})`,
      }),
      svg('circle', {
        cx: centro, cy: centro, r: radio, class: 'dial__valor',
        'stroke-dasharray': `${(arco * fraccion).toFixed(2)} ${perimetro}`,
        transform: `rotate(135 ${centro} ${centro})`,
      }),
    ]),
    crear('figcaption', { class: 'dial__pie' }, [
      crear('span', { class: 'dial__cifra panel__cifra', text: formatearNumero(valor, 2) }),
      unidad ? crear('span', { class: 'dial__unidad', text: unidad }) : null,
      etiqueta ? crear('span', { class: 'dial__etiqueta', text: etiqueta }) : null,
    ]),
  ]);
}

/** Barras verticales de asignación, para comparar magnitudes con su unidad. */
export function barrasAsignacion(filas) {
  const conValor = filas.filter((f) => typeof f.valor === 'number');
  if (!conValor.length) return sinDatos();
  const maximo = Math.max(...conValor.map((f) => f.valor));

  return crear('ul', { class: 'asignacion', role: 'list' },
    filas.map((f) =>
      crear('li', { class: 'asignacion__fila' }, [
        crear('span', { class: 'asignacion__etiqueta', text: f.etiqueta }),
        crear('span', { class: 'asignacion__pista' }, [
          crear('span', {
            class: 'asignacion__relleno',
            style: `width:${typeof f.valor === 'number' ? ((f.valor / maximo) * 100).toFixed(1) : 0}%`,
          }),
        ]),
        typeof f.valor === 'number'
          ? crear('span', { class: 'asignacion__valor panel__cifra', text: `${formatearNumero(f.valor, f.decimales ?? 1)}${f.unidad ? ' ' + f.unidad : ''}` })
          : crear('span', { class: 'sin-datos' }),
      ])));
}

/** Minigráfico de línea a partir de una serie real de pares [x, y]. */
export function minilinea(serie, { ancho = 120, alto = 34 } = {}) {
  if (!serie?.length) return sinDatos();
  const ys = serie.map((p) => p[1]);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const rango = max - min || 1;

  const trozos = serie.map((p, i) => {
    const x = (i / (serie.length - 1)) * ancho;
    const y = alto - ((p[1] - min) / rango) * (alto - 4) - 2;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return svg('svg', {
    class: 'minilinea', viewBox: `0 0 ${ancho} ${alto}`,
    preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false',
  }, [svg('path', { d: trozos.join(' '), class: 'minilinea__linea' })]);
}

export { svg };
