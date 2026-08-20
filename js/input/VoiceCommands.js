/**
 * VoiceCommands — control por voz.
 *
 * Dos rutas de reconocimiento, elegidas automáticamente y ANUNCIADAS al
 * usuario, porque no son equivalentes en privacidad:
 *
 *   1. Web Speech API del navegador (Chrome, Edge). Es la ruta principal.
 *      Conviene saber que Chrome envía el audio a servidores de Google para
 *      transcribirlo; la interfaz lo dice antes de encender el micrófono.
 *   2. MediaRecorder + api/stt.php (Firefox, Safari). El audio va a este
 *      servidor y de ahí a ElevenLabs; no se guarda en ningún momento.
 *
 * En los dos casos el micrófono se enciende solo cuando el usuario lo pide, hay
 * un indicador visible mientras está activo y se puede apagar en cualquier
 * momento.
 */

import { App } from '../core/App.js';
import { rutaApp } from '../utils/rutas.js';
import { ParserIntenciones } from './ParserIntenciones.js';
import { log, aviso, error } from '../utils/debug.js';

/** Duración de cada fragmento en la ruta por servidor. */
const FRAGMENTO_MS = 3500;

export class VoiceCommands {
  /**
   * @param {object} vocabulario data/comandos-voz.json
   * @param {(intencion:object)=>void} alInterpretar
   */
  constructor(vocabulario, alInterpretar) {
    this.parser = new ParserIntenciones(vocabulario);
    this.alInterpretar = alInterpretar;

    this.activo = false;
    this.motor = this._detectarMotor();
    this.reconocedor = null;
    this.grabadora = null;
    this.flujo = null;
    this._parandoAdrede = false;
  }

  /** Elige la ruta según lo que soporte el navegador. */
  _detectarMotor() {
    const Reconocimiento = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (Reconocimiento) return 'navegador';
    if (window.MediaRecorder && navigator.mediaDevices?.getUserMedia) return 'servidor';
    return 'ninguno';
  }

  /** Texto que la interfaz debe mostrar ANTES de pedir el micrófono. */
  get avisoPrivacidad() {
    if (this.motor === 'navegador') {
      return 'Tu navegador transcribe la voz con su propio servicio, que puede enviar el audio a sus servidores.';
    }
    if (this.motor === 'servidor') {
      return 'Tu navegador no reconoce voz por sí solo. ORBIS enviará fragmentos cortos de audio a este servidor para transcribirlos; no se guardan.';
    }
    return 'Este navegador no admite reconocimiento de voz. Usa el ratón o el teclado.';
  }

  async activar() {
    if (this.activo) return true;

    if (this.motor === 'ninguno') {
      App.emitir('voz:error', {
        motivo: 'no-soportado',
        mensaje: 'Este navegador no admite reconocimiento de voz. ORBIS funciona igual con ratón y teclado.',
      });
      return false;
    }
    if (!window.isSecureContext) {
      App.emitir('voz:error', {
        motivo: 'sin-https',
        mensaje: 'El micrófono necesita una conexión HTTPS.',
      });
      return false;
    }

    const exito = this.motor === 'navegador'
      ? await this._activarNavegador()
      : await this._activarServidor();

    if (exito) {
      this.activo = true;
      App.preferencias.set('microfonoActivo', true);
      App.emitir('voz:activa', { motor: this.motor });
      log(`Reconocimiento de voz activo (${this.motor}).`);
    }
    return exito;
  }

  async _activarNavegador() {
    const Reconocimiento = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const reconocedor = new Reconocimiento();

    reconocedor.lang = 'es-CO';
    reconocedor.continuous = true;
    reconocedor.interimResults = true;
    reconocedor.maxAlternatives = 3;

    reconocedor.onresult = (evento) => {
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        const texto = resultado[0].transcript;

        if (!resultado.isFinal) {
          App.emitir('voz:parcial', { texto });
          continue;
        }

        // Se prueban todas las alternativas y se queda la de mayor confianza:
        // la primera no siempre es la que el parser entiende mejor.
        let mejor = null;
        for (let a = 0; a < resultado.length; a++) {
          const intencion = this.parser.interpretar(resultado[a].transcript);
          if (!mejor || intencion.confianza > mejor.confianza) {
            mejor = { ...intencion, transcripcion: resultado[a].transcript };
          }
        }
        this._entregar(mejor);
      }
    };

    reconocedor.onerror = (evento) => {
      if (evento.error === 'no-speech' || evento.error === 'aborted') return;
      const denegado = evento.error === 'not-allowed' || evento.error === 'service-not-allowed';
      App.emitir('voz:error', {
        motivo: denegado ? 'permiso-denegado' : evento.error,
        mensaje: denegado
          ? 'Has denegado el acceso al micrófono. ORBIS sigue funcionando con ratón y teclado.'
          : 'El reconocimiento de voz ha fallado. Se puede volver a intentar.',
      });
      if (denegado) this.desactivar();
    };

    // `continuous` no impide que el motor se detenga solo tras un silencio
    // largo. Se reinicia salvo que la parada la hayamos pedido nosotros.
    reconocedor.onend = () => {
      if (this.activo && !this._parandoAdrede) {
        try {
          reconocedor.start();
        } catch {
          /* Ya estaba arrancando: no pasa nada. */
        }
      }
    };

    try {
      reconocedor.start();
    } catch (err) {
      error('No se pudo iniciar el reconocimiento de voz:', err);
      return false;
    }

    this.reconocedor = reconocedor;
    return true;
  }

  async _activarServidor() {
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      App.emitir('voz:error', {
        motivo: err?.name === 'NotAllowedError' ? 'permiso-denegado' : 'sin-microfono',
        mensaje: 'No se pudo acceder al micrófono. ORBIS sigue funcionando con ratón y teclado.',
      });
      return false;
    }

    const tipo = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/ogg;codecs=opus';

    this.grabadora = new MediaRecorder(this.flujo, { mimeType: tipo, audioBitsPerSecond: 32000 });

    this.grabadora.ondataavailable = async (evento) => {
      if (!evento.data || evento.data.size < 1200) return;   // Fragmento vacío.
      await this._transcribir(evento.data);
    };

    // Fragmentos cortos y consecutivos: la alternativa —grabar hasta que el
    // usuario pare— daría respuestas con varios segundos de retraso.
    this.grabadora.start(FRAGMENTO_MS);
    return true;
  }

  async _transcribir(blob) {
    const formulario = new FormData();
    formulario.append('audio', blob, 'fragmento.webm');

    try {
      const respuesta = await fetch(rutaApp('api/stt.php'), { method: 'POST', body: formulario });
      if (!respuesta.ok) {
        const detalle = await respuesta.json().catch(() => ({}));
        App.emitir('voz:error', {
          motivo: detalle.error ?? 'transcripcion',
          mensaje: detalle.mensaje ?? 'No se pudo transcribir el audio.',
        });
        return;
      }

      const { texto } = await respuesta.json();
      if (!texto) return;

      const intencion = this.parser.interpretar(texto);
      this._entregar({ ...intencion, transcripcion: texto });
    } catch (err) {
      aviso('Fallo al transcribir un fragmento:', err);
    }
  }

  /** Entrega una intención, o pide confirmación si no se entendió. */
  _entregar(intencion) {
    App.emitir('voz:comando', { texto: intencion.transcripcion });

    if (!intencion.intencion || intencion.confianza === 0) {
      // Nunca se falla en silencio: se proponen alternativas.
      App.emitir('voz:no-entendido', {
        texto: intencion.transcripcion,
        sugerencias: intencion.sugerencias,
      });
      return;
    }

    this.alInterpretar?.(intencion);
  }

  desactivar() {
    this._parandoAdrede = true;

    try {
      this.reconocedor?.stop();
    } catch {
      /* Puede estar ya parado. */
    }
    this.reconocedor = null;

    if (this.grabadora?.state !== 'inactive') this.grabadora?.stop();
    this.grabadora = null;

    for (const pista of this.flujo?.getTracks() ?? []) pista.stop();
    this.flujo = null;

    this.activo = false;
    this._parandoAdrede = false;
    App.preferencias.set('microfonoActivo', false);
    App.emitir('voz:inactiva', {});
    log('Reconocimiento de voz apagado.');
  }

  destruir() {
    this.desactivar();
  }
}
