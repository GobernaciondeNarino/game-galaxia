/**
 * SFX — sonidos de interfaz.
 *
 * Se sintetizan con la Web Audio API en lugar de cargar archivos: son tres
 * tonos cortos, y generar unos pocos osciladores pesa cero bytes de red frente
 * a tres peticiones más en el arranque.
 *
 * El contexto de audio no se crea hasta la primera interacción del usuario:
 * los navegadores lo bloquean antes, y crearlo al cargar deja un contexto
 * suspendido consumiendo recursos.
 */

import { App } from '../core/App.js';

const TONOS = {
  // [frecuencia inicial, frecuencia final, duración en segundos, ganancia]
  sobrevuelo: [880, 1180, 0.05, 0.05],
  seleccion: [520, 980, 0.12, 0.09],
  error: [420, 180, 0.22, 0.10],
  transicion: [220, 660, 0.18, 0.06],
};

export class SFX {
  constructor() {
    this.contexto = null;
    this.activo = true;
  }

  _asegurarContexto() {
    if (this.contexto) return this.contexto;
    const Contexto = window.AudioContext ?? window.webkitAudioContext;
    if (!Contexto) return null;
    this.contexto = new Contexto();
    return this.contexto;
  }

  /** Reproduce un tono. Silencioso si la narración está silenciada. */
  reproducir(nombre) {
    if (!this.activo || App.preferencias.get('narracionSilenciada')) return;

    const definicion = TONOS[nombre];
    if (!definicion) return;

    const contexto = this._asegurarContexto();
    if (!contexto) return;
    if (contexto.state === 'suspended') contexto.resume();

    const [desde, hasta, duracion, ganancia] = definicion;
    const ahora = contexto.currentTime;

    const oscilador = contexto.createOscillator();
    const volumen = contexto.createGain();

    oscilador.type = 'sine';
    oscilador.frequency.setValueAtTime(desde, ahora);
    oscilador.frequency.exponentialRampToValueAtTime(hasta, ahora + duracion);

    // Ataque y caída suaves: un tono que empieza y acaba en seco chasquea.
    volumen.gain.setValueAtTime(0, ahora);
    volumen.gain.linearRampToValueAtTime(ganancia * App.preferencias.get('volumenNarracion'), ahora + 0.012);
    volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + duracion);

    oscilador.connect(volumen).connect(contexto.destination);
    oscilador.start(ahora);
    oscilador.stop(ahora + duracion + 0.02);
  }

  destruir() {
    this.contexto?.close();
    this.contexto = null;
  }
}
