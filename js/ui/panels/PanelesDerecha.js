/**
 * Columna derecha: mapa orbital, composición atmosférica, actividad geológica,
 * densidad magnetosférica e indicadores.
 *
 * Los cinco comparten una regla: si el catálogo no trae el dato, el panel se
 * atenúa y muestra SIN DATOS. Si lo que se dibuja es una forma ornamental y no
 * una medida, lleva la marca SIMULACIÓN a la vista, no escondida en un tooltip.
 *
 * Cada panel declara además a qué pestaña de módulo pertenece:
 *
 *   · SENSORES  — lo que se mide del cuerpo: atmósfera, geología, magnetosfera.
 *   · ANALÍTICA — lo que se deduce o se compara: mapa orbital y datos relativos
 *                 a la Tierra.
 *   · SISTEMA   — todos. Es el estado inicial y no esconde nada.
 */

import { crear } from '../../utils/dom.js';
import { formatearNumero } from '../../utils/math.js';
import {
  barrasComposicion, trazaSismica, ondaMagnetica, dial, barrasAsignacion, sinDatos, svg,
} from '../graficos.js';

/**
 * Crea la carcasa común de un panel de la columna.
 *
 * `modulos` declara a qué pestañas de la barra superior pertenece el panel. Es
 * un atributo del DOM y no una clase porque quien filtra es el CSS, a partir de
 * `body[data-modulo]`: cambiar de módulo no toca JavaScript ni reconstruye nada.
 */
function carcasa(titulo, { simulacion = false, cuerpo = [], modulos = [] } = {}) {
  const contenido = crear('div', { class: 'panel__contenido' }, cuerpo);
  const panel = crear('section', {
    class: 'panel panel--derecha',
    dataset: modulos.length ? { modulos: modulos.join(' ') } : {},
  }, [
    crear('header', { class: 'panel__cabecera' }, [
      crear('h2', { class: 'panel__titulo', text: titulo }),
      simulacion ? crear('span', { class: 'marca-simulacion', text: 'SIMULACIÓN' }) : null,
    ]),
    contenido,
  ]);
  return { panel, contenido };
}

/** Vacía un contenedor y le pone contenido nuevo. */
function reemplazar(contenedor, ...nodos) {
  contenedor.replaceChildren(...nodos.filter(Boolean));
}

// ---------------------------------------------------------------------------

/**
 * MAPA ORBITAL Y SISTEMA LUNAR.
 *
 * Diagrama en planta del cuerpo y sus satélites. Los radios de las órbitas
 * respetan el orden y la proporción logarítmica de los semiejes reales; la
 * posición angular de cada luna es la que le corresponde en la fecha simulada.
 */
export class MapaOrbital {
  constructor(contenedor, { alElegirSatelite } = {}) {
    this.alElegirSatelite = alElegirSatelite;
    const { panel, contenido } = carcasa('Mapa orbital y sistema lunar', { modulos: ['analitica'] });
    this.panel = panel;
    this.contenido = contenido;
    contenedor.append(panel);
    this._satelites = [];
  }

  mostrar(cuerpo, catalogo) {
    const lunas = (cuerpo.satelites ?? [])
      .map((id) => catalogo.find((c) => c.id === id))
      .filter(Boolean);

    if (!lunas.length) {
      reemplazar(this.contenido, sinDatos(
        cuerpo.tipo === 'satelite' ? 'Este cuerpo es un satélite' : 'Sin satélites catalogados en ORBIS',
      ));
      this._satelites = [];
      return;
    }

    const T = 150;
    const centro = T / 2;
    const maximo = Math.max(...lunas.map((l) => l.orbita?.semiejeMayorKm ?? 1));
    const radioDe = (km) => 14 + (Math.log10(1 + (km / maximo) * 9) / Math.log10(10)) * (centro - 22);

    const nodos = [];
    this._satelites = [];

    for (const luna of lunas) {
      const r = radioDe(luna.orbita?.semiejeMayorKm ?? maximo);
      nodos.push(svg('circle', { cx: centro, cy: centro, r: r.toFixed(1), class: 'mapa__orbita' }));

      // Ángulo real para la fecha simulada, no un reparto decorativo.
      const angulo = ((luna.orbita?.anomaliaMediaGrados ?? 0) * Math.PI) / 180;
      const x = centro + Math.cos(angulo) * r;
      const y = centro + Math.sin(angulo) * r;

      const punto = svg('circle', {
        cx: x.toFixed(1), cy: y.toFixed(1), r: 3.4,
        class: 'mapa__satelite', tabindex: '0', role: 'button',
        'aria-label': `Ir a ${luna.nombre}`,
        'data-id': luna.id,
      });
      punto.append(svg('title', { text: luna.nombre }));
      nodos.push(punto);
      this._satelites.push(luna.id);
    }

    const diagrama = svg('svg', {
      viewBox: `0 0 ${T} ${T}`, class: 'mapa__svg', role: 'group',
      'aria-label': `Órbitas de los satélites de ${cuerpo.nombre}`,
    }, [
      ...nodos,
      // El centro del diagrama es el propio cuerpo, así que toma su color.
      svg('circle', {
        cx: centro, cy: centro, r: 9, class: 'mapa__central',
        style: `color:${cuerpo.render?.color ?? '#E8A020'}`,
      }),
    ]);

    diagrama.addEventListener('click', (e) => {
      const id = e.target?.dataset?.id;
      if (id) this.alElegirSatelite?.(id);
    });
    diagrama.addEventListener('keydown', (e) => {
      const id = e.target?.dataset?.id;
      if (id && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.alElegirSatelite?.(id);
      }
    });

    reemplazar(this.contenido, diagrama, crear('p', { class: 'panel__pie' }, [
      crear('span', { text: `${lunas.length} de ` }),
      crear('span', {
        class: 'panel__cifra',
        text: cuerpo.satelitesConocidos?.valor != null
          ? `${formatearNumero(cuerpo.satelitesConocidos.valor)} conocidos`
          : '? conocidos',
      }),
      cuerpo.satelitesConocidos?.recuentoA
        ? crear('span', { class: 'panel__nota', text: ` · recuento de ${cuerpo.satelitesConocidos.recuentoA}` })
        : null,
    ]));
  }
}

// ---------------------------------------------------------------------------

/** COMPOSICIÓN ATMOSFÉRICA. Datos reales; escala logarítmica para los trazas. */
export class ComposicionAtmosferica {
  constructor(contenedor) {
    const { panel, contenido } = carcasa('Composición atmosférica', { modulos: ['sensores'] });
    this.panel = panel;
    this.contenido = contenido;
    contenedor.append(panel);
  }

  mostrar(cuerpo) {
    const atmosfera = cuerpo.atmosfera;
    if (!atmosfera?.componentes?.length) {
      this.panel.dataset.estado = 'sin-datos';
      reemplazar(this.contenido, sinDatos(
        cuerpo.tipo === 'satelite' || cuerpo.tipo === 'planeta-enano'
          ? 'Sin atmósfera apreciable o sin medir'
          : null,
      ));
      return;
    }

    this.panel.dataset.estado = 'ok';
    reemplazar(
      this.contenido,
      barrasComposicion(atmosfera.componentes),
      atmosfera.nota ? crear('p', { class: 'panel__nota', text: atmosfera.nota, title: atmosfera.nota }) : null,
      crear('p', { class: 'panel__fuente', text: atmosfera.fuente ?? '' }),
    );
  }
}

// ---------------------------------------------------------------------------

/**
 * ACTIVIDAD GEOLÓGICA.
 *
 * El estado —activa, residual o inactiva— es un dato real y citado. El trazo
 * es ornamental: no existe una serie sismológica publicada para casi ninguno
 * de estos cuerpos. Por eso el panel lleva la marca SIMULACIÓN sobre el
 * gráfico y el dato verdadero, en texto, debajo.
 */
export class ActividadGeologica {
  constructor(contenedor) {
    const { panel, contenido } = carcasa('Actividad geológica', { simulacion: true, modulos: ['sensores'] });
    this.panel = panel;
    this.contenido = contenido;
    contenedor.append(panel);
  }

  mostrar(cuerpo) {
    const geologia = cuerpo.geologia;
    if (!geologia) {
      this.panel.dataset.estado = 'sin-datos';
      reemplazar(this.contenido, sinDatos());
      return;
    }

    this.panel.dataset.estado = 'ok';
    const etiquetas = {
      activa: 'Activa', residual: 'Residual', inactiva: 'Inactiva',
    };

    reemplazar(
      this.contenido,
      trazaSismica(cuerpo.id, geologia.estado),
      crear('p', { class: 'estado-linea' }, [
        crear('span', {
          class: 'estado-pastilla',
          dataset: { estado: geologia.estado ?? 'sin-superficie' },
          text: etiquetas[geologia.estado] ?? 'Sin superficie sólida',
        }),
      ]),
      crear('p', { class: 'panel__nota', text: geologia.nota }),
      crear('p', { class: 'panel__fuente', text: geologia.fuente ?? '' }),
    );
  }
}

// ---------------------------------------------------------------------------

/**
 * DENSIDAD MAGNETOSFÉRICA.
 *
 * La amplitud de la onda procede del campo magnético en superficie, en
 * nanoteslas: es un dato real. La ondulación en sí es ornamental, y el
 * rótulo «escaneo en vivo» de la interfaz de referencia se sustituye por
 * SIMULACIÓN, que es lo que de verdad es.
 */
export class DensidadMagnetosferica {
  constructor(contenedor) {
    const { panel, contenido } = carcasa('Densidad magnetosférica', { simulacion: true, modulos: ['sensores'] });
    this.panel = panel;
    this.contenido = contenido;
    contenedor.append(panel);
  }

  mostrar(cuerpo) {
    const magneto = cuerpo.magnetosfera;
    if (!magneto) {
      this.panel.dataset.estado = 'sin-datos';
      reemplazar(this.contenido, sinDatos());
      return;
    }

    this.panel.dataset.estado = 'ok';
    reemplazar(
      this.contenido,
      ondaMagnetica(magneto.campoSuperficieNt),
      crear('p', { class: 'estado-linea' }, [
        crear('span', {
          class: 'estado-pastilla',
          dataset: { estado: magneto.tieneCampoGlobal ? 'activa' : 'inactiva' },
          text: magneto.tieneCampoGlobal ? 'Campo global' : 'Sin campo global',
        }),
        magneto.campoSuperficieNt
          ? crear('span', { class: 'panel__cifra', text: `${formatearNumero(magneto.campoSuperficieNt)} nT` })
          : crear('span', { class: 'sin-datos' }),
      ]),
      crear('p', { class: 'panel__nota', text: magneto.nota, title: magneto.nota }),
      crear('p', { class: 'panel__fuente', text: magneto.fuente ?? '' }),
    );
  }
}

// ---------------------------------------------------------------------------

/**
 * DATOS ADICIONALES.
 *
 * El dial muestra el albedo geométrico —la fracción de luz que el cuerpo
 * refleja—, que Horizons publica y es comparable entre cuerpos. Las barras
 * comparan magnitudes reales con el valor terrestre.
 */
export class DatosAdicionales {
  constructor(contenedor) {
    const { panel, contenido } = carcasa('Datos adicionales', { modulos: ['analitica'] });
    this.panel = panel;
    this.contenido = contenido;
    contenedor.append(panel);
  }

  mostrar(cuerpo, tierra) {
    const albedo = cuerpo.fisica?.albedoGeometrico ?? null;

    const comparar = (valor, referencia) =>
      valor && referencia ? valor / referencia : null;

    reemplazar(
      this.contenido,
      dial(albedo, { maximo: 1.1, etiqueta: 'Albedo geométrico' }),
      barrasAsignacion([
        {
          etiqueta: 'Gravedad',
          valor: comparar(cuerpo.fisica?.gravedadMs2, tierra?.fisica?.gravedadMs2),
          unidad: '× Tierra', decimales: 2,
        },
        {
          etiqueta: 'Densidad',
          valor: comparar(cuerpo.fisica?.densidadGcm3, tierra?.fisica?.densidadGcm3),
          unidad: '× Tierra', decimales: 2,
        },
        {
          etiqueta: 'Diámetro',
          valor: comparar(cuerpo.fisica?.diametroKm, tierra?.fisica?.diametroKm),
          unidad: '× Tierra', decimales: 2,
        },
      ]),
      crear('p', { class: 'panel__fuente', text: 'Comparaciones calculadas sobre los valores de JPL Horizons' }),
    );
  }
}
