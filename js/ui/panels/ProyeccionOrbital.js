/**
 * Proyección orbital de la esquina inferior izquierda.
 *
 * En la imagen de referencia parece un holograma que se proyecta fuera de la
 * pantalla. Es decorativa en su forma, pero NO en su contenido: los anillos
 * concéntricos son las órbitas reales de los planetas a escala logarítmica, y
 * el marcador señala la posición angular verdadera del cuerpo activo para la
 * fecha simulada. Si el reloj avanza, el marcador recorre la órbita.
 */

import { crear } from '../../utils/dom.js';
import { svg } from '../graficos.js';
import { normalizarAngulo, DOS_PI, GRADOS, resolverKepler } from '../../utils/math.js';
import { EPOCA_J2000 } from '../../system/Orbit.js';

const MS_POR_DIA = 86_400_000;
const T = 180;
const CENTRO = T / 2;

export class ProyeccionOrbital {
  constructor(contenedor, catalogo) {
    // Solo los cuerpos que orbitan el Sol y tienen órbita conocida.
    this.orbitas = catalogo.filter(
      (c) => c.padre === 'sol' && c.orbita?.semiejeMayorUA && c.tipo !== 'cinturon',
    );

    const maximo = Math.max(...this.orbitas.map((c) => c.orbita.semiejeMayorUA));
    this._radioDe = (ua) =>
      10 + (Math.log10(1 + (ua / maximo) * 24) / Math.log10(25)) * (CENTRO - 22);

    this.anillos = svg('g', { class: 'proyeccion__anillos' },
      this.orbitas.map((c) =>
        svg('circle', {
          cx: CENTRO, cy: CENTRO,
          r: this._radioDe(c.orbita.semiejeMayorUA).toFixed(1),
          class: 'proyeccion__anillo',
          'data-id': c.id,
        })));

    this.marcador = svg('circle', { cx: CENTRO, cy: CENTRO, r: 3.6, class: 'proyeccion__marcador' });
    this.destacado = svg('circle', {
      cx: CENTRO, cy: CENTRO, r: 0, class: 'proyeccion__destacado',
    });

    // Retícula giratoria: esto sí es puramente ornamental.
    this.reticula = svg('g', { class: 'proyeccion__reticula', 'aria-hidden': 'true' }, [
      svg('circle', { cx: CENTRO, cy: CENTRO, r: CENTRO - 6, class: 'proyeccion__borde' }),
      svg('path', {
        d: `M ${CENTRO} 6 A ${CENTRO - 6} ${CENTRO - 6} 0 0 1 ${CENTRO + (CENTRO - 6) * 0.87} ${CENTRO + (CENTRO - 6) * 0.5}`,
        class: 'proyeccion__arco',
      }),
    ]);

    this.svg = svg('svg', {
      viewBox: `0 0 ${T} ${T}`, class: 'proyeccion__svg',
      role: 'img', 'aria-label': 'Diagrama orbital del cuerpo activo',
    }, [
      this.reticula,
      this.anillos,
      svg('circle', { cx: CENTRO, cy: CENTRO, r: 4, class: 'proyeccion__sol' }),
      this.destacado,
      this.marcador,
    ]);

    this.pie = crear('p', { class: 'proyeccion__pie' }, [
      crear('span', { class: 'marca-simulacion', text: 'PROYECCIÓN' }),
      crear('span', { class: 'proyeccion__nota', text: 'Escala logarítmica' }),
    ]);

    this.panel = crear('div', { class: 'proyeccion' }, [this.svg, this.pie]);
    contenedor.append(this.panel);

    this.cuerpoActivo = null;
  }

  /** Cambia el cuerpo cuya órbita se resalta. */
  destacar(cuerpo) {
    // Si es un satélite, se resalta la órbita de su planeta: la proyección
    // representa el Sistema Solar, no el sistema local.
    this.cuerpoActivo = cuerpo?.tipo === 'satelite' ? null : cuerpo;
    const id = this.cuerpoActivo?.id;

    for (const anillo of this.anillos.children) {
      anillo.classList.toggle('proyeccion__anillo--activo', anillo.dataset.id === id);
    }

    const ua = this.cuerpoActivo?.orbita?.semiejeMayorUA;
    this.destacado.setAttribute('r', ua ? this._radioDe(ua).toFixed(1) : 0);
    this.marcador.style.display = ua ? '' : 'none';
  }

  /**
   * Sitúa el marcador en la posición angular real del cuerpo para esta fecha.
   * Se resuelve la misma ecuación de Kepler que gobierna la escena 3D, así que
   * el diagrama y la escena nunca se contradicen.
   */
  actualizar(fecha) {
    const orbita = this.cuerpoActivo?.orbita;
    if (!orbita?.periodoOrbitalDias) return;

    const dias = (fecha.getTime() - EPOCA_J2000) / MS_POR_DIA;
    const M = normalizarAngulo(
      (orbita.anomaliaMediaGrados ?? 0) * GRADOS + (DOS_PI * dias) / orbita.periodoOrbitalDias,
    );
    const E = resolverKepler(M, orbita.excentricidad ?? 0);
    // Anomalía verdadera a partir de la excéntrica.
    const e = orbita.excentricidad ?? 0;
    const v = Math.atan2(Math.sqrt(1 - e * e) * Math.sin(E), Math.cos(E) - e);
    const angulo = v + (orbita.argumentoPeriastroGrados ?? 0) * GRADOS;

    const r = this._radioDe(orbita.semiejeMayorUA);
    this.marcador.setAttribute('cx', (CENTRO + Math.cos(angulo) * r).toFixed(1));
    this.marcador.setAttribute('cy', (CENTRO + Math.sin(angulo) * r).toFixed(1));
  }

  destruir() {
    this.panel.remove();
  }
}
