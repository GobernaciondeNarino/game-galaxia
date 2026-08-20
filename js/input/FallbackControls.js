/**
 * FallbackControls — ratón, táctil y teclado.
 *
 * El nombre viene del pliego, pero conviene aclarar qué son: NO son un plan B.
 * Son los controles principales y siempre están activos. Los gestos y la voz se
 * añaden encima cuando el usuario los habilita; si no lo hace, o si deniega los
 * permisos, ORBIS funciona igual de bien.
 */

import * as THREE from 'three';
import { App } from '../core/App.js';
import { log } from '../utils/debug.js';

/** Umbral en píxeles por debajo del cual un arrastre cuenta como clic. */
const TOLERANCIA_CLIC = 5;

export class FallbackControls {
  constructor(gestor, sistema, {
    alSeleccionar, alPedirVistaGeneral, alPedirVecino,
    alAlternarPausa, alAlternarOrbitas, alAlternarSilencio, alPedirAyuda,
  } = {}) {
    this.gestor = gestor;
    this.sistema = sistema;
    this.alSeleccionar = alSeleccionar;
    this.alPedirVistaGeneral = alPedirVistaGeneral;
    this.alPedirVecino = alPedirVecino;
    this.alAlternarPausa = alAlternarPausa;
    this.alAlternarOrbitas = alAlternarOrbitas;
    this.alAlternarSilencio = alAlternarSilencio;
    this.alPedirAyuda = alPedirAyuda;

    this.rayo = new THREE.Raycaster();
    // Sin esto, apuntar a Fobos (0,06 unidades) es prácticamente imposible.
    this.rayo.params.Points.threshold = 0.5;

    this.puntero = new THREE.Vector2();
    this._inicioPuntero = null;
    this._cuerpoResaltado = null;

    this._alPulsar = this._alPulsar.bind(this);
    this._alSoltar = this._alSoltar.bind(this);
    this._alMover = this._alMover.bind(this);
    this._alTeclear = this._alTeclear.bind(this);

    const lienzo = gestor.lienzo;
    lienzo.addEventListener('pointerdown', this._alPulsar);
    lienzo.addEventListener('pointerup', this._alSoltar);
    lienzo.addEventListener('pointermove', this._alMover);
    window.addEventListener('keydown', this._alTeclear);

    // El lienzo debe poder recibir el foco para que funcione el teclado.
    lienzo.tabIndex = 0;
    lienzo.setAttribute('role', 'application');
    lienzo.setAttribute(
      'aria-label',
      'Escena tridimensional del Sistema Solar. Use las flechas para orbitar, ' +
        'más y menos para acercar, Re Pág y Av Pág para cambiar de cuerpo y Escape para la vista general.',
    );
  }

  /** Convierte coordenadas de pantalla a coordenadas normalizadas del lienzo. */
  _actualizarPuntero(evento) {
    this.puntero.x = (evento.clientX / window.innerWidth) * 2 - 1;
    this.puntero.y = -(evento.clientY / window.innerHeight) * 2 + 1;
  }

  /** Cuerpo bajo el cursor, o null. */
  _cuerpoBajoPuntero() {
    this.rayo.setFromCamera(this.puntero, this.gestor.camara);
    const impactos = this.rayo.intersectObjects(this.sistema.seleccionables, false);
    return impactos.length ? impactos[0].object.userData.cuerpo ?? null : null;
  }

  _alPulsar(evento) {
    this._inicioPuntero = { x: evento.clientX, y: evento.clientY };
  }

  _alSoltar(evento) {
    if (!this._inicioPuntero) return;
    const recorrido = Math.hypot(
      evento.clientX - this._inicioPuntero.x,
      evento.clientY - this._inicioPuntero.y,
    );
    this._inicioPuntero = null;

    // Arrastrar para orbitar no debe seleccionar nada.
    if (recorrido > TOLERANCIA_CLIC) return;

    this._actualizarPuntero(evento);
    const cuerpo = this._cuerpoBajoPuntero();
    if (cuerpo) {
      log('Selección con ratón:', cuerpo.id);
      this.alSeleccionar?.(cuerpo.id, 'raton');
    }
  }

  _alMover(evento) {
    this._actualizarPuntero(evento);

    // El resaltado se calcula solo cuando no se está arrastrando: lanzar un
    // rayo por cada movimiento durante una rotación es tirar fotogramas.
    if (this._inicioPuntero) return;

    const cuerpo = this._cuerpoBajoPuntero();
    if (cuerpo === this._cuerpoResaltado) return;

    this._cuerpoResaltado = cuerpo;
    this.gestor.lienzo.style.cursor = cuerpo ? 'pointer' : 'default';
    App.emitir('entrada:resaltado', { id: cuerpo?.id ?? null });
  }

  _alTeclear(evento) {
    // No secuestrar el teclado mientras se escribe en un campo.
    const activo = document.activeElement;
    if (activo && ['INPUT', 'TEXTAREA', 'SELECT'].includes(activo.tagName)) return;
    if (evento.metaKey || evento.ctrlKey || evento.altKey) return;

    const PASO_ANGULO = 0.09;
    let manejado = true;

    switch (evento.key) {
      case 'ArrowLeft':
        evento.shiftKey ? this.desplazarPor(-0.05, 0) : this._orbitar(-PASO_ANGULO, 0);
        break;
      case 'ArrowRight':
        evento.shiftKey ? this.desplazarPor(0.05, 0) : this._orbitar(PASO_ANGULO, 0);
        break;
      case 'ArrowUp':
        evento.shiftKey ? this.desplazarPor(0, 0.05) : this._orbitar(0, -PASO_ANGULO);
        break;
      case 'ArrowDown':
        evento.shiftKey ? this.desplazarPor(0, -0.05) : this._orbitar(0, PASO_ANGULO);
        break;
      case '+':
      case '=':
        this._acercar(0.85);
        break;
      case '-':
      case '_':
        this._acercar(1.18);
        break;
      case 'Escape':
        this.alPedirVistaGeneral?.();
        break;
      case 'PageDown':
        this.alPedirVecino?.(1);
        break;
      case 'PageUp':
        this.alPedirVecino?.(-1);
        break;
      case ' ':
        this.alAlternarPausa?.();
        break;
      case 'o':
      case 'O':
        this.alAlternarOrbitas?.();
        break;
      case 'm':
      case 'M':
        this.alAlternarSilencio?.();
        break;
      case 'F1':
      case '?':
        this.alPedirAyuda?.();
        break;
      default:
        manejado = false;
    }

    if (manejado) evento.preventDefault();
  }

  /**
   * Devuelve el cuerpo que hay en un punto de la pantalla, en coordenadas
   * normalizadas de 0 a 1. Lo usa el control por gestos, que no tiene un evento
   * de ratón del que sacar las coordenadas.
   */
  cuerpoEnPunto(xNormalizado, yNormalizado) {
    this.puntero.x = xNormalizado * 2 - 1;
    this.puntero.y = -(yNormalizado * 2 - 1);
    return this._cuerpoBajoPuntero();
  }

  /** Orbita la cámara. Público: lo usan el teclado y los gestos. */
  orbitarPor(deltaAzimut, deltaPolar) {
    this._orbitar(deltaAzimut, deltaPolar);
  }

  /** Acerca o aleja la cámara por un factor. */
  acercarPor(factor) {
    this._acercar(factor);
  }

  /**
   * Desplaza el punto de mira paralelamente al plano de la cámara.
   * OrbitControls.pan() no forma parte de su API pública en todas las
   * versiones, así que se calcula aquí con los ejes de la propia cámara.
   */
  desplazarPor(dx, dy) {
    const camara = this.gestor.camara;
    const controles = this.gestor.controles;
    const distancia = camara.position.distanceTo(controles.target);

    const derecha = new THREE.Vector3().setFromMatrixColumn(camara.matrix, 0);
    const arriba = new THREE.Vector3().setFromMatrixColumn(camara.matrix, 1);

    const desplazamiento = new THREE.Vector3()
      .addScaledVector(derecha, -dx * distancia)
      .addScaledVector(arriba, dy * distancia);

    camara.position.add(desplazamiento);
    controles.target.add(desplazamiento);
    controles.update();
  }

  /** Orbita la cámara alrededor del objetivo actual de OrbitControls. */
  _orbitar(deltaAzimut, deltaPolar) {
    const controles = this.gestor.controles;
    const camara = this.gestor.camara;
    const desplazamiento = camara.position.clone().sub(controles.target);
    const esferica = new THREE.Spherical().setFromVector3(desplazamiento);

    esferica.theta += deltaAzimut;
    esferica.phi = THREE.MathUtils.clamp(esferica.phi + deltaPolar, 0.05, Math.PI - 0.05);

    camara.position.copy(controles.target).add(desplazamiento.setFromSpherical(esferica));
    controles.update();
  }

  _acercar(factor) {
    const controles = this.gestor.controles;
    const camara = this.gestor.camara;
    const desplazamiento = camara.position.clone().sub(controles.target);
    const distancia = THREE.MathUtils.clamp(
      desplazamiento.length() * factor,
      controles.minDistance,
      controles.maxDistance,
    );
    camara.position.copy(controles.target).add(desplazamiento.setLength(distancia));
    controles.update();
  }

  destruir() {
    const lienzo = this.gestor.lienzo;
    lienzo.removeEventListener('pointerdown', this._alPulsar);
    lienzo.removeEventListener('pointerup', this._alSoltar);
    lienzo.removeEventListener('pointermove', this._alMover);
    window.removeEventListener('keydown', this._alTeclear);
  }
}
