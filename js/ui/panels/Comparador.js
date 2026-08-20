/**
 * Comparador de dos cuerpos.
 *
 * Se abre con el comando de voz «comparar Marte con Venus» o desde la ayuda.
 * Enfrenta las cifras reales de ambos y calcula las razones entre ellas; no
 * inventa ninguna magnitud nueva. Donde uno de los dos no tiene el dato, la
 * comparación se declara imposible en lugar de rellenarse con un cero.
 *
 * La barra de tamaño relativo usa el diámetro real: es la comparación que la
 * gente espera ver y la que las ilustraciones suelen falsear.
 */

import { crear } from '../../utils/dom.js';
import { formatearNumero, formatearCientifico } from '../../utils/math.js';

const CAMPOS = [
  { etiqueta: 'Diámetro', unidad: 'km', valor: (c) => c.fisica?.diametroKm, formato: (v) => formatearNumero(v) },
  { etiqueta: 'Masa', unidad: 'kg', valor: (c) => c.fisica?.masaKg, formato: (v) => formatearCientifico(v, 3) },
  { etiqueta: 'Gravedad', unidad: 'm/s²', valor: (c) => c.fisica?.gravedadMs2, formato: (v) => formatearNumero(v, 2) },
  { etiqueta: 'Densidad', unidad: 'g/cm³', valor: (c) => c.fisica?.densidadGcm3, formato: (v) => formatearNumero(v, 3) },
  { etiqueta: 'Rotación', unidad: 'h', valor: (c) => c.fisica?.periodoRotacionHoras, formato: (v) => formatearNumero(v, 2) },
  { etiqueta: 'Periodo orbital', unidad: 'días', valor: (c) => c.orbita?.periodoOrbitalDias, formato: (v) => formatearNumero(v, 2) },
  { etiqueta: 'Vel. de escape', unidad: 'km/s', valor: (c) => c.fisica?.velocidadEscapeKms, formato: (v) => formatearNumero(v, 3) },
  { etiqueta: 'Albedo', unidad: '', valor: (c) => c.fisica?.albedoGeometrico, formato: (v) => formatearNumero(v, 3) },
];

export class Comparador {
  constructor(contenedor) {
    this.cuerpo = crear('div', { class: 'comparador__cuerpo' });

    this.cerrar = crear('button', {
      class: 'controles__boton', type: 'button', text: 'Cerrar',
      onclick: () => this.ocultar(),
    });

    this.panel = crear('div', {
      class: 'panel comparador', hidden: true,
      role: 'dialog', 'aria-label': 'Comparación entre dos cuerpos',
      onkeydown: (e) => { if (e.key === 'Escape') this.ocultar(); },
    }, [
      crear('header', { class: 'panel__cabecera' }, [
        crear('h2', { class: 'panel__titulo', id: 'titulo-comparador', text: 'Comparación' }),
        this.cerrar,
      ]),
      this.cuerpo,
    ]);

    contenedor.append(this.panel);
  }

  /** @param {object} a @param {object} b entradas del catálogo */
  mostrar(a, b) {
    if (!a || !b) return;

    const mayor = Math.max(a.fisica?.diametroKm ?? 1, b.fisica?.diametroKm ?? 1);
    const barra = (cuerpo) => {
      const d = cuerpo.fisica?.diametroKm;
      return crear('div', { class: 'comparador__silueta' }, [
        crear('span', {
          class: 'comparador__disco',
          style: `width:${d ? Math.max(6, (d / mayor) * 100) : 6}%;` +
                 `background:${cuerpo.render?.color ?? '#8a9098'};`,
          'aria-hidden': 'true',
        }),
      ]);
    };

    const filas = CAMPOS.map((campo) => {
      const va = campo.valor(a);
      const vb = campo.valor(b);
      const hayRazon = typeof va === 'number' && typeof vb === 'number' && vb !== 0;
      const razon = hayRazon ? va / vb : null;

      const celda = (v) => (typeof v === 'number'
        ? crear('span', { class: 'panel__cifra', text: `${campo.formato(v)}${campo.unidad ? ' ' + campo.unidad : ''}` })
        : crear('span', { class: 'sin-datos' }));

      return crear('li', { class: 'comparador__fila' }, [
        celda(va),
        crear('span', { class: 'comparador__etiqueta', text: campo.etiqueta }),
        celda(vb),
        hayRazon
          ? crear('span', {
              class: 'comparador__razon',
              // La razón se lee siempre «A es N veces B», nunca al revés: leerla
              // en un sentido u otro según cuál sea mayor confunde más que ayuda.
              text: razon >= 1
                ? `×${formatearNumero(razon, razon < 10 ? 2 : 0)}`
                : `÷${formatearNumero(1 / razon, 1 / razon < 10 ? 2 : 0)}`,
              title: `${a.nombre} respecto a ${b.nombre}`,
            })
          : crear('span', { class: 'comparador__razon comparador__razon--vacia', text: '—', title: 'Falta el dato en uno de los dos' }),
      ]);
    });

    this.cuerpo.replaceChildren(
      crear('div', { class: 'comparador__cabeceras' }, [
        crear('p', { class: 'comparador__nombre', text: a.nombre }),
        crear('p', { class: 'comparador__vs', text: 'frente a' }),
        crear('p', { class: 'comparador__nombre', text: b.nombre }),
      ]),
      crear('div', { class: 'comparador__siluetas' }, [barra(a), crear('span'), barra(b)]),
      crear('ul', { class: 'comparador__lista' }, filas),
      crear('p', { class: 'panel__fuente', text: 'Cifras de JPL Horizons. Las razones se calculan sobre ellas; donde falta un dato, la comparación se declara imposible.' }),
    );

    this.panel.hidden = false;
    this.cerrar.focus();
  }

  ocultar() {
    this.panel.hidden = true;
  }

  destruir() {
    this.panel.remove();
  }
}
