/**
 * INTERFAZ GALÁCTICA — el panel ancho del centro en la VISTA DE SISTEMA.
 *
 * Representa la Vía Láctea vista desde fuera, con la posición del Sistema Solar
 * señalada. La espiral es una construcción geométrica (una espiral logarítmica
 * de cuatro brazos), no una fotografía: nadie ha visto nunca la Vía Láctea
 * desde fuera. Por eso lleva la marca SIMULACIÓN.
 *
 * Lo que SÍ es un dato real y citado son las dos cifras que la acompañan: la
 * distancia del Sol al centro galáctico y el periodo de su órbita alrededor de
 * él. Están en `DATOS_GALACTICOS`, con su fuente.
 */

import { crear } from '../../utils/dom.js';
import { svg } from '../graficos.js';
import { formatearNumero } from '../../utils/math.js';

const T = 420;
const CENTRO = T / 2;

/** Datos reales de la posición del Sistema Solar en la Galaxia. */
export const DATOS_GALACTICOS = {
  distanciaAlCentroKpc: {
    valor: 8.178,
    unidad: 'kpc',
    nota: '≈ 26.700 años luz',
    fuente: 'GRAVITY Collaboration (2019), Astronomy & Astrophysics 625, L10 — órbita de la estrella S2 alrededor de Sgr A*',
  },
  periodoOrbitalGalacticoMa: {
    valor: 230,
    unidad: 'millones de años',
    nota: 'un «año galáctico»',
    fuente: 'NASA — Astrophysics Science Division',
  },
  brazo: {
    valor: 'Brazo de Orión',
    nota: 'un brazo menor entre los de Sagitario y Perseo',
    fuente: 'NASA/JPL — Milky Way structure',
  },
};

/** Construye una espiral logarítmica como cadena de puntos SVG. */
function brazoEspiral(indiceBrazo, totalBrazos, { vueltas = 1.55, puntos = 90, radioMaximo = CENTRO - 26 } = {}) {
  const partes = [];
  const desfase = (indiceBrazo / totalBrazos) * Math.PI * 2;

  for (let i = 0; i <= puntos; i++) {
    const t = i / puntos;
    const angulo = desfase + t * Math.PI * 2 * vueltas;
    // r = a·e^(bθ) achatada para que el bulbo no quede desproporcionado.
    const radio = 22 + (radioMaximo - 22) * t ** 0.82;
    const x = CENTRO + Math.cos(angulo) * radio;
    const y = CENTRO + Math.sin(angulo) * radio * 0.42;   // Perspectiva del disco.
    partes.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return partes.join(' ');
}

export class PanelGalactico {
  constructor(contenedor) {
    const brazos = [0, 1, 2, 3].map((i) =>
      svg('path', { d: brazoEspiral(i, 4), class: 'galaxia__brazo' }));

    // Halo de puntos: densidad decreciente hacia fuera, determinista.
    let semilla = 987654321;
    const aleatorio = () => ((semilla = (semilla * 1664525 + 1013904223) >>> 0) / 4294967296);
    const polvo = [];
    for (let i = 0; i < 320; i++) {
      const t = Math.sqrt(aleatorio());
      const angulo = aleatorio() * Math.PI * 2;
      const radio = 14 + t * (CENTRO - 30);
      polvo.push(svg('circle', {
        cx: (CENTRO + Math.cos(angulo) * radio).toFixed(1),
        cy: (CENTRO + Math.sin(angulo) * radio * 0.42).toFixed(1),
        r: (0.4 + aleatorio() * 1.1).toFixed(2),
        class: 'galaxia__polvo',
        opacity: (0.15 + aleatorio() * 0.5).toFixed(2),
      }));
    }

    // Posición del Sistema Solar: a unos 8,2 kpc de un disco de ~15 kpc de radio.
    const fraccionSol = DATOS_GALACTICOS.distanciaAlCentroKpc.valor / 15;
    const radioSol = 22 + (CENTRO - 26 - 22) * fraccionSol ** 0.82;
    const anguloSol = Math.PI * 0.42;
    const xSol = CENTRO + Math.cos(anguloSol) * radioSol;
    const ySol = CENTRO + Math.sin(anguloSol) * radioSol * 0.42;

    this.svg = svg('svg', {
      viewBox: `0 0 ${T} ${T}`, class: 'galaxia__svg',
      role: 'img',
      'aria-label':
        'Representación esquemática de la Vía Láctea con la posición del Sistema Solar ' +
        'a 8,2 kilopársecs del centro galáctico, en el brazo de Orión.',
    }, [
      svg('ellipse', { cx: CENTRO, cy: CENTRO, rx: CENTRO - 20, ry: (CENTRO - 20) * 0.45, class: 'galaxia__disco' }),
      svg('g', {}, polvo),
      svg('g', {}, brazos),
      svg('ellipse', { cx: CENTRO, cy: CENTRO, rx: 30, ry: 15, class: 'galaxia__bulbo' }),
      svg('circle', { cx: xSol.toFixed(1), cy: ySol.toFixed(1), r: 16, class: 'galaxia__halo-sol' }),
      svg('circle', { cx: xSol.toFixed(1), cy: ySol.toFixed(1), r: 3.2, class: 'galaxia__sol' }),
      svg('line', {
        x1: xSol.toFixed(1), y1: ySol.toFixed(1),
        x2: (xSol + 62).toFixed(1), y2: (ySol - 38).toFixed(1),
        class: 'galaxia__guia',
      }),
      svg('text', {
        x: (xSol + 66).toFixed(1), y: (ySol - 42).toFixed(1),
        class: 'galaxia__etiqueta', text: 'SISTEMA SOLAR',
      }),
    ]);

    const cifra = (dato) =>
      crear('li', { class: 'galaxia__dato', title: dato.fuente }, [
        crear('span', {
          class: 'galaxia__valor panel__cifra',
          text: typeof dato.valor === 'number'
            ? `${formatearNumero(dato.valor, dato.valor < 100 ? 3 : 0)} ${dato.unidad}`
            : dato.valor,
        }),
        crear('span', { class: 'galaxia__nota', text: dato.nota }),
      ]);

    this.panel = crear('section', { class: 'panel galaxia' }, [
      crear('header', { class: 'panel__cabecera' }, [
        crear('h2', { class: 'panel__titulo', text: 'Interfaz galáctica — estado del sistema: activo' }),
        crear('span', { class: 'marca-simulacion', text: 'SIMULACIÓN' }),
      ]),
      this.svg,
      crear('ul', { class: 'galaxia__datos' }, [
        cifra(DATOS_GALACTICOS.distanciaAlCentroKpc),
        cifra(DATOS_GALACTICOS.periodoOrbitalGalacticoMa),
        cifra(DATOS_GALACTICOS.brazo),
      ]),
      crear('p', { class: 'panel__fuente', text: 'La forma de la Galaxia es una representación esquemática; las cifras son medidas publicadas.' }),
    ]);

    contenedor.append(this.panel);
  }

  destruir() {
    this.panel.remove();
  }
}
