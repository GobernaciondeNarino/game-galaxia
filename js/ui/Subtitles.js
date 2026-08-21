/**
 * Subtítulos de la narración.
 *
 * Obligatorios por accesibilidad y activados por omisión. Se muestran en una
 * región `aria-live` para que un lector de pantalla los anuncie, y con
 * contraste suficiente sobre cualquier fondo de la escena.
 *
 * El texto se parte en frases, no en palabras sueltas: una frase completa es
 * la unidad que se puede leer de un vistazo mientras se mira el planeta.
 */

import { crear } from '../utils/dom.js';

/** Divide un texto en frases conservando su puntuación y su posición. */
function partirEnFrases(texto) {
  const frases = [];
  // Se corta tras . ! ? … seguido de espacio y mayúscula: así no se parte en
  // «ee. uu.» ni en las abreviaturas con punto del texto científico.
  const regex = /[^.!?…]+[.!?…]+(?=\s+[¿¡"«A-ZÁÉÍÓÚÑ]|\s*$)/g;
  let coincidencia;
  let ultimo = 0;

  while ((coincidencia = regex.exec(texto)) !== null) {
    frases.push({
      texto: coincidencia[0].trim(),
      inicio: coincidencia.index,
      fin: coincidencia.index + coincidencia[0].length,
    });
    ultimo = regex.lastIndex;
  }

  const resto = texto.slice(ultimo).trim();
  if (resto) frases.push({ texto: resto, inicio: ultimo, fin: texto.length });
  if (!frases.length) frases.push({ texto, inicio: 0, fin: texto.length });

  return frases;
}

export class Subtitles {
  constructor(contenedor) {
    this.linea = crear('p', { class: 'subtitulo__texto' });
    this.panel = crear('div', { class: 'subtitulo', hidden: true }, [this.linea]);
    contenedor.append(this.panel);

    this.frases = [];
    this.total = 0;
    this.indiceActual = -1;
    this.activos = true;
  }

  establecerActivos(activos) {
    this.activos = activos;
    if (!activos) this.limpiar();
  }

  /**
   * Prepara los subtítulos de un texto. Se calcula el reparto proporcional de
   * la duración por número de caracteres: una frase el doble de larga ocupa el
   * doble de tiempo, que es una aproximación muy razonable al ritmo del habla.
   */
  preparar(texto, nombre) {
    clearTimeout(this._temporizadorFrase);
    this.frases = partirEnFrases(texto);
    this.total = texto.length;
    this.indiceActual = -1;

    let acumulado = 0;
    for (const frase of this.frases) {
      frase.desde = acumulado / this.total;
      acumulado += frase.fin - frase.inicio;
      frase.hasta = acumulado / this.total;
    }

    this.panel.setAttribute('aria-label', `Narración de ${nombre}`);
  }

  /**
   * Muestra una frase suelta del asistente durante unos segundos.
   *
   * No entra en el reparto por fracciones de `preparar()`: una entradilla como
   * «mira esto, Ana» dura lo que dura y no hay ninguna pista de reproducción a
   * la que engancharla. Se muestra y se retira sola, y no pisa la narración que
   * venga después porque `preparar()` limpia el temporizador.
   */
  mostrarFrase(texto, ms = 4000) {
    if (!this.activos || !texto) return;
    clearTimeout(this._temporizadorFrase);
    this.linea.textContent = texto;
    this.panel.hidden = false;
    // -2 y no -1: -1 es «ninguna todavía», y con ese valor la primera frase de
    // la narración siguiente se saltaría por parecer ya mostrada.
    this.indiceActual = -2;
    this._temporizadorFrase = setTimeout(() => {
      if (this.indiceActual === -2) this.limpiar();
    }, ms);
  }

  /** Muestra la frase que corresponde a una fracción de la duración total. */
  mostrarEnFraccion(fraccion) {
    if (!this.activos || !this.frases.length) return;
    const indice = this.frases.findIndex((f) => fraccion >= f.desde && fraccion < f.hasta);
    this._mostrarIndice(indice === -1 ? this.frases.length - 1 : indice);
  }

  /** Muestra la frase que contiene un carácter concreto (voz del navegador). */
  mostrarEnCaracter(indiceCaracter) {
    if (!this.activos || !this.frases.length) return;
    const indice = this.frases.findIndex((f) => indiceCaracter >= f.inicio && indiceCaracter < f.fin);
    this._mostrarIndice(indice === -1 ? 0 : indice);
  }

  _mostrarIndice(indice) {
    if (indice === this.indiceActual) return;
    this.indiceActual = indice;
    this.linea.textContent = this.frases[indice]?.texto ?? '';
    this.panel.hidden = false;
  }

  limpiar() {
    clearTimeout(this._temporizadorFrase);
    this.panel.hidden = true;
    this.linea.textContent = '';
    this.indiceActual = -1;
  }

  destruir() {
    this.panel.remove();
  }
}
