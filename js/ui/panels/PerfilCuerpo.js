/**
 * Panel PERFIL DEL CUERPO — el panel izquierdo persistente.
 *
 * Muestra las cifras físicas y orbitales del cuerpo activo. Cada fila conoce su
 * procedencia: al pasar el ratón (o al enfocarla con el teclado) se lee de
 * dónde salió el dato. Es lo que convierte «139.820 km» en un dato verificable
 * en lugar de un número en pantalla.
 *
 * Los valores se animan con un contador al cambiar de cuerpo, salvo que el
 * sistema pida menos movimiento.
 */

import { crear } from '../../utils/dom.js';
import { formatearNumero, formatearCientifico } from '../../utils/math.js';

const REDUCIR = window.matchMedia?.('(prefers-reduced-motion: reduce)');

/**
 * Definición de las filas. `valor` extrae la cifra; `formato` la convierte en
 * texto. Separarlos permite animar el número sin volver a formatearlo mal.
 */
const FILAS = [
  {
    clave: 'diametroKm', etiqueta: 'Diámetro', unidad: 'km',
    valor: (c) => c.fisica?.diametroKm,
    formato: (v) => formatearNumero(v, 0),
  },
  {
    clave: 'masaKg', etiqueta: 'Masa', unidad: 'kg',
    valor: (c) => c.fisica?.masaKg,
    formato: (v) => formatearCientifico(v, 3),
    animable: false,       // Notación científica: animarla no aporta nada.
  },
  {
    clave: 'periodoRotacionHoras', etiqueta: 'Rotación', unidad: 'h',
    valor: (c) => c.fisica?.periodoRotacionHoras,
    formato: (v) => formatearNumero(v, v < 100 ? 2 : 0),
  },
  {
    clave: 'periodoOrbitalDias', etiqueta: 'Órbita', unidad: 'días',
    valor: (c) => c.orbita?.periodoOrbitalDias,
    formato: (v) => formatearNumero(v, v < 100 ? 3 : 0),
  },
  {
    clave: 'gravedadMs2', etiqueta: 'Gravedad', unidad: 'm/s²',
    valor: (c) => c.fisica?.gravedadMs2,
    formato: (v) => formatearNumero(v, v < 10 ? 3 : 2),
  },
  {
    clave: 'densidadGcm3', etiqueta: 'Densidad', unidad: 'g/cm³',
    valor: (c) => c.fisica?.densidadGcm3,
    formato: (v) => formatearNumero(v, 3),
  },
  {
    clave: 'velocidadEscapeKms', etiqueta: 'Vel. de escape', unidad: 'km/s',
    valor: (c) => c.fisica?.velocidadEscapeKms,
    formato: (v) => formatearNumero(v, v < 10 ? 3 : 2),
  },
  {
    clave: 'inclinacionAxialGrados', etiqueta: 'Inclinación axial', unidad: '°',
    valor: (c) => c.fisica?.inclinacionAxialGrados,
    formato: (v) => formatearNumero(v, 2),
  },
  {
    clave: 'semiejeMayorUA', etiqueta: 'Distancia al Sol', unidad: 'UA',
    valor: (c) => c.orbita?.semiejeMayorUA,
    formato: (v) => formatearNumero(v, 3),
  },
  {
    clave: 'semiejeMayorKm', etiqueta: 'Distancia al planeta', unidad: 'km',
    valor: (c) => c.orbita?.semiejeMayorKm,
    formato: (v) => formatearNumero(v, 0),
  },
  {
    clave: 'excentricidad', etiqueta: 'Excentricidad', unidad: '',
    valor: (c) => c.orbita?.excentricidad,
    formato: (v) => formatearNumero(v, 4),
  },
  {
    clave: 'albedoGeometrico', etiqueta: 'Albedo', unidad: '',
    valor: (c) => c.fisica?.albedoGeometrico,
    formato: (v) => formatearNumero(v, 3),
  },
];

export class PerfilCuerpo {
  constructor(contenedor) {
    this.contenedor = contenedor;
    this.filas = new Map();
    this._animaciones = new Map();

    this.titulo = crear('h2', { class: 'panel__titulo', text: 'Perfil del cuerpo' });
    this.nombre = crear('p', { class: 'perfil__nombre', text: '—' });
    this.tipo = crear('p', { class: 'perfil__tipo', text: '' });

    this.lista = crear('dl', { class: 'perfil__lista' });
    for (const definicion of FILAS) {
      const valor = crear('dd', { class: 'perfil__valor panel__cifra' });
      const unidad = crear('span', { class: 'perfil__unidad', text: definicion.unidad });
      const fila = crear('div', {
        class: 'perfil__fila',
        dataset: { clave: definicion.clave },
        tabindex: '0',
      }, [
        crear('dt', { class: 'perfil__etiqueta', text: definicion.etiqueta }),
        valor,
      ]);
      valor.append(unidad);
      this.lista.append(fila);
      this.filas.set(definicion.clave, { definicion, fila, valor, unidad });
    }

    this.fuente = crear('p', { class: 'perfil__fuente' });

    this.panel = crear('section', { class: 'panel panel--perfil', 'aria-labelledby': 'titulo-perfil' }, [
      this.titulo, this.nombre, this.tipo, this.lista, this.fuente,
    ]);
    this.titulo.id = 'titulo-perfil';
    contenedor.append(this.panel);
  }

  /** @param {object} cuerpo entrada del catálogo */
  mostrar(cuerpo) {
    if (!cuerpo) return;

    this.nombre.textContent = cuerpo.nombre;
    this.tipo.textContent = ETIQUETAS_TIPO[cuerpo.tipo] ?? cuerpo.tipo;

    for (const [clave, { definicion, fila, valor, unidad }] of this.filas) {
      const bruto = definicion.valor(cuerpo);
      const procedencia = cuerpo.procedencia?.[clave];

      // Una fila que no aplica a este cuerpo (la distancia al planeta en un
      // planeta) se oculta; una que aplica pero no se conoce se muestra como
      // SIN DATOS. La diferencia importa: lo segundo es una laguna declarada.
      const aplica = !NO_APLICA[clave] || NO_APLICA[clave](cuerpo);
      fila.hidden = !aplica;
      if (!aplica) continue;

      if (bruto === null || bruto === undefined) {
        this._detener(clave);
        valor.textContent = '';
        valor.append(crear('span', { class: 'sin-datos' }));
        fila.dataset.estado = 'sin-datos';
        fila.removeAttribute('title');
        continue;
      }

      fila.dataset.estado = 'ok';
      fila.title = procedencia?.detalle
        ? `${procedencia.fuente} — ${procedencia.detalle}`
        : (procedencia?.fuente ?? 'Fuente no declarada');

      this._escribir(clave, bruto, definicion, valor, unidad);
    }

    this.fuente.textContent = cuerpo.fuente ? `Fuente: ${cuerpo.fuente}` : '';
    this.fuente.title = cuerpo.revisadoPorJpl ? `Revisión de JPL: ${cuerpo.revisadoPorJpl}` : '';
  }

  /** Anima el contador desde el valor anterior hasta el nuevo. */
  _escribir(clave, destino, definicion, nodoValor, nodoUnidad) {
    this._detener(clave);

    const pintar = (v) => {
      nodoValor.textContent = definicion.formato(v);
      nodoValor.append(nodoUnidad);
    };

    if (definicion.animable === false || REDUCIR?.matches) {
      pintar(destino);
      return;
    }

    const desde = Number(this._ultimos?.[clave] ?? 0);
    const inicio = performance.now();
    const duracion = 620;

    const paso = (ahora) => {
      const t = Math.min(1, (ahora - inicio) / duracion);
      // Desaceleración cúbica: rápido al principio, se posa al final.
      const suavizado = 1 - (1 - t) ** 3;
      pintar(desde + (destino - desde) * suavizado);
      if (t < 1) this._animaciones.set(clave, requestAnimationFrame(paso));
      else this._animaciones.delete(clave);
    };

    this._animaciones.set(clave, requestAnimationFrame(paso));
    this._ultimos = { ...(this._ultimos ?? {}), [clave]: destino };
  }

  _detener(clave) {
    const id = this._animaciones.get(clave);
    if (id) cancelAnimationFrame(id);
    this._animaciones.delete(clave);
  }

  destruir() {
    for (const clave of this._animaciones.keys()) this._detener(clave);
    this.panel.remove();
  }
}

const ETIQUETAS_TIPO = {
  estrella: 'Estrella · tipo G2 V',
  planeta: 'Planeta',
  'planeta-enano': 'Planeta enano',
  satelite: 'Satélite natural',
  cinturon: 'Región',
};

/** Filas que solo tienen sentido para ciertos tipos de cuerpo. */
const NO_APLICA = {
  semiejeMayorUA: (c) => c.tipo !== 'satelite' && c.tipo !== 'estrella',
  semiejeMayorKm: (c) => c.tipo === 'satelite',
  periodoOrbitalDias: (c) => c.tipo !== 'estrella',
  excentricidad: (c) => c.tipo !== 'estrella',
};
