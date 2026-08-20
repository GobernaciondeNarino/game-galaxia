/**
 * Narrator — narración por audio de cada cuerpo.
 *
 * Dos motores, en este orden:
 *   1. api/tts.php, que devuelve el MP3 generado con ElevenLabs y cacheado en
 *      el servidor. Es la voz buena.
 *   2. SpeechSynthesis del navegador, si el primero no está disponible. Suena
 *      peor, pero la narración no desaparece por un problema de despliegue.
 *
 * En ambos casos hay subtítulos. No son opcionales: son la única forma de
 * seguir la narración para quien no oye, y también para quien tiene el volumen
 * apagado, que son muchos más.
 *
 * SINCRONIZACIÓN DE LOS SUBTÍTULOS. Con la voz del navegador se usan los
 * eventos `boundary`, que dan la posición exacta de la palabra que se está
 * leyendo. Con el MP3 no hay marcas de tiempo, así que se reparte la duración
 * real del audio entre las frases en proporción a su número de caracteres. No
 * es sincronización palabra a palabra, pero con frases de una o dos líneas el
 * desfase es de décimas y se corrige en cada cambio de frase.
 */

import { App } from '../core/App.js';
import { rutaApp } from '../utils/rutas.js';
import { log, aviso } from '../utils/debug.js';

/** Milisegundos del fundido de entrada y de salida. */
const FUNDIDO_ENTRADA = 320;
const FUNDIDO_SALIDA = 180;

/** Cuántos vecinos de la tira se precargan a cada lado. */
const VECINOS_PRECARGADOS = 2;

export class Narrator {
  /**
   * @param {object[]} catalogo entradas del catálogo, en orden de navegación
   * @param {import('../ui/Subtitles.js').Subtitles} subtitulos
   */
  /**
   * @param {object[]} catalogo entradas del catálogo, en orden de navegación
   * @param {import('../ui/Subtitles.js').Subtitles} subtitulos
   * @param {object|null} salud respuesta de api/health.php, si se obtuvo
   */
  constructor(catalogo, subtitulos, salud = null) {
    this.catalogo = catalogo;
    this.subtitulos = subtitulos;
    this.porId = new Map(catalogo.map((c) => [c.id, c]));
    this.orden = catalogo.map((c) => c.id);

    /** Elemento de audio único: reutilizarlo evita acumular reproductores. */
    this.audio = new Audio();
    this.audio.preload = 'auto';
    this.audio.volume = 0;

    /** Elementos de precarga de los vecinos, por id. */
    this.precargas = new Map();

    // Si el diagnóstico de arranque ya nos dijo que el servidor no puede
    // sintetizar, se empieza directamente con la voz del navegador. Así se
    // evita una petición condenada al fracaso —y su error en consola— por cada
    // cuerpo que se visite.
    this.motor = this._motorSegunSalud(salud);
    this.idActual = null;
    this.reproduciendo = false;
    this._fundido = null;
    this._locucion = null;         // SpeechSynthesisUtterance en curso

    this._alTerminar = () => this._terminar();
    this._alFallar = () => this._recurrirANavegador();
    this._alActualizarTiempo = () => this._sincronizarSubtitulos();

    this.audio.addEventListener('ended', this._alTerminar);
    this.audio.addEventListener('error', this._alFallar);
    this.audio.addEventListener('timeupdate', this._alActualizarTiempo);

    App.preferencias.alCambiar((clave) => {
      if (clave === 'volumenNarracion' || clave === 'narracionSilenciada') {
        this._aplicarVolumen();
      }
      if (clave === 'subtitulos') this.subtitulos.establecerActivos(App.preferencias.get('subtitulos'));
    });
  }

  /** Decide el motor inicial a partir del diagnóstico del servidor. */
  _motorSegunSalud(salud) {
    if (!salud?.comprobaciones) return 'servidor';

    const clave = salud.comprobaciones.find((c) => c.clave === 'clave_elevenlabs');
    const cache = salud.comprobaciones.find((c) => c.clave === 'cache_audio');

    if (clave && clave.resultado !== 'ok') {
      log('Sin clave de ElevenLabs en el servidor: narración con la voz del navegador.');
      return 'navegador';
    }
    if (cache && cache.resultado === 'error') {
      log('cache/audio no es escribible: narración con la voz del navegador.');
      return 'navegador';
    }
    return 'servidor';
  }

  get volumenObjetivo() {
    return App.preferencias.get('narracionSilenciada') ? 0 : App.preferencias.get('volumenNarracion');
  }

  _aplicarVolumen() {
    if (!this._fundido) this.audio.volume = this.volumenObjetivo;
  }

  /**
   * URL del audio de un cuerpo.
   * @param {boolean} soloCache true para las precargas: el servidor devuelve
   *   204 si el audio no está generado, en lugar de generarlo. Precargar no
   *   debe gastar el cupo por hora del visitante ni la cuota de la cuenta.
   */
  _url(id, soloCache = false) {
    const base = `${rutaApp('api/tts.php')}?bodyId=${encodeURIComponent(id)}`;
    return soloCache ? `${base}&soloCache=1` : base;
  }

  /**
   * Narra un cuerpo. Si ya se estaba narrando otro, se corta de inmediato:
   * dos voces solapadas son peores que ninguna.
   */
  async narrar(id) {
    const cuerpo = this.porId.get(id);
    if (!cuerpo?.narracion) {
      this.detener();
      return;
    }

    if (this.idActual === id && this.reproduciendo) return;

    this.detener();
    this.idActual = id;
    this.subtitulos.preparar(cuerpo.narracion, cuerpo.nombre);

    if (this.motor === 'navegador') {
      this._narrarConNavegador(cuerpo);
      this._precargarVecinos(id);
      return;
    }

    this.audio.src = this._url(id);
    this.audio.currentTime = 0;

    try {
      await this.audio.play();
      this.reproduciendo = true;
      this._fundir(this.volumenObjetivo, FUNDIDO_ENTRADA);
      App.emitir('narracion:inicio', { id, motor: this.motor });
    } catch (err) {
      // Los navegadores bloquean la reproducción automática hasta que hay una
      // interacción del usuario. No es un error del servidor y no debe hacer
      // que la aplicación cambie de motor.
      if (err?.name === 'NotAllowedError') {
        aviso('El navegador bloquea el audio hasta la primera interacción del usuario.');
        App.emitir('narracion:bloqueada', { id });
        return;
      }
      this._recurrirANavegador();
    }

    this._precargarVecinos(id);
  }

  /**
   * Precarga los vecinos en la tira de navegación. El usuario que va pasando
   * cuerpos con las flechas encuentra el audio ya descargado.
   *
   * Solo se precarga con el motor del servidor y con la red en buen estado: en
   * una conexión lenta, bajar tres MP3 a la vez retrasaría el que se quiere oír.
   */
  _precargarVecinos(id) {
    if (this.motor !== 'servidor') return;
    if (navigator.connection?.saveData) return;
    const tipo = navigator.connection?.effectiveType;
    if (tipo && ['slow-2g', '2g'].includes(tipo)) return;

    const indice = this.orden.indexOf(id);
    if (indice < 0) return;

    const deseados = new Set();
    for (let d = 1; d <= VECINOS_PRECARGADOS; d++) {
      deseados.add(this.orden[(indice + d) % this.orden.length]);
      deseados.add(this.orden[(indice - d + this.orden.length) % this.orden.length]);
    }

    // Se descartan las precargas que ya no hacen falta: si no, al recorrer el
    // catálogo entero quedarían treinta elementos de audio en memoria.
    for (const [clave, elemento] of this.precargas) {
      if (!deseados.has(clave)) {
        elemento.src = '';
        this.precargas.delete(clave);
      }
    }

    for (const vecino of deseados) {
      if (this.precargas.has(vecino)) continue;
      if (!this.porId.get(vecino)?.narracion) continue;
      const elemento = new Audio();
      elemento.preload = 'auto';
      // Un 204 hace que el elemento dispare `error`. Es lo esperado y no debe
      // cambiar el motor de narración ni ensuciar la consola.
      elemento.addEventListener('error', (e) => e.stopPropagation(), { once: true });
      elemento.src = this._url(vecino, true);
      this.precargas.set(vecino, elemento);
    }
  }

  /** Voz del navegador: peor calidad, pero siempre disponible. */
  _narrarConNavegador(cuerpo) {
    if (!('speechSynthesis' in window)) {
      this.motor = 'ninguno';
      App.emitir('narracion:sin-motor', {});
      return;
    }

    window.speechSynthesis.cancel();

    const locucion = new SpeechSynthesisUtterance(cuerpo.narracion);
    locucion.lang = 'es-ES';
    locucion.rate = 0.98;
    locucion.pitch = 1;
    locucion.volume = this.volumenObjetivo;

    // `boundary` da la posición del carácter que se está leyendo: con eso los
    // subtítulos van exactos, sin estimaciones.
    locucion.onboundary = (evento) => {
      if (evento.name === 'word' || evento.charIndex !== undefined) {
        this.subtitulos.mostrarEnCaracter(evento.charIndex);
      }
    };
    locucion.onend = () => this._terminar();
    locucion.onerror = () => this._terminar();

    this._locucion = locucion;
    this.reproduciendo = true;
    window.speechSynthesis.speak(locucion);
    App.emitir('narracion:inicio', { id: cuerpo.id, motor: 'navegador' });
  }

  /** Cambia al motor del navegador y reintenta con el cuerpo actual. */
  _recurrirANavegador() {
    if (this.motor === 'navegador') return;
    aviso('La narración con voz del servidor no está disponible; se usa la del navegador.');
    this.motor = 'navegador';
    App.emitir('narracion:motor', { motor: 'navegador' });

    const cuerpo = this.idActual ? this.porId.get(this.idActual) : null;
    if (cuerpo) this._narrarConNavegador(cuerpo);
  }

  _sincronizarSubtitulos() {
    if (!this.reproduciendo || !Number.isFinite(this.audio.duration)) return;
    this.subtitulos.mostrarEnFraccion(this.audio.currentTime / this.audio.duration);
  }

  _terminar() {
    this.reproduciendo = false;
    this.subtitulos.limpiar();
    App.emitir('narracion:fin', { id: this.idActual });
  }

  /** Interrupción inmediata, con un fundido muy corto para que no chasquee. */
  detener() {
    if (this._locucion) {
      window.speechSynthesis?.cancel();
      this._locucion = null;
    }

    if (!this.audio.paused) {
      this._fundir(0, FUNDIDO_SALIDA, () => {
        this.audio.pause();
        this.audio.currentTime = 0;
      });
    }

    this.reproduciendo = false;
    this.subtitulos.limpiar();
  }

  /** Repite la narración del cuerpo actual desde el principio. */
  repetir() {
    if (this.idActual) {
      const id = this.idActual;
      this.idActual = null;
      this.narrar(id);
    }
  }

  silenciar(silenciada) {
    App.preferencias.set('narracionSilenciada', silenciada);
    if (silenciada) this.detener();
  }

  establecerVolumen(volumen) {
    App.preferencias.set('volumenNarracion', Math.min(1, Math.max(0, volumen)));
  }

  /** Fundido lineal del volumen. */
  _fundir(destino, duracion, alTerminar) {
    if (this._fundido) clearInterval(this._fundido);

    const inicio = this.audio.volume;
    const arranque = performance.now();

    this._fundido = setInterval(() => {
      const t = Math.min(1, (performance.now() - arranque) / duracion);
      this.audio.volume = inicio + (destino - inicio) * t;
      if (t >= 1) {
        clearInterval(this._fundido);
        this._fundido = null;
        alTerminar?.();
      }
    }, 16);
  }

  destruir() {
    this.detener();
    this.audio.removeEventListener('ended', this._alTerminar);
    this.audio.removeEventListener('error', this._alFallar);
    this.audio.removeEventListener('timeupdate', this._alActualizarTiempo);
    this.audio.src = '';
    for (const elemento of this.precargas.values()) elemento.src = '';
    this.precargas.clear();
    log('Narrador destruido.');
  }
}
