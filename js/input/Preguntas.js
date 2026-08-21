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
    //
    //    Se prueba contra la frase entera Y contra la frase sin el nombre del
    //    cuerpo. Hace falta porque la gente lo mete EN MEDIO: «dónde está Marte
    //    ahora» contiene el patrón «donde esta ahora» partido en dos, y
    //    buscándolo entero no aparece. Sin esto se reconocía «dónde está ahora»
    //    y «dónde está ahora Marte», pero no la forma más natural de las tres.
    const candidatos = [limpio];
    const sinCuerpo = this._quitarCuerpo(limpio, cuerpo);
    if (sinCuerpo && sinCuerpo !== limpio) candidatos.push(sinCuerpo);

    for (const { atributo, patron, datos } of this.patrones) {
      const expresion = new RegExp(`(^|\\s)${patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (!candidatos.some((c) => expresion.test(c))) continue;

      // Hay patrones que llevan dentro el nombre de un cuerpo: «a que
      // distancia esta del sol», «a que distancia esta de la tierra». Si la
      // pregunta nombra ADEMÁS otro cuerpo —«a qué distancia está de la Tierra
      // Titán»— el buscador se quedaba con el primero que aparece, que es el
      // del patrón, y contestaba sobre la Tierra en vez de sobre Titán.
      // Reconocido ya el atributo, esas palabras son suyas: se retiran y se
      // vuelve a buscar en lo que queda.
      const sujeto = this._cuerpoFueraDelPatron(limpio, expresion) ?? cuerpo;

      return {
        atributo,
        cuerpo: sujeto,
        etiqueta: datos.etiqueta,
        porContexto: sujeto === contexto && porContexto,
        confianza: 1,
        texto: limpio,
      };
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

  /**
   * Busca un cuerpo en lo que queda de la frase al quitarle el patrón.
   *
   * Devuelve null si ahí no hay ninguno, y entonces manda lo que se hubiera
   * decidido antes: el cuerpo nombrado al principio o el del contexto.
   */
  _cuerpoFueraDelPatron(texto, expresion) {
    const resto = texto.replace(expresion, ' ').replace(/\s+/g, ' ').trim();
    if (!resto || !this.parser) return null;
    const hallado = this.parser.buscarCuerpo(resto);
    return hallado && hallado.confianza >= 0.72 ? hallado.id : null;
  }

  /**
   * La frase sin el nombre del cuerpo, para poder reconocer el patrón.
   *
   * Se quitan también las preposiciones que quedan colgando —«de Marte», «en
   * Venus», «hasta Titán»— porque si no, «a que distancia esta de la tierra de
   * marte» dejaría un «de» suelto que rompe la coincidencia exacta igual que
   * rompía el nombre.
   *
   * Solo se retira el nombre del cuerpo que YA se ha identificado, no cualquier
   * palabra que se le parezca: quitar de más convertiría preguntas distintas en
   * la misma.
   */
  _quitarCuerpo(texto, idCuerpo) {
    if (!idCuerpo) return texto;
    const cuerpo = this.catalogo.find((c) => c.id === idCuerpo);
    if (!cuerpo) return texto;

    const nombres = [cuerpo.nombre, cuerpo.id]
      .filter(Boolean)
      .map((n) => normalizar(String(n)))
      .filter((n) => n.length >= 3)
      .sort((a, b) => b.length - a.length);

    let salida = texto;
    for (const nombre of nombres) {
      const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      salida = salida.replace(
        new RegExp(`(^|\\s)(?:de |del |en |a |al |hasta |sobre |para )?${escapado}(\\s|$)`, 'g'),
        '$1$2',
      );
    }
    return salida.replace(/\s+/g, ' ').trim();
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
