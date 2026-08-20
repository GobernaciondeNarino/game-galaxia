/**
 * Loop — bucle de render y reloj simulado.
 *
 * Separa dos tiempos que no hay que confundir:
 *   · el tiempo real, que marca cuánto ha tardado el último fotograma;
 *   · el tiempo simulado, que avanza a la velocidad que elija el usuario y es
 *     el que gobierna las órbitas y las rotaciones.
 *
 * Los suscriptores «lentos» (la HUD, las estadísticas) no necesitan
 * actualizarse sesenta veces por segundo, así que tienen su propio canal a
 * frecuencia reducida. Es lo que evita que repintar paneles cueste fotogramas.
 */

/** Velocidades disponibles del reloj simulado, en segundos simulados por segundo real. */
export const VELOCIDADES = [
  { etiqueta: 'PAUSA', factor: 0 },
  { etiqueta: '×1', factor: 1 },
  { etiqueta: '×100', factor: 100 },
  { etiqueta: '×10 000', factor: 10_000 },
  { etiqueta: '×1 000 000', factor: 1_000_000 },
];

export class Loop {
  constructor({ alActualizar, alRenderizar, alActualizarLento, hzLento = 10 }) {
    this.alActualizar = alActualizar;
    this.alRenderizar = alRenderizar;
    this.alActualizarLento = alActualizarLento;
    this.intervaloLento = 1 / hzLento;

    /** Índice dentro de VELOCIDADES. Arranca en ×100: se ve moverse sin marear. */
    this.indiceVelocidad = 2;

    /** Fecha simulada. Arranca en el momento real de apertura. */
    this.fechaSimulada = new Date();

    this.fps = 0;
    this.corriendo = false;

    this._ultimo = 0;
    this._acumuladoLento = 0;
    this._muestrasFps = [];
    this._id = null;
    this._paso = this._paso.bind(this);
  }

  get velocidad() {
    return VELOCIDADES[this.indiceVelocidad];
  }

  get pausado() {
    return this.velocidad.factor === 0;
  }

  establecerVelocidad(indice) {
    this.indiceVelocidad = Math.max(0, Math.min(VELOCIDADES.length - 1, indice));
    return this.velocidad;
  }

  alternarPausa() {
    this.indiceVelocidad = this.pausado ? (this._previa ?? 2) : ((this._previa = this.indiceVelocidad), 0);
    return this.velocidad;
  }

  iniciar() {
    if (this.corriendo) return;
    this.corriendo = true;
    this._ultimo = performance.now();
    this._id = requestAnimationFrame(this._paso);
  }

  detener() {
    this.corriendo = false;
    if (this._id !== null) cancelAnimationFrame(this._id);
    this._id = null;
  }

  _paso(ahora) {
    if (!this.corriendo) return;
    this._id = requestAnimationFrame(this._paso);

    const transcurrido = (ahora - this._ultimo) / 1000;
    this._ultimo = ahora;

    // Se acota el delta que gobierna la simulación: al volver de una pestaña en
    // segundo plano puede llegar un salto de varios segundos que dispararía los
    // cuerpos fuera de órbita.
    const delta = Math.min(0.1, transcurrido);

    // El contador de FPS usa el tiempo REAL, sin acotar. Si usara el acotado
    // nunca podría bajar de 10 fps por definición, y la degradación automática
    // de calidad —que se dispara por debajo de 32— no se activaría jamás en el
    // equipo lento al que está pensada para ayudar.
    this._muestrasFps.push(transcurrido);
    if (this._muestrasFps.length > 30) this._muestrasFps.shift();
    const media = this._muestrasFps.reduce((a, b) => a + b, 0) / this._muestrasFps.length;
    this.fps = Math.round(1 / Math.max(1e-6, media));

    const deltaSimulado = delta * this.velocidad.factor;
    if (deltaSimulado !== 0) {
      this.fechaSimulada = new Date(this.fechaSimulada.getTime() + deltaSimulado * 1000);
    }

    // Se entregan los dos tiempos. La simulación usa el acotado; el movimiento
    // de cámara usa el real, porque acotarlo haría que en un equipo lento la
    // cámara tardase varios segundos de más en llegar a su destino.
    this.alActualizar?.(delta, deltaSimulado, this.fechaSimulada, transcurrido);
    this.alRenderizar?.(delta);

    this._acumuladoLento += delta;
    if (this._acumuladoLento >= this.intervaloLento) {
      this.alActualizarLento?.(this._acumuladoLento, this.fps);
      this._acumuladoLento = 0;
    }
  }
}
