/**
 * PostFX — cadena de post-procesado.
 *
 * RenderPass → UnrealBloomPass → OutputPass. El bloom es lo que da a la escena
 * el aspecto de holograma iluminado: hace florecer el Sol y los bordes
 * luminosos sin necesidad de trucos en cada material.
 *
 * Los tres parámetros del bloom quedan expuestos para poder ajustarlos en
 * caliente desde el panel de depuración (?debug=1).
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Valores de partida. El pliego proponía 1,2 / 0,5 / 0,6; el umbral se ha
 * subido a 0,72 tras verlo en pantalla: con 0,6 entraban en el bloom las caras
 * iluminadas de los planetas y Saturno se convertía en una mancha blanca. Los
 * tres siguen siendo ajustables en caliente con ?debug=1.
 */
export const BLOOM_PREDETERMINADO = { intensidad: 1.1, radio: 0.5, umbral: 0.72 };

export class PostFX {
  /** @param {import('./SceneManager.js').SceneManager} gestor */
  constructor(gestor) {
    this.gestor = gestor;
    this.activo = true;

    const tamano = new THREE.Vector2(window.innerWidth, window.innerHeight);

    this.compositor = new EffectComposer(gestor.renderizador);
    this.compositor.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.compositor.setSize(tamano.x, tamano.y);

    this.pasoRender = new RenderPass(gestor.escena, gestor.camara);
    this.pasoBloom = new UnrealBloomPass(
      tamano,
      BLOOM_PREDETERMINADO.intensidad,
      BLOOM_PREDETERMINADO.radio,
      BLOOM_PREDETERMINADO.umbral,
    );
    this.pasoSalida = new OutputPass();

    this.compositor.addPass(this.pasoRender);
    this.compositor.addPass(this.pasoBloom);
    this.compositor.addPass(this.pasoSalida);
  }

  /** Ajusta el bloom en caliente. */
  configurarBloom({ intensidad, radio, umbral } = {}) {
    if (intensidad !== undefined) this.pasoBloom.strength = intensidad;
    if (radio !== undefined) this.pasoBloom.radius = radio;
    if (umbral !== undefined) this.pasoBloom.threshold = umbral;
  }

  get bloom() {
    return {
      intensidad: this.pasoBloom.strength,
      radio: this.pasoBloom.radius,
      umbral: this.pasoBloom.threshold,
    };
  }

  /**
   * Degradación de calidad. El bloom es lo más caro de la escena: apagarlo
   * recupera de golpe entre un 20 % y un 40 % del tiempo de fotograma en
   * equipos modestos.
   */
  establecerCalidad(nivel) {
    if (nivel === 'baja') {
      this.activo = false;
      return;
    }
    this.activo = true;
    this.compositor.setPixelRatio(
      nivel === 'media' ? 1 : Math.min(window.devicePixelRatio, 2),
    );
  }

  redimensionar(ancho, alto) {
    this.compositor.setSize(ancho, alto);
    this.compositor.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }

  render(delta) {
    if (this.activo) this.compositor.render(delta);
    else this.gestor.renderizador.render(this.gestor.escena, this.gestor.camara);
  }

  destruir() {
    this.pasoBloom.dispose?.();
    this.compositor.dispose?.();
  }
}
