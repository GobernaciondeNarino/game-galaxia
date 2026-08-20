/**
 * Rings — anillos planetarios.
 *
 * Los radios interno y externo vienen del catálogo en radios planetarios, con
 * su fuente; no son valores estéticos. La geometría de anillo de Three.js trae
 * unas coordenadas UV que no sirven para una textura radial, así que se
 * reescriben: cada vértice recibe una U proporcional a su distancia al centro.
 */

import * as THREE from 'three';

export class Rings {
  /**
   * @param {object} config    datos.render.anillos del catálogo
   * @param {number} radioBase radio del planeta en unidades de escena
   */
  constructor(config, radioBase, gestor) {
    this.gestor = gestor;

    const interno = radioBase * (config.radioInternoRadios ?? 1.3);
    const externo = radioBase * (config.radioExternoRadios ?? 2.2);

    const geometria = gestor.registrar(new THREE.RingGeometry(interno, externo, 160, 4));
    this._reasignarUV(geometria, interno, externo);

    const material = gestor.registrar(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      }),
    );

    if (config.textura) {
      // La textura de anillos es una tira de 1024×63: no hay versión reducida
      // que merezca la pena, pesa 7 kB.
      material.map = gestor.cargarTextura(config.textura);
      material.alphaMap = material.map;
    } else {
      // Sin mapa fotográfico: bandas de color planas. La interfaz lo declara
      // como SIMULACIÓN para no hacerlas pasar por una imagen real.
      material.color.set(config.color ?? '#9fb6c4');
      material.opacity = 0.35;
    }

    this.malla = new THREE.Mesh(geometria, material);
    this.malla.rotation.x = Math.PI / 2;   // El anillo nace en el plano XY; el ecuador está en XZ.
    this.malla.renderOrder = 1;
    this.esSimulacion = !config.textura;
  }

  /**
   * RingGeometry reparte las UV como si fuera un plano. Para una textura de
   * anillo —una tira que va del borde interior al exterior— hace falta que U
   * sea la distancia normalizada al centro.
   */
  _reasignarUV(geometria, interno, externo) {
    const posicion = geometria.attributes.position;
    const uv = geometria.attributes.uv;
    const v = new THREE.Vector3();

    for (let i = 0; i < posicion.count; i++) {
      v.fromBufferAttribute(posicion, i);
      const distancia = v.length();
      uv.setXY(i, (distancia - interno) / (externo - interno), 0.5);
    }
    uv.needsUpdate = true;
  }

  get objeto() {
    return this.malla;
  }

  destruir() {
    this.malla.geometry.dispose();
    const material = this.malla.material;
    material.map?.dispose();
    material.dispose();
    this.malla.removeFromParent();
  }
}
