/**
 * CameraRig — movimiento de cámara entre cuerpos.
 *
 * El requisito difícil no es que el viaje sea suave, sino que sea
 * INTERRUMPIBLE: si a mitad de camino el usuario pide otro destino, la cámara
 * debe recalcular sin volver a empezar ni dar un tirón.
 *
 * Por eso no hay una animación con línea temporal, sino un seguimiento
 * continuo: en cada fotograma la cámara se acerca una fracción de lo que le
 * queda hacia un objetivo que puede cambiar cuando sea. Cambiar de destino es
 * simplemente escribir otro valor; el movimiento nunca se corta.
 *
 * El suavizado es independiente de la tasa de fotogramas, así que el viaje dura
 * lo mismo a 30 que a 120 fps.
 */

import * as THREE from 'three';
import { suavizar, acotar } from '../utils/math.js';

const REDUCIR_MOVIMIENTO = window.matchMedia?.('(prefers-reduced-motion: reduce)');

export class CameraRig {
  constructor(gestor) {
    this.gestor = gestor;
    this.camara = gestor.camara;
    this.controles = gestor.controles;

    /** Cuerpo que se sigue, o null para la vista general. */
    this.objetivo = null;

    /** Distancia deseada al objetivo, en unidades de escena. */
    this.distanciaDeseada = 260;

    /** Constantes de suavizado, en segundos. Más alto, más lento y más suave. */
    this.suavizadoPosicion = 0.55;
    this.suavizadoDistancia = 0.7;

    this._puntoObjetivo = new THREE.Vector3();
    this._deseado = new THREE.Vector3();
    this._direccion = new THREE.Vector3();
    this._temporal = new THREE.Vector3();

    /** Posición de reposo de la vista general. */
    this.posicionVistaGeneral = new THREE.Vector3(0, 120, 300);

    /**
     * Dirección desde la que conviene acercarse al cuerpo, calculada al
     * iniciar el viaje. Sin ella la cámara llega por donde le pilla, y la
     * mitad de las veces eso es la cara nocturna: un disco negro.
     */
    this._direccionPreferida = new THREE.Vector3();
    this._usarPreferida = false;

    this.enTransito = false;
    this._umbralLlegada = 0.5;
  }

  get movimientoReducido() {
    return REDUCIR_MOVIMIENTO?.matches ?? false;
  }

  /**
   * Encuadra un cuerpo. Llamarlo mientras hay otro viaje en curso no reinicia
   * nada: solo cambia el destino.
   *
   * @param {import('../system/CelestialBody.js').CelestialBody} cuerpo
   * @param {number} factor múltiplo del radio del cuerpo al que situarse
   */
  viajarA(cuerpo, factor = 4.2) {
    this.objetivo = cuerpo;
    // Los cuerpos muy pequeños necesitan un mínimo absoluto o la cámara
    // acabaría dentro de la geometría.
    this.distanciaDeseada = Math.max(0.35, cuerpo.radio * factor);
    this.enTransito = true;
    this._calcularDireccionPreferida(cuerpo);

    if (this.movimientoReducido) this._saltarAlDestino();
  }

  /**
   * Elige por dónde llegar: desde el lado iluminado, pero girado unos 42° y
   * elevado, de modo que se vea el terminador —la línea entre el día y la
   * noche— en lugar de un disco plano y uniformemente iluminado. Es el encuadre
   * de las imágenes de referencia y, además, el que más información da sobre
   * el relieve.
   *
   * El Sol está en el origen de la escena, así que la dirección hacia la luz
   * desde cualquier cuerpo es simplemente la de su posición cambiada de signo.
   */
  _calcularDireccionPreferida(cuerpo) {
    const posicion = cuerpo.posicionMundial(this._temporal);

    if (posicion.lengthSq() < 1e-6) {
      // El propio Sol: no hay «lado iluminado», se llega desde arriba.
      this._direccionPreferida.set(0.2, 0.55, 1).normalize();
      this._usarPreferida = true;
      return;
    }

    this._direccionPreferida.copy(posicion).negate().normalize();
    this._direccionPreferida.applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.73);   // ≈42°
    this._direccionPreferida.y += 0.28;
    this._direccionPreferida.normalize();
    this._usarPreferida = true;
  }

  /** Vuelve a la vista general del sistema. */
  volverAVistaGeneral(distancia = 300) {
    this.objetivo = null;
    this.distanciaDeseada = distancia;
    this.enTransito = true;
    this._usarPreferida = false;

    if (this.movimientoReducido) this._saltarAlDestino();
  }

  /** Punto al que mira la cámara ahora mismo. */
  _resolverPuntoObjetivo() {
    if (this.objetivo) {
      this.objetivo.posicionMundial(this._puntoObjetivo);
    } else {
      this._puntoObjetivo.set(0, 0, 0);
    }
    return this._puntoObjetivo;
  }

  /**
   * Posición ideal de la cámara: sobre la línea que la une con el objetivo, a
   * la distancia deseada. Conservar la dirección actual en lugar de imponer
   * una fija es lo que permite que el usuario siga girando la escena durante
   * el viaje sin pelearse con la cámara.
   */
  _resolverPosicionDeseada(punto, delta = 1 / 60) {
    this._direccion.copy(this.camara.position).sub(punto);

    if (this._direccion.lengthSq() < 1e-8) {
      // La cámara está justo encima del objetivo: hace falta una dirección
      // arbitraria pero estable para no dividir por cero.
      this._direccion.set(0, 0.35, 1);
    }

    if (!this.objetivo) {
      // En la vista general se recupera además la altura característica.
      this._direccion.copy(this.posicionVistaGeneral).normalize();
    } else if (this._usarPreferida && this.enTransito) {
      // Se gira hacia el lado iluminado de forma progresiva. Imponer la
      // dirección de golpe daría un latigazo; mezclarla deja un arco suave y,
      // sobre todo, sigue permitiendo que el usuario arrastre durante el viaje.
      //
      // La mezcla se calcula a partir del tiempo, no por fotograma: si no, en
      // un equipo a 15 fps el giro tardaría cuatro veces más que a 60.
      const mezcla = 1 - Math.exp(-delta / 0.75);
      this._direccion.normalize().lerp(this._direccionPreferida, mezcla).normalize();
    }

    return this._deseado.copy(punto).add(this._direccion.setLength(this.distanciaDeseada));
  }

  /** Coloca la cámara en el destino sin animación (prefers-reduced-motion). */
  _saltarAlDestino() {
    const punto = this._resolverPuntoObjetivo();
    const deseada = this._resolverPosicionDeseada(punto);
    this.camara.position.copy(deseada);
    this.controles.target.copy(punto);
    this.controles.update();
    this.enTransito = false;
  }

  /**
   * @param {number} delta segundos reales desde el fotograma anterior
   * @param {boolean} usuarioInteractuando true mientras se arrastra el ratón
   */
  actualizar(delta, usuarioInteractuando = false) {
    const punto = this._resolverPuntoObjetivo();

    // El punto de mira sigue SIEMPRE al cuerpo, aunque el viaje haya
    // terminado: de lo contrario un planeta en movimiento se saldría del
    // encuadre a las pocas semanas simuladas.
    this.controles.target.set(
      suavizar(this.controles.target.x, punto.x, this.suavizadoPosicion, delta),
      suavizar(this.controles.target.y, punto.y, this.suavizadoPosicion, delta),
      suavizar(this.controles.target.z, punto.z, this.suavizadoPosicion, delta),
    );

    // Mientras el usuario arrastra o hace zoom, la cámara es suya.
    if (usuarioInteractuando) {
      this.enTransito = false;
      return;
    }

    if (!this.enTransito) {
      // Aun sin viaje activo, la cámara acompaña al cuerpo manteniendo su
      // distancia: es lo que hace que seguir a Mercurio no maree.
      if (this.objetivo) this._acompanar(punto, delta);
      return;
    }

    const deseada = this._resolverPosicionDeseada(punto, delta);
    this.camara.position.set(
      suavizar(this.camara.position.x, deseada.x, this.suavizadoDistancia, delta),
      suavizar(this.camara.position.y, deseada.y, this.suavizadoDistancia, delta),
      suavizar(this.camara.position.z, deseada.z, this.suavizadoDistancia, delta),
    );

    // Se considera llegada cuando el error relativo es pequeño, no absoluto:
    // medio punto de error es mucho junto a Fobos y nada junto a Júpiter.
    const error = this.camara.position.distanceTo(deseada);
    if (error < this.distanciaDeseada * 0.02) this.enTransito = false;
  }

  /** Mantiene la distancia al cuerpo sin forzar la orientación. */
  _acompanar(punto, delta) {
    this._temporal.copy(this.camara.position).sub(punto);
    const distanciaActual = this._temporal.length();
    if (distanciaActual < 1e-6) return;

    const objetivo = acotar(
      this.distanciaDeseada,
      this.controles.minDistance,
      this.controles.maxDistance,
    );
    const nueva = suavizar(distanciaActual, objetivo, 1.4, delta);
    this.camara.position.copy(punto).add(this._temporal.setLength(nueva));
  }
}
