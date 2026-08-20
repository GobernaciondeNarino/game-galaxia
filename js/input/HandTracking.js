/**
 * HandTracking — detección de manos con MediaPipe.
 *
 * TRES REGLAS QUE MARCAN EL DISEÑO DE ESTE MÓDULO:
 *
 * 1. LA CÁMARA NO SE ENCIENDE SOLA. Solo se pide permiso cuando el usuario
 *    pulsa el botón, y hay un indicador visible y un apagado siempre a mano.
 *
 * 2. EL VÍDEO NO SALE DEL NAVEGADOR. Se procesa en local con WebAssembly. No
 *    hay ninguna petición de red con imágenes: se puede comprobar en la pestaña
 *    Red del navegador.
 *
 * 3. LA INFERENCIA NUNCA VA DENTRO DEL BUCLE DE RENDER. Detectar manos cuesta
 *    entre 8 y 25 ms; meterlo en el bucle de dibujo tiraría los fotogramas a la
 *    mitad. Corre en su propio temporizador, a 30 Hz como máximo, y baja a 15
 *    si la escena no llega a 40 fps.
 */

import { App } from '../core/App.js';
import { rutaApp } from '../utils/rutas.js';
import { log, aviso, error } from '../utils/debug.js';

const HZ_MAXIMO = 30;
const HZ_DEGRADADO = 15;
const FPS_PARA_DEGRADAR = 40;

export class HandTracking {
  constructor({ video, lienzoEsqueleto, alDetectar } = {}) {
    this.video = video;
    this.lienzo = lienzoEsqueleto;
    this.alDetectar = alDetectar;

    this.activa = false;
    this.cargando = false;
    this.detector = null;
    this.flujo = null;
    this.hz = HZ_MAXIMO;

    this._temporizador = null;
    this._ultimaMarca = -1;
  }

  get soportado() {
    return Boolean(navigator.mediaDevices?.getUserMedia) && window.isSecureContext;
  }

  /**
   * Enciende la cámara y carga el modelo.
   *
   * El orden importa: primero se pide el permiso y solo después se descarga el
   * modelo, que pesa 7,6 MB. Descargarlo antes gastaría los datos de quien
   * acaba denegando el permiso.
   */
  async activar() {
    if (this.activa || this.cargando) return this.activa;

    if (!this.soportado) {
      aviso('La cámara no está disponible: hace falta HTTPS y un navegador con getUserMedia.');
      App.emitir('manos:error', {
        motivo: 'no-soportado',
        mensaje: 'La cámara necesita una conexión HTTPS y un navegador compatible.',
      });
      return false;
    }

    this.cargando = true;
    App.emitir('manos:cargando', { paso: 'permiso' });

    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      this.cargando = false;
      const denegado = err?.name === 'NotAllowedError';
      App.emitir('manos:error', {
        motivo: denegado ? 'permiso-denegado' : 'sin-camara',
        mensaje: denegado
          ? 'Has denegado el acceso a la cámara. ORBIS sigue funcionando con ratón y teclado.'
          : 'No se ha encontrado ninguna cámara disponible.',
      });
      return false;
    }

    this.video.srcObject = this.flujo;
    this.video.muted = true;
    await this.video.play();

    App.emitir('manos:cargando', { paso: 'modelo' });

    try {
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');

      // Todo local: ni el WASM ni el modelo salen de este servidor.
      const conjunto = await FilesetResolver.forVisionTasks(rutaApp('vendor/mediapipe/wasm'));

      this.detector = await HandLandmarker.createFromOptions(conjunto, {
        baseOptions: {
          modelAssetPath: rutaApp('assets/models/hand_landmarker.task'),
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch (err) {
      error('No se pudo cargar el detector de manos:', err);
      this.cargando = false;
      this._soltarCamara();
      App.emitir('manos:error', {
        motivo: 'modelo',
        mensaje:
          'No se pudo cargar el modelo de detección de manos. Comprueba que ' +
          'assets/models/hand_landmarker.task y vendor/mediapipe llegaron al servidor.',
      });
      return false;
    }

    this.cargando = false;
    this.activa = true;
    App.preferencias.set('camaraActiva', true);
    App.emitir('manos:activa', {});
    log('Detección de manos activa.');

    this._programar();
    return true;
  }

  /** Apaga la cámara y libera el detector. */
  desactivar() {
    if (this._temporizador) clearTimeout(this._temporizador);
    this._temporizador = null;

    this.detector?.close?.();
    this.detector = null;

    this._soltarCamara();
    this._limpiarEsqueleto();

    this.activa = false;
    App.preferencias.set('camaraActiva', false);
    App.emitir('manos:inactiva', {});
    log('Detección de manos apagada.');
  }

  _soltarCamara() {
    for (const pista of this.flujo?.getTracks() ?? []) pista.stop();
    this.flujo = null;
    if (this.video) this.video.srcObject = null;
  }

  /**
   * Programa la siguiente inferencia. Se usa setTimeout y no
   * requestAnimationFrame a propósito: rAF ata la inferencia al ritmo de
   * dibujo, que es justo lo que hay que evitar.
   */
  _programar() {
    if (!this.activa) return;

    // Degradación por rendimiento. La escena manda: si no llega a 40 fps, la
    // inferencia se reduce a la mitad para devolverle tiempo de CPU.
    this.hz = App.estado.fps > 0 && App.estado.fps < FPS_PARA_DEGRADAR ? HZ_DEGRADADO : HZ_MAXIMO;

    this._temporizador = setTimeout(() => this._detectar(), 1000 / this.hz);
  }

  _detectar() {
    if (!this.activa || !this.detector) return;

    // Si el vídeo aún no tiene fotograma nuevo, no se gasta una inferencia.
    const marca = this.video.currentTime;
    if (marca === this._ultimaMarca || this.video.readyState < 2) {
      this._programar();
      return;
    }
    this._ultimaMarca = marca;

    let resultado = null;
    try {
      resultado = this.detector.detectForVideo(this.video, performance.now());
    } catch (err) {
      aviso('Fallo en una inferencia de manos; se continúa.', err);
      this._programar();
      return;
    }

    const manos = resultado?.landmarks ?? [];
    this._dibujarEsqueleto(manos);
    this.alDetectar?.(manos);

    this._programar();
  }

  /** Conexiones entre puntos, para dibujar el esqueleto de la mano. */
  static get CONEXIONES() {
    return [
      [0, 1], [1, 2], [2, 3], [3, 4],
      [0, 5], [5, 6], [6, 7], [7, 8],
      [5, 9], [9, 10], [10, 11], [11, 12],
      [9, 13], [13, 14], [14, 15], [15, 16],
      [13, 17], [17, 18], [18, 19], [19, 20],
      [0, 17],
    ];
  }

  _dibujarEsqueleto(manos) {
    const lienzo = this.lienzo;
    if (!lienzo) return;

    const ancho = lienzo.clientWidth || 160;
    const alto = lienzo.clientHeight || 120;
    if (lienzo.width !== ancho || lienzo.height !== alto) {
      lienzo.width = ancho;
      lienzo.height = alto;
    }

    const ctx = lienzo.getContext('2d');
    ctx.clearRect(0, 0, ancho, alto);
    if (!manos.length) return;

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(0, 229, 255, 0.85)';
    ctx.fillStyle = 'rgba(232, 160, 32, 0.95)';

    for (const puntos of manos) {
      // La vista previa va reflejada, como un espejo: es lo que espera quien
      // se ve a sí mismo en pantalla.
      const x = (p) => (1 - p.x) * ancho;
      const y = (p) => p.y * alto;

      ctx.beginPath();
      for (const [a, b] of HandTracking.CONEXIONES) {
        ctx.moveTo(x(puntos[a]), y(puntos[a]));
        ctx.lineTo(x(puntos[b]), y(puntos[b]));
      }
      ctx.stroke();

      for (const punto of puntos) {
        ctx.beginPath();
        ctx.arc(x(punto), y(punto), 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _limpiarEsqueleto() {
    const ctx = this.lienzo?.getContext('2d');
    ctx?.clearRect(0, 0, this.lienzo.width, this.lienzo.height);
  }

  destruir() {
    this.desactivar();
  }
}
