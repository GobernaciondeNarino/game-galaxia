/**
 * Galaxy — el entorno: campo estelar y disco de la Vía Láctea.
 *
 * Dos capas independientes:
 *
 *   · Un cielo esférico con el mapa estelar real (Solar System Scope, CC BY
 *     4.0), pintado por dentro. Da el fondo constante de la escena.
 *   · Un disco de partículas que representa la Vía Láctea vista desde fuera,
 *     visible solo al alejarse mucho. Es DECORATIVO —no es un mapa de
 *     posiciones estelares— y la interfaz lo marca como SIMULACIÓN.
 */

import * as THREE from 'three';
import { DOS_PI } from '../utils/math.js';

function generador(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

export class Galaxy {
  constructor(gestor, { textura = null, radio = 9000, particulas = 12000, semilla = 31415 } = {}) {
    this.gestor = gestor;
    this.grupo = new THREE.Group();
    this.grupo.name = 'entorno-galactico';
    this.esSimulacion = true;

    this.cielo = this._crearCielo(textura, radio);
    this.grupo.add(this.cielo);

    this.disco = this._crearDisco(particulas, semilla, radio * 0.55);
    this.grupo.add(this.disco);
  }

  _crearCielo(textura, radio) {
    const geometria = this.gestor.registrar(new THREE.SphereGeometry(radio, 48, 32));
    const material = this.gestor.registrar(
      new THREE.MeshBasicMaterial({
        side: THREE.BackSide,     // Se ve desde dentro.
        depthWrite: false,
        color: textura ? 0xffffff : 0x0a1628,
      }),
    );

    if (textura) {
      material.map = this.gestor.cargarTextura(textura);
      // El fondo estelar no debe competir con la escena: se atenúa.
      material.color.setScalar(0.55);
    }

    const malla = new THREE.Mesh(geometria, material);
    malla.name = 'cielo-estelar';
    malla.renderOrder = -1;
    return malla;
  }

  /**
   * Disco galáctico: dos brazos espirales logarítmicos más un bulbo central.
   * Puramente representativo del aspecto de una galaxia espiral barrada.
   */
  _crearDisco(total, semilla, radio) {
    const aleatorio = generador(semilla);
    const posiciones = new Float32Array(total * 3);
    const colores = new Float32Array(total * 3);

    const colorNucleo = new THREE.Color('#ffd9a0');
    const colorBrazo = new THREE.Color('#7fb2ff');
    const color = new THREE.Color();

    const BRAZOS = 2;
    const APERTURA = 0.32;      // Cuánto se abre la espiral logarítmica.

    for (let i = 0; i < total; i++) {
      const enBulbo = aleatorio() < 0.18;
      let x;
      let y;
      let z;

      if (enBulbo) {
        // Bulbo central: distribución esférica concentrada.
        const r = radio * 0.12 * Math.cbrt(aleatorio());
        const theta = aleatorio() * DOS_PI;
        const phi = Math.acos(2 * aleatorio() - 1);
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.cos(phi) * 0.75;
        z = r * Math.sin(phi) * Math.sin(theta);
        color.copy(colorNucleo);
      } else {
        const t = Math.sqrt(aleatorio());              // Más densidad hacia el centro.
        const r = radio * (0.12 + 0.88 * t);
        const brazo = Math.floor(aleatorio() * BRAZOS);
        const anguloBase = (brazo / BRAZOS) * DOS_PI + Math.log(r / (radio * 0.1)) / APERTURA;
        // Dispersión perpendicular al brazo, proporcional al radio.
        const dispersion = (aleatorio() + aleatorio() + aleatorio() - 1.5) * 0.45;
        const angulo = anguloBase + dispersion;

        x = Math.cos(angulo) * r;
        z = Math.sin(angulo) * r;
        y = (aleatorio() + aleatorio() - 1) * radio * 0.035;
        color.copy(colorBrazo).lerp(colorNucleo, Math.max(0, 1 - t * 1.6));
      }

      posiciones[i * 3] = x;
      posiciones[i * 3 + 1] = y;
      posiciones[i * 3 + 2] = z;
      colores[i * 3] = color.r;
      colores[i * 3 + 1] = color.g;
      colores[i * 3 + 2] = color.b;
    }

    const geometria = this.gestor.registrar(new THREE.BufferGeometry());
    geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    geometria.setAttribute('color', new THREE.BufferAttribute(colores, 3));

    const material = this.gestor.registrar(
      new THREE.PointsMaterial({
        size: radio * 0.006,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    const puntos = new THREE.Points(geometria, material);
    puntos.name = 'disco-galactico';
    // El Sistema Solar está en el brazo de Orión, a unos 26.000 años luz del
    // centro: el disco se desplaza para que la escena quede en esa posición.
    puntos.position.set(radio * 0.55, 0, 0);
    puntos.rotation.x = 0.42;    // La eclíptica está inclinada ~60° respecto al plano galáctico.
    puntos.visible = false;      // Solo aparece al alejar mucho la cámara.
    return puntos;
  }

  /**
   * El disco galáctico solo tiene sentido cuando la cámara se aleja lo
   * suficiente como para que el Sistema Solar sea un punto. Aparecer y
   * desaparecer con un fundido evita el parpadeo.
   */
  actualizarSegunDistancia(distanciaCamara, delta) {
    const objetivo = distanciaCamara > 700 ? 1 : 0;
    const actual = this.disco.material.opacity;
    const nueva = actual + (objetivo * 0.75 - actual) * Math.min(1, delta * 2.2);

    this.disco.material.opacity = nueva;
    this.disco.visible = nueva > 0.01;
  }

  get objeto() {
    return this.grupo;
  }

  destruir() {
    for (const hijo of [this.cielo, this.disco]) {
      hijo.geometry.dispose();
      hijo.material.map?.dispose();
      hijo.material.dispose();
    }
    this.grupo.clear();
    this.grupo.removeFromParent();
  }
}
