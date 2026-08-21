/**
 * Preguntas — entiende qué se está preguntando y sobre qué cuerpo.
 *
 * Es lógica pura: entra una transcripción y sale un par (cuerpo, atributo). No
 * compone la respuesta ni sabe cuánto pesa Júpiter; de eso se encarga el
 * servidor, que es quien tiene el catálogo y quien pone SIEMPRE el texto. Aquí
 * solo se decide a qué campo se refiere la pregunta.
 *
 * QUÉ ES Y QUÉ NO ES ESTO
 * ───────────────────────
 * No hay ningún modelo de lenguaje detrás. En producción esto corre sobre Plesk
 * con PHP y nada más, así que no hay forma de improvisar respuestas ni de
 * mantener una conversación abierta, y fingir lo contrario sería justo lo que
 * el pliego prohíbe. Lo que hay es recuperación sobre datos verificados: si la
 * pregunta encaja con un atributo del catálogo, se responde con la cifra y su
 * fuente; si no encaja, se dice que no se sabe en lugar de rellenar el hueco.
 *
 * A cambio funciona sin conexión, sin coste por pregunta y sin poder
 * equivocarse: lo que responde está medido y citado.
 *
 * DOS COSAS QUE HAY QUE RESOLVER BIEN
 * ───────────────────────────────────
 *   1. EL CUERPO PUEDE ESTAR IMPLÍCITO. «¿Y su masa?» mirando Júpiter se
 *      refiere a Júpiter. Se acepta un cuerpo por contexto cuando la pregunta
 *      no nombra ninguno, que es como hablaría cualquiera.
 *   2. LOS PATRONES LARGOS MANDAN. «cuánto dura su día» y «su día» apuntan a lo
 *      mismo, pero «cuánto dura su año» no debe caer en «su día» por parecido.
 *      Se prueban de más largo a más corto, igual que en ParserIntenciones.
 */

import { normalizar, similitud } from './ParserIntenciones.js';

/** Por debajo de esto, la pregunta no se parece a nada conocido. */
const UMBRAL_DIFUSO = 0.74;

export class Preguntas {
  /**
   * @param {object} vocabulario data/preguntas.json
   * @param {Array}  catalogo    cuerpos de data/sistema-solar.json
   * @param {object} parser      ParserIntenciones, para reconocer los cuerpos
   */
  constructor(vocabulario, catalogo, parser) {
    this.vocabulario = vocabulario;
    this.catalogo = catalogo;
    this.parser = parser;

    this.patrones = [];
    for (const [atributo, datos] of Object.entries(vocabulario.atributos ?? {})) {
      for (const patron of datos.patrones ?? []) {
        this.patrones.push({ atributo, patron: normalizar(patron), datos });
      }
    }
    this.patrones.sort((a, b) => b.patron.length - a.patron.length);
  }

  /** ¿Esto suena a pregunta? Sirve para no tratar una orden como una duda. */
  static pareceProbable(texto) {
    const t = normalizar(texto);
    return /(^|\s)(que|cuanto|cuanta|cuantos|cuantas|cual|como|donde|de donde|a que|tiene|hay|se puede|es un|es una|dime|cuentame|sorprendeme|algo)(\s|$)/.test(t);
  }

  /**
   * Interpreta una pregunta.
   *
   * @param {string} texto        lo que se ha dicho
   * @param {string|null} contexto id del cuerpo que se está mirando
   * @returns {{atributo:string|null, cuerpo:string|null, etiqueta:string|null,
   *            porContexto:boolean, confianza:number, texto:string}}
   */
  interpretar(texto, contexto = null) {
    const limpio = this.parser ? this.parser.limpiar(texto) : normalizar(texto);
    const vacio = {
      atributo: null, cuerpo: null, etiqueta: null,
      porContexto: false, confianza: 0, texto: limpio,
    };
    if (!limpio) return vacio;

    // 1. El cuerpo. Si la pregunta nombra uno, ese manda sobre el contexto:
    //    «¿y la masa de Venus?» mirando Júpiter pregunta por Venus.
    const encontrado = this.parser?.buscarCuerpo(limpio);
    const cuerpo = encontrado && encontrado.confianza >= 0.72 ? encontrado.id : contexto;
    const porContexto = Boolean(!encontrado || encontrado.confianza < 0.72) && Boolean(contexto);

    // 2. El atributo, primero por coincidencia exacta de patrón.
    for (const { atributo, patron, datos } of this.patrones) {
      const expresion = new RegExp(`(^|\\s)${patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (expresion.test(limpio)) {
        return {
          atributo, cuerpo, etiqueta: datos.etiqueta,
          porContexto, confianza: 1, texto: limpio,
        };
      }
    }

    // 3. Y si no, por parecido. El reconocimiento de voz se come palabras y
    //    cambia unas por otras; exigir literalidad dejaría fuera la mitad de
    //    las preguntas reales.
    let mejor = null;
    for (const { atributo, patron, datos } of this.patrones) {
      // Solo tiene sentido comparar con patrones de longitud parecida: «masa»
      // se parece un 40 % a cualquier palabra corta.
      if (Math.abs(patron.length - limpio.length) > Math.max(8, patron.length)) continue;
      const confianza = similitud(limpio, patron);
      if (confianza >= UMBRAL_DIFUSO && (!mejor || confianza > mejor.confianza)) {
        mejor = { atributo, datos, confianza };
      }
    }
    if (!mejor) return { ...vacio, cuerpo, porContexto };

    return {
      atributo: mejor.atributo,
      cuerpo,
      etiqueta: mejor.datos.etiqueta,
      porContexto,
      confianza: mejor.confianza,
      texto: limpio,
    };
  }

  /** Los atributos que se pueden preguntar, para la ayuda en pantalla. */
  atributosDisponibles() {
    return Object.entries(this.vocabulario.atributos ?? {}).map(([id, datos]) => ({
      id,
      etiqueta: datos.etiqueta,
      ejemplo: datos.patrones?.[0] ?? id,
    }));
  }
}
