/**
 * ReconocedorGuino — distingue un guiño de un parpadeo.
 *
 * Es lógica pura: entran las puntuaciones de dos «blendshapes» de MediaPipe
 * —cuánto está cerrado cada ojo, de 0 a 1— y sale si hay un guiño en curso y si
 * acaba de completarse. No toca el DOM ni la cámara, así que se prueba sin
 * navegador y sin webcam.
 *
 * EL PROBLEMA ES QUE PARPADEAMOS. Unas quince veces por minuto, sin querer. Si
 * «un ojo cerrado» bastara para callar la narración, la voz se cortaría sola
 * cada cuatro segundos y nadie entendería por qué. De ahí las tres condiciones,
 * y las tres hacen falta:
 *
 *   1. ASIMETRÍA. Un parpadeo cierra los dos ojos a la vez, así que se exige
 *      que uno esté claramente cerrado Y el otro claramente abierto. Esta es la
 *      condición que separa el guiño del parpadeo, y sin ella no hay nada.
 *   2. DISTANCIA. Además del umbral de cada ojo, la diferencia entre ambos debe
 *      ser grande. Un parpadeo mal capturado —el modelo ve un ojo antes que el
 *      otro durante un fotograma— produce asimetrías momentáneas pequeñas.
 *   3. DURACIÓN. Hay que mantenerlo. Un parpadeo dura entre 100 y 150 ms; un
 *      guiño deliberado, bastante más. El umbral está por encima de cualquier
 *      parpadeo y por debajo de lo que cansa.
 *
 * Y una cuarta regla, la del cerrojo: un guiño dispara UNA vez. Hay que abrir
 * el ojo antes de que vuelva a contar. Sin eso, mantener el ojo cerrado
 * mandaría callar en cada inferencia, quince veces por segundo.
 */

export const AJUSTES_GUINO = {
  // Un ojo cuenta como cerrado a partir de aquí.
  umbralCerrado: 0.5,
  // …y como abierto por debajo de aquí. La franja de en medio no decide nada:
  // es la zona en la que el modelo todavía no está seguro.
  umbralAbierto: 0.25,
  // Distancia mínima entre los dos ojos. Redundante con los dos umbrales de
  // arriba en el caso claro, pero es lo que descarta los parpadeos capturados a
  // medias, en los que ambos ojos están en la franja intermedia.
  diferenciaMinima: 0.35,
  // Cuánto hay que mantenerlo. Un parpadeo dura 100-150 ms.
  sostenido: 450,
  // Si el rostro se pierde durante más de esto, se olvida el guiño en curso: un
  // fotograma perdido no debe cancelarlo, pero salir del encuadre sí.
  toleranciaSinRostro: 300,
};

export class ReconocedorGuino {
  constructor(ajustes = {}) {
    this.ajustes = { ...AJUSTES_GUINO, ...ajustes };
    this.reiniciar();
  }

  reiniciar() {
    this._inicio = 0;
    this._yaDisparado = false;
    this._ultimoRostro = 0;
    this.estado = { guinando: false, progreso: 0, ojo: null };
  }

  /**
   * Procesa una lectura.
   *
   * @param {{izquierdo:number, derecho:number}|null} ojos cuánto está cerrado
   *   cada ojo, de 0 a 1. `null` cuando no se ve ningún rostro.
   * @param {number} ahora marca de tiempo en ms
   * @returns {{guinando:boolean, progreso:number, ojo:string|null, disparo:boolean}}
   */
  procesar(ojos, ahora = 0) {
    if (!ojos) {
      // Sin rostro. Se aguanta un poco antes de olvidar: el detector pierde la
      // cara un fotograma suelto con relativa facilidad y cancelar el guiño por
      // eso obligaría a empezar de cero cada dos por tres.
      if (this._ultimoRostro && ahora - this._ultimoRostro > this.ajustes.toleranciaSinRostro) {
        this.reiniciar();
      }
      return { ...this.estado, disparo: false };
    }
    this._ultimoRostro = ahora;

    const { izquierdo, derecho } = ojos;
    const cerrado = Math.max(izquierdo, derecho);
    const abierto = Math.min(izquierdo, derecho);

    const esGuino =
      cerrado >= this.ajustes.umbralCerrado &&
      abierto <= this.ajustes.umbralAbierto &&
      cerrado - abierto >= this.ajustes.diferenciaMinima;

    if (!esGuino) {
      this._inicio = 0;
      this._yaDisparado = false;
      this.estado = { guinando: false, progreso: 0, ojo: null };
      return { ...this.estado, disparo: false };
    }

    const ojo = izquierdo > derecho ? 'izquierdo' : 'derecho';

    if (!this._inicio) this._inicio = ahora;

    if (this._yaDisparado) {
      this.estado = { guinando: true, progreso: 0, ojo };
      return { ...this.estado, disparo: false };
    }

    const transcurrido = ahora - this._inicio;
    if (transcurrido >= this.ajustes.sostenido) {
      this._yaDisparado = true;
      this.estado = { guinando: true, progreso: 0, ojo };
      return { ...this.estado, disparo: true };
    }

    this.estado = {
      guinando: true,
      progreso: transcurrido / this.ajustes.sostenido,
      ojo,
    };
    return { ...this.estado, disparo: false };
  }
}

/**
 * Extrae las dos puntuaciones que interesan de un resultado de FaceLandmarker.
 *
 * Devuelve `null` si no hay rostro o si el resultado no trae «blendshapes»,
 * que es lo que ocurre si el detector se creó sin `outputFaceBlendshapes`.
 * Izquierdo y derecho son los del rostro, no los de quien mira la pantalla; da
 * igual, porque las dos condiciones son simétricas.
 *
 * @param {object|null} resultado lo que devuelve detectForVideo()
 * @returns {{izquierdo:number, derecho:number}|null}
 */
export function ojosDesdeResultado(resultado) {
  const formas = resultado?.faceBlendshapes?.[0]?.categories;
  if (!formas?.length) return null;

  let izquierdo = null;
  let derecho = null;
  for (const forma of formas) {
    if (forma.categoryName === 'eyeBlinkLeft') izquierdo = forma.score;
    else if (forma.categoryName === 'eyeBlinkRight') derecho = forma.score;
    if (izquierdo !== null && derecho !== null) break;
  }
  if (izquierdo === null || derecho === null) return null;
  return { izquierdo, derecho };
}
