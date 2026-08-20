/**
 * AsteroidBelt — cinturones de asteroides y de Kuiper.
 *
 * Miles de cuerpos con una sola llamada de dibujo, usando InstancedMesh. Las
 * posiciones individuales son DECORATIVAS: no representan asteroides
 * catalogados, y la interfaz lo declara como SIMULACIÓN. Lo que sí es real son
 * los límites de la región, que vienen del catálogo con su fuente.
 *
 * La distribución usa un generador pseudoaleatorio con semilla fija: la misma
 * escena se ve igual en todos los equipos y en todas las recargas, y las
 * capturas de pantalla son reproducibles.
 */

import * as THREE from 'three';
import { DOS_PI } from '../utils/math.js';

/** Generador congruencial lineal. Determinista y suficiente para esto. */
function generador(semilla) {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado * 1664525 + 1013904223) >>> 0;
    return estado / 4294967296;
  };
}

export class AsteroidBelt {
  /**
   * @param {object} datos entrada de tipo «cinturon» del catálogo
   */
  constructor(datos, gestor, { semilla = 20260820 } = {}) {
    this.datos = datos;
    this.gestor = gestor;
    this.esSimulacion = true;

    const interno = datos.render.radioInternoEscalado;
    const externo = datos.render.radioExternoEscalado;
    const total = datos.render.instancias ?? 3000;
    const esKuiper = datos.id.includes('kuiper');

    // Los asteroides son piedras irregulares, no esferas: un icosaedro de
    // subdivisión 0 tiene 20 caras y ya da la silueta angulosa correcta.
    const geometria = gestor.registrar(new THREE.IcosahedronGeometry(1, 0));
    const material = gestor.registrar(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(datos.render.color ?? '#8A8175'),
        roughness: 1,
        metalness: 0,
        flatShading: true,
      }),
    );

    this.malla = new THREE.InstancedMesh(geometria, material, total);
    this.malla.frustumCulled = false;
    this.malla.name = datos.id;

    const aleatorio = generador(semilla);
    const matriz = new THREE.Matrix4();
    const posicion = new THREE.Vector3();
    const cuaternion = new THREE.Quaternion();
    const escala = new THREE.Vector3();
    const euler = new THREE.Euler();

    // Se guarda la velocidad angular de cada instancia para hacerlas orbitar.
    this._angulos = new Float32Array(total);
    this._radios = new Float32Array(total);
    this._velocidades = new Float32Array(total);
    this._alturas = new Float32Array(total);
    this._escalas = new Float32Array(total);
    this._giros = new Float32Array(total);

    for (let i = 0; i < total; i++) {
      // Distribución radial sesgada hacia el centro del cinturón, que es como
      // se reparten de verdad los asteroides entre las lagunas de Kirkwood.
      const t = (aleatorio() + aleatorio()) / 2;
      const radio = interno + (externo - interno) * t;
      const angulo = aleatorio() * DOS_PI;

      // Dispersión vertical proporcional al radio: el cinturón es un toro
      // grueso, no un disco plano.
      const altura = (aleatorio() - 0.5) * (externo - interno) * (esKuiper ? 0.35 : 0.18);
      const tamano = (esKuiper ? 0.09 : 0.06) * (0.35 + aleatorio() * 1.3);

      this._angulos[i] = angulo;
      this._radios[i] = radio;
      this._alturas[i] = altura;
      this._escalas[i] = tamano;
      this._giros[i] = aleatorio() * DOS_PI;
      // Tercera ley de Kepler: cuanto más lejos, más despacio.
      this._velocidades[i] = 0.35 / Math.pow(radio, 1.5);

      posicion.set(Math.cos(angulo) * radio, altura, Math.sin(angulo) * radio);
      euler.set(aleatorio() * DOS_PI, aleatorio() * DOS_PI, aleatorio() * DOS_PI);
      cuaternion.setFromEuler(euler);
      escala.setScalar(tamano);
      matriz.compose(posicion, cuaternion, escala);
      this.malla.setMatrixAt(i, matriz);
    }

    this.malla.instanceMatrix.needsUpdate = true;

    this._matriz = matriz;
    this._posicion = posicion;
    this._cuaternion = cuaternion;
    this._escala = escala;
    this._euler = euler;
    this._total = total;
    this._acumulado = 0;
  }

  get objeto() {
    return this.malla;
  }

  /**
   * Hace avanzar las instancias por su órbita.
   *
   * Recomponer 5.000 matrices cuesta, así que solo se hace cuando el
   * movimiento acumulado es perceptible. Con el reloj en pausa no se toca nada.
   */
  actualizar(deltaSimuladoDias) {
    if (!deltaSimuladoDias) return;
    this._acumulado += deltaSimuladoDias;
    if (Math.abs(this._acumulado) < 0.35) return;

    const paso = this._acumulado;
    this._acumulado = 0;

    for (let i = 0; i < this._total; i++) {
      this._angulos[i] += this._velocidades[i] * paso;
      this._giros[i] += 0.004 * paso;

      const radio = this._radios[i];
      this._posicion.set(
        Math.cos(this._angulos[i]) * radio,
        this._alturas[i],
        Math.sin(this._angulos[i]) * radio,
      );
      this._euler.set(this._giros[i] * 0.7, this._giros[i], this._giros[i] * 0.3);
      this._cuaternion.setFromEuler(this._euler);
      this._escala.setScalar(this._escalas[i]);
      this._matriz.compose(this._posicion, this._cuaternion, this._escala);
      this.malla.setMatrixAt(i, this._matriz);
    }
    this.malla.instanceMatrix.needsUpdate = true;
  }

  establecerVisibilidad(visible) {
    this.malla.visible = visible;
  }

  destruir() {
    this.malla.geometry.dispose();
    this.malla.material.dispose();
    this.malla.dispose();
    this.malla.removeFromParent();
  }
}
