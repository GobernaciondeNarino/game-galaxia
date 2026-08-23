/**
 * Panel de depuración. Solo se carga con ?debug=1, así que su código nunca
 * llega al navegador de un visitante normal (import dinámico).
 *
 * Expone en caliente los tres parámetros del bloom, la velocidad del reloj y
 * las estadísticas de render, que es justo lo que hace falta para ajustar el
 * aspecto de la escena sin recargar.
 */

import Stats from 'three/addons/libs/stats.module.js';
import { crear } from './dom.js';
import { VELOCIDADES } from '../core/Loop.js';

export function montarPanelDepuracion({ App, gestor, efectos, bucle, sistema }) {
  const stats = new Stats();
  stats.dom.style.cssText = 'position:fixed;top:8px;left:8px;z-index:200;opacity:.9';
  document.body.append(stats.dom);

  const lineaEstado = crear('pre', { class: 'depuracion__estado' });

  const deslizador = (etiqueta, min, max, paso, valor, alCambiar) => {
    const salida = crear('output', { text: valor.toFixed(2) });
    const entrada = crear('input', {
      type: 'range',
      min, max, step: paso, value: valor,
      oninput: (e) => {
        const v = Number(e.target.value);
        salida.textContent = v.toFixed(2);
        alCambiar(v);
      },
    });
    return crear('label', { class: 'depuracion__campo' }, [
      crear('span', { text: etiqueta }), entrada, salida,
    ]);
  };

  const panel = crear('div', { class: 'depuracion', role: 'region', 'aria-label': 'Panel de depuración' }, [
    crear('p', { class: 'depuracion__titulo', text: 'DEPURACIÓN · ?debug=1' }),
    deslizador('bloom intensidad', 0, 3, 0.05, efectos.bloom.intensidad, (v) => efectos.configurarBloom({ intensidad: v })),
    deslizador('bloom radio', 0, 1.5, 0.01, efectos.bloom.radio, (v) => efectos.configurarBloom({ radio: v })),
    deslizador('bloom umbral', 0, 1.5, 0.01, efectos.bloom.umbral, (v) => efectos.configurarBloom({ umbral: v })),
    crear('label', { class: 'depuracion__campo' }, [
      crear('span', { text: 'tiempo' }),
      crear('select', {
        onchange: (e) => bucle.establecerVelocidad(Number(e.target.value)),
      }, VELOCIDADES.map((v, i) =>
        crear('option', { value: i, text: v.etiqueta, selected: i === bucle.indiceVelocidad }))),
    ]),
    crear('label', { class: 'depuracion__campo' }, [
      crear('span', { text: 'órbitas' }),
      crear('input', {
        type: 'checkbox',
        checked: App.preferencias.get('mostrarOrbitas'),
        onchange: (e) => sistema.establecerVisibilidadOrbitas(e.target.checked),
      }),
    ]),
    crear('label', { class: 'depuracion__campo' }, [
      crear('span', { text: 'cinturones' }),
      crear('input', {
        type: 'checkbox',
        checked: true,
        onchange: (e) => sistema.establecerVisibilidadCinturones(e.target.checked),
      }),
    ]),
    lineaEstado,
  ]);

  document.body.append(panel);

  const refrescar = () => {
    stats.update();
    const e = gestor.estadisticas;
    lineaEstado.textContent =
      `fps ${App.estado.fps}\n` +
      `llamadas ${e.llamadas}  triángulos ${e.triangulos.toLocaleString('es-CO')}\n` +
      `geometrías ${e.geometrias}  texturas ${e.texturas}  programas ${e.programas}\n` +
      `fecha simulada ${App.estado.tiempoSimulado?.toISOString().slice(0, 10) ?? '—'}\n` +
      `cuerpo activo ${App.estado.cuerpoActivo ?? '—'}`;
  };

  setInterval(refrescar, 250);
  refrescar();
  return panel;
}
