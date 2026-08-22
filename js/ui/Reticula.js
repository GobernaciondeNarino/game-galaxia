/**
 * Retícula de la VISTA DE CUERPO.
 *
 * Anillos concéntricos y un aro orbital inclinado con marcadores ámbar
 * recorriéndolo, alrededor del cuerpo enfocado. Es DECORATIVO —lenguaje visual
 * de la interfaz de referencia— y se declara como tal; lo único que no lo es
 * son el nombre y el tipo del cuerpo, que se leen del catálogo.
 *
 * Se dibuja en SVG a tamaño de ventana y sigue la posición proyectada del
 * cuerpo, así que no necesita geometría en la escena ni cuesta llamadas de
 * dibujo.
 */

import * as THREE from 'three';
import { svg } from './graficos.js';
import { aPantalla } from '../utils/math.js';

const HZ = 30;

export class Reticula {
  constructor(capa, gestor) {
    this.gestor = gestor;
    this._vector = new THREE.Vector3();
    this._acumulado = 0;
    this._giro = 0;

    this.anillos = [
      svg('circle', { class: 'reticula__anillo', 'data-indice': '0' }),
      svg('circle', { class: 'reticula__anillo', 'data-indice': '1' }),
      svg('ellipse', { class: 'reticula__aro' }),
    ];
    this.marcadores = [0, 1, 2].map(() => svg('circle', { class: 'reticula__marcador', r: 3 }));
    this.grupo = svg('g', { class: 'reticula__grupo' }, [...this.anillos, ...this.marcadores]);

    this.svg = svg('svg', { class: 'reticula', 'aria-hidden': 'true', focusable: 'false' }, [this.grupo]);
    capa.append(this.svg);
    this.visible = false;
  }

  establecerVisible(visible) {
    this.visible = visible;
    this.svg.style.display = visible ? '' : 'none';
  }

  /** @param {import('../system/CelestialBody.js').CelestialBody} cuerpo */
  actualizar(cuerpo, delta) {
    if (!this.visible || !cuerpo) return;

    this._acumulado += delta;
    if (this._acumulado < 1 / HZ) return;
    const paso = this._acumulado;
    this._acumulado = 0;
    this._giro = (this._giro + paso * 0.35) % (Math.PI * 2);

    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    this.svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);

    const camara = this.gestor.camara;
    const centro3D = cuerpo.malla.getWorldPosition(new THREE.Vector3());
    const centro = this._proyectar(centro3D, camara, ancho, alto);

    // Radio aparente: se proyecta un punto del limbo para saber cuántos
    // píxeles ocupa el cuerpo, en lugar de estimarlo por la distancia.
    const arriba = new THREE.Vector3().copy(camara.up).multiplyScalar(cuerpo.radio).add(centro3D);
    const puntoArriba = this._proyectar(arriba, camara, ancho, alto);
    const radio = Math.hypot(puntoArriba.x - centro.x, puntoArriba.y - centro.y);

    if (!Number.isFinite(radio) || radio < 6) {
      this.grupo.style.display = 'none';
      return;
    }
    this.grupo.style.display = '';

    this.anillos[0].setAttribute('cx', centro.x.toFixed(1));
    this.anillos[0].setAttribute('cy', centro.y.toFixed(1));
    this.anillos[0].setAttribute('r', (radio * 1.25).toFixed(1));

    this.anillos[1].setAttribute('cx', centro.x.toFixed(1));
    this.anillos[1].setAttribute('cy', centro.y.toFixed(1));
    this.anillos[1].setAttribute('r', (radio * 1.55).toFixed(1));

    const rx = radio * 1.95;
    const ry = radio * 0.58;
    this.anillos[2].setAttribute('cx', centro.x.toFixed(1));
    this.anillos[2].setAttribute('cy', centro.y.toFixed(1));
    this.anillos[2].setAttribute('rx', rx.toFixed(1));
    this.anillos[2].setAttribute('ry', ry.toFixed(1));
    this.anillos[2].setAttribute('transform', `rotate(-14 ${centro.x.toFixed(1)} ${centro.y.toFixed(1)})`);

    // Marcadores recorriendo el aro, repartidos a 120°.
    const rad = (-14 * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sen = Math.sin(rad);
    this.marcadores.forEach((marcador, i) => {
      const angulo = this._giro + (i * Math.PI * 2) / 3;
      const ex = Math.cos(angulo) * rx;
      const ey = Math.sin(angulo) * ry;
      marcador.setAttribute('cx', (centro.x + ex * cos - ey * sen).toFixed(1));
      marcador.setAttribute('cy', (centro.y + ex * sen + ey * cos).toFixed(1));
    });
  }

  _proyectar(vector, camara, ancho, alto) {
    return aPantalla(vector, camara, ancho, alto, this._vector);
  }

  destruir() {
    this.svg.remove();
  }
}
