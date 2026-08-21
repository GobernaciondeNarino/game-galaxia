/**
 * ParserIntenciones — de una transcripción a una acción.
 *
 * Lógica pura, sin DOM ni micrófono, para poder probarla sin navegador.
 *
 * EL PROBLEMA REAL no es entender «ir a Marte», sino que el reconocedor de voz
 * casi nunca transcribe bien los nombres poco frecuentes: «Ganímedes» sale como
 * «ganimedez», «Encélado» como «enselado» e «Ío» como «yo». Si se exige una
 * coincidencia exacta, la mitad de los comandos fallan.
 *
 * Por eso hay tres capas:
 *
 *   1. NORMALIZACIÓN: minúsculas, sin tildes, sin signos, sin muletillas.
 *   2. COINCIDENCIA EXACTA con los alias del vocabulario, que ya incluye los
 *      errores de transcripción más habituales.
 *   3. COINCIDENCIA DIFUSA por distancia de Levenshtein, con un umbral
 *      proporcional a la longitud de la palabra: en «io» un error de una letra
 *      lo cambia todo, en «makemake» no.
 *
 * Cuando nada supera el umbral, NO se falla en silencio: se devuelven las tres
 * alternativas más próximas para que la interfaz las proponga.
 */

/**
 * Quita tildes, signos y espacios sobrantes, y deshace las contracciones.
 *
 * Lo de las contracciones no es un detalle: en español se dice «llévame AL
 * planeta rojo», no «a el planeta rojo». Sin deshacerla, el patrón «ir a» no
 * casa con «ir al» y el comando más natural del idioma se queda sin reconocer.
 */
export function normalizar(texto) {
  return String(texto ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')      // Marcas diacríticas.
    .replace(/[¿?¡!.,;:()"']/g, ' ')
    .replace(/(^|\s)al(\s|$)/g, '$1a el$2')
    .replace(/(^|\s)del(\s|$)/g, '$1de el$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distancia de Levenshtein con dos filas en lugar de la matriz completa.
 * Las cadenas son nombres propios cortos, pero esto se ejecuta varias veces por
 * transcripción y sobre todo el vocabulario.
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  let actual = new Array(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    actual[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const coste = a[i - 1] === b[j - 1] ? 0 : 1;
      actual[j] = Math.min(actual[j - 1] + 1, anterior[j] + 1, anterior[j - 1] + coste);
    }
    [anterior, actual] = [actual, anterior];
  }
  return anterior[b.length];
}

/**
 * Umbral de error tolerado según la longitud.
 *
 * Una fracción fija sería mala en los dos extremos: con el 30 %, «io» toleraría
 * cero errores —y es justo la palabra que peor se transcribe—, mientras que en
 * una de doce letras admitiría casi cuatro y confundiría cuerpos distintos.
 */
function umbralPara(palabra) {
  if (palabra.length <= 3) return 1;
  if (palabra.length <= 6) return 2;
  if (palabra.length <= 10) return 3;
  return 4;
}

/** Similitud de 0 a 1 entre dos cadenas. */
export function similitud(a, b) {
  const largo = Math.max(a.length, b.length);
  if (largo === 0) return 1;
  return 1 - levenshtein(a, b) / largo;
}

export class ParserIntenciones {
  /** @param {object} vocabulario contenido de data/comandos-voz.json */
  constructor(vocabulario) {
    this.vocabulario = vocabulario;

    // Índice plano alias → id de cuerpo, ordenado de más largo a más corto: hay
    // que probar «el planeta rojo» antes que «rojo», o se elegiría mal.
    this.aliasCuerpos = [];
    for (const [id, datos] of Object.entries(vocabulario.cuerpos ?? {})) {
      for (const alias of datos.alias ?? []) {
        this.aliasCuerpos.push({ id, alias: normalizar(alias), nombre: datos.nombre });
      }
    }
    this.aliasCuerpos.sort((a, b) => b.alias.length - a.alias.length);

    this.patronesIntencion = [];
    for (const [intencion, datos] of Object.entries(vocabulario.intenciones ?? {})) {
      for (const patron of datos.patrones ?? []) {
        this.patronesIntencion.push({ intencion, patron: normalizar(patron), datos });
      }
    }
    this.patronesIntencion.sort((a, b) => b.patron.length - a.patron.length);

    this.ruido = (vocabulario.ruido ?? []).map(normalizar);
    this.conectores = (vocabulario.conectores ?? []).map(normalizar);
  }

  /** Quita muletillas y la palabra de activación. */
  limpiar(texto) {
    let limpio = normalizar(texto);
    for (const muletilla of this.ruido) {
      limpio = limpio.replace(new RegExp(`(^|\\s)${muletilla}(\\s|$)`, 'g'), ' ');
    }
    return limpio.replace(/\s+/g, ' ').trim();
  }

  /**
   * Busca un cuerpo en un fragmento de texto.
   * @returns {{id:string, nombre:string, confianza:number, resto:string}|null}
   */
  buscarCuerpo(texto) {
    const limpio = normalizar(texto);
    if (!limpio) return null;

    // 1. Coincidencia exacta de alias dentro del texto.
    for (const entrada of this.aliasCuerpos) {
      const patron = new RegExp(`(^|\\s)${entrada.alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (patron.test(limpio)) {
        return {
          id: entrada.id,
          nombre: entrada.nombre,
          confianza: 1,
          resto: limpio.replace(patron, ' ').trim(),
        };
      }
    }

    // 2. Coincidencia difusa palabra a palabra y sobre pares de palabras
    //    consecutivas: «make make» debe encontrar «makemake».
    const palabras = limpio.split(' ');
    const candidatos = [...palabras, ...palabras.slice(0, -1).map((p, i) => `${p}${palabras[i + 1]}`)];

    let mejor = null;
    for (const candidato of candidatos) {
      if (candidato.length < 2) continue;
      for (const entrada of this.aliasCuerpos) {
        const distancia = levenshtein(candidato, entrada.alias);
        if (distancia > umbralPara(entrada.alias)) continue;
        const confianza = similitud(candidato, entrada.alias);
        if (!mejor || confianza > mejor.confianza) {
          mejor = { id: entrada.id, nombre: entrada.nombre, confianza, candidato };
        }
      }
    }

    if (!mejor) return null;
    return {
      ...mejor,
      resto: limpio.replace(mejor.candidato, ' ').replace(/\s+/g, ' ').trim(),
    };
  }

  /** Las N sugerencias más próximas a un texto que no se entendió. */
  sugerir(texto, cuantas = 3) {
    const limpio = normalizar(texto);
    const puntuadas = [];

    for (const [intencion, datos] of Object.entries(this.vocabulario.intenciones ?? {})) {
      let mejor = 0;
      for (const patron of datos.patrones ?? []) {
        mejor = Math.max(mejor, similitud(limpio, normalizar(patron)));
      }
      puntuadas.push({ intencion, ejemplo: datos.ejemplo, confianza: mejor });
    }

    return puntuadas
      .sort((a, b) => b.confianza - a.confianza)
      .slice(0, cuantas)
      .map((s) => s.ejemplo);
  }

  /**
   * Interpreta una transcripción.
   *
   * @returns {{intencion:string|null, cuerpo:string|null, cuerpoB:string|null,
   *            confianza:number, texto:string, sugerencias:string[]}}
   */
  interpretar(transcripcion) {
    const texto = this.limpiar(transcripcion);
    const vacio = {
      intencion: null, cuerpo: null, cuerpoB: null, confianza: 0,
      texto, sugerencias: this.sugerir(texto),
    };
    if (!texto) return vacio;

    // 1. Intención por patrón, empezando por los más largos.
    let elegida = null;
    let resto = texto;

    for (const { intencion, patron, datos } of this.patronesIntencion) {
      const expresion = new RegExp(`(^|\\s)${patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`);
      if (expresion.test(texto)) {
        elegida = { intencion, datos, confianza: 1 };
        resto = texto.replace(expresion, ' ').trim();
        break;
      }
    }

    // 2. Sin patrón, pero con un nombre de cuerpo reconocible: decir solo
    //    «Júpiter» es una petición perfectamente clara de ir a Júpiter.
    if (!elegida) {
      const soloCuerpo = this.buscarCuerpo(texto);
      if (soloCuerpo && soloCuerpo.confianza >= 0.72) {
        return {
          intencion: 'ir_a', cuerpo: soloCuerpo.id, cuerpoB: null,
          confianza: soloCuerpo.confianza * 0.9, texto, sugerencias: [],
        };
      }

      // 3. Intención difusa: la transcripción se parece a algún patrón.
      let mejor = null;
      for (const { intencion, patron, datos } of this.patronesIntencion) {
        const confianza = similitud(texto, patron);
        if (confianza >= 0.68 && (!mejor || confianza > mejor.confianza)) {
          mejor = { intencion, datos, confianza };
        }
      }
      if (!mejor) return vacio;
      elegida = mejor;
      resto = '';
    }

    // 4. Cuerpos implicados.
    let cuerpo = null;
    let cuerpoB = null;

    if (elegida.datos.necesitaCuerpo) {
      if (elegida.datos.necesitaDosCuerpos) {
        // «comparar marte con venus»: se parte por el conector.
        const conector = this.conectores.find((c) =>
          new RegExp(`\\s${c}\\s`).test(resto));
        if (conector) {
          const [izquierda, derecha] = resto.split(new RegExp(`\\s${conector}\\s`));
          cuerpo = this.buscarCuerpo(izquierda)?.id ?? null;
          cuerpoB = this.buscarCuerpo(derecha)?.id ?? null;
        }
      }
      if (!cuerpo) {
        const encontrado = this.buscarCuerpo(resto || texto);
        cuerpo = encontrado?.id ?? null;
        if (encontrado) elegida.confianza = Math.min(elegida.confianza, encontrado.confianza);
      }

      // Una intención que exige cuerpo y no lo tiene no es una orden ejecutable.
      if (!cuerpo) {
        return {
          intencion: elegida.intencion, cuerpo: null, cuerpoB: null,
          confianza: 0, texto,
          sugerencias: [elegida.datos.ejemplo, ...this.sugerir(texto, 2)],
        };
      }
    }

    return {
      intencion: elegida.intencion,
      cuerpo, cuerpoB,
      confianza: elegida.confianza,
      texto,
      // Lo que quedó de la frase al quitarle el patrón. Casi ninguna intención
      // lo necesita —los cuerpos se resuelven aparte, contra el catálogo—, pero
      // «me llamo Ana» sí: ahí el dato es justamente lo que sobra, y no hay
      // ninguna lista contra la que casarlo.
      resto: resto || null,
      sugerencias: [],
    };
  }
}
