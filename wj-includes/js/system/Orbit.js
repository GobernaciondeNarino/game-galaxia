/**
 * Orbit — órbita kepleriana real.
 *
 * Toma los seis elementos orbitales que publica JPL Horizons (semieje mayor,
 * excentricidad, inclinación, nodo ascendente, argumento del periastro y
 * anomalía media en la época) y con ellos hace dos cosas:
 *
 *   1. dibuja la elipse verdadera, con su excentricidad y su inclinación;
 *   2. sitúa al cuerpo en el punto que le corresponde para una fecha dada.
 *
 * Nada de círculos ni de fases arbitrarias: si la escena marca el 20 de agosto
 * de 2026, los planetas están donde estaban ese día.
 *
 * ORIENTACIÓN. Los elementos vienen referidos a la eclíptica J2000, con Z hacia
 * el norte. Three.js trabaja con Y hacia arriba, así que la conversión es
 * (X, Y, Z) → (X, Z, −Y). Con ese cambio, girar Ω sobre el eje Z de la
 * eclíptica equivale a girar Ω sobre el eje Y de Three, y girar la inclinación
 * sobre el eje X coincide en ambos. Por eso basta con tres nodos anidados en
 * lugar de una matriz montada a mano.
 */

import * as THREE from 'three';
import { GRADOS, DOS_PI, posicionOrbital, normalizarAngulo } from '../utils/math.js';

/** J2000.0 — la época a la que están referidos todos los elementos. */
export const EPOCA_J2000 = Date.UTC(2000, 0, 1, 0, 0, 0);
const MS_POR_DIA = 86_400_000;

export class Orbit {
  /**
   * @param {object} elementos elementos orbitales tal cual salen del catálogo
   * @param {number} semiejeEscena semieje mayor ya convertido a unidades de escena
   */
  constructor(elementos, semiejeEscena) {
    this.excentricidad = elementos.excentricidad ?? 0;
    this.periodoDias = elementos.periodoOrbitalDias ?? null;
    this.semieje = semiejeEscena;

    this.inclinacion = (elementos.inclinacionGrados ?? 0) * GRADOS;
    this.nodoAscendente = (elementos.nodoAscendenteGrados ?? 0) * GRADOS;
    this.argumentoPeriastro = (elementos.argumentoPeriastroGrados ?? 0) * GRADOS;
    this.anomaliaMediaEpoca = (elementos.anomaliaMediaGrados ?? 0) * GRADOS;

    // Tres nodos anidados en lugar de una matriz: se leen mejor y permiten
    // colgar la línea de la órbita del mismo sistema que el cuerpo.
    this.nodoOmega = new THREE.Object3D();
    this.nodoInclinacion = new THREE.Object3D();
    this.nodoPeriastro = new THREE.Object3D();

    this.nodoOmega.rotation.y = this.nodoAscendente;
    this.nodoInclinacion.rotation.x = this.inclinacion;
    this.nodoPeriastro.rotation.y = this.argumentoPeriastro;

    this.nodoOmega.add(this.nodoInclinacion);
    this.nodoInclinacion.add(this.nodoPeriastro);

    this.linea = null;
    this._posicion = new THREE.Vector3();
  }

  /** Nodo raíz que hay que añadir a la escena. */
  get objeto() {
    return this.nodoOmega;
  }

  /**
   * Anomalía media para una fecha. Es lo único que depende del tiempo:
   * el resto de la órbita es fijo.
   */
  anomaliaMediaEn(fecha) {
    if (!this.periodoDias) return this.anomaliaMediaEpoca;
    const diasDesdeEpoca = (fecha.getTime() - EPOCA_J2000) / MS_POR_DIA;
    return normalizarAngulo(this.anomaliaMediaEpoca + (DOS_PI * diasDesdeEpoca) / this.periodoDias);
  }

  /** Posición del cuerpo, en coordenadas locales del nodo del periastro. */
  posicionEn(fecha, destino = this._posicion) {
    const { x, y } = posicionOrbital(this.semieje, this.excentricidad, this.anomaliaMediaEn(fecha));
    return destino.set(x, 0, -y);
  }

  /**
   * Construye la línea de la trayectoria.
   *
   * El muestreo es uniforme en anomalía EXCÉNTRICA, no en anomalía media: así
   * los puntos se concentran donde la elipse se curva más y la línea no se
   * quiebra en el periastro de las órbitas muy excéntricas, como la de Eris.
   */
  crearLinea({ color = 0x4fc3f7, opacidad = 0.28, segmentos = 256 } = {}) {
    const puntos = new Float32Array((segmentos + 1) * 3);
    const b = this.semieje * Math.sqrt(1 - this.excentricidad ** 2);

    for (let i = 0; i <= segmentos; i++) {
      const E = (i / segmentos) * DOS_PI;
      puntos[i * 3] = this.semieje * (Math.cos(E) - this.excentricidad);
      puntos[i * 3 + 1] = 0;
      puntos[i * 3 + 2] = -b * Math.sin(E);
    }

    const geometria = new THREE.BufferGeometry();
    geometria.setAttribute('position', new THREE.BufferAttribute(puntos, 3));

    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: opacidad,
      depthWrite: false,          // Sin esto, las órbitas se recortan entre sí.
    });

    this.linea = new THREE.Line(geometria, material);
    this.linea.frustumCulled = false;
    this.nodoPeriastro.add(this.linea);
    return this.linea;
  }

  establecerVisibilidadLinea(visible) {
    if (this.linea) this.linea.visible = visible;
  }

  /**
   * Cambia el semieje mayor y redibuja la trayectoria. Lo usa el cambio entre
   * escala didáctica y real: la forma de la elipse no cambia —la excentricidad
   * y los ángulos son los mismos—, solo su tamaño.
   */
  establecerSemieje(nuevo) {
    if (!nuevo || nuevo === this.semieje) return;
    this.semieje = nuevo;

    if (!this.linea) return;
    const atributo = this.linea.geometry.attributes.position;
    const segmentos = atributo.count - 1;
    const b = this.semieje * Math.sqrt(1 - this.excentricidad ** 2);

    for (let i = 0; i <= segmentos; i++) {
      const E = (i / segmentos) * DOS_PI;
      atributo.setXYZ(i, this.semieje * (Math.cos(E) - this.excentricidad), 0, -b * Math.sin(E));
    }
    atributo.needsUpdate = true;
    this.linea.geometry.computeBoundingSphere();
  }

  destruir() {
    if (this.linea) {
      this.linea.geometry.dispose();
      this.linea.material.dispose();
      this.nodoPeriastro.remove(this.linea);
      this.linea = null;
    }
    this.nodoOmega.removeFromParent();
  }
}
