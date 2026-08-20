/**
 * GestureRecognizer — traduce puntos de referencia de la mano en acciones.
 *
 * Es lógica pura: entra un array de landmarks de MediaPipe y sale un estado de
 * gesto. No toca el DOM, no toca la escena y no sabe nada de la cámara, así que
 * se puede probar sin navegador ni webcam.
 *
 * DOS PROBLEMAS QUE HAY QUE RESOLVER SÍ O SÍ, o el control tiembla:
 *
 *   1. RUIDO. La estimación de MediaPipe oscila unos pocos píxeles entre
 *      fotogramas aunque la mano esté quieta. Se aplica suavizado exponencial a
 *      cada punto antes de usarlo.
 *   2. ZONA MUERTA. Aun suavizado, queda una deriva de fracciones de píxel. Un
 *      desplazamiento por debajo del umbral se descarta: si no, la escena gira
 *      sola mientras el usuario intenta estarse quieto.
 *
 * Además, todas las distancias se normalizan por el TAMAÑO DE LA MANO en la
 * imagen. Sin eso, un pellizco detectado a medio metro dejaría de detectarse a
 * un metro, porque los dedos se ven más juntos.
 *
 * VOCABULARIO: TRES GESTOS, CUATRO ACCIONES. Y NADA MÁS.
 *
 *   · pellizco con una mano, arrastrando  → rotar el elemento
 *   · pellizco con las dos manos          → acercar (separar) y alejar (juntar)
 *   · mano abierta de un extremo a otro   → pasar al elemento siguiente
 *
 * Hubo más gestos —apuntar para seleccionar, puño para anclar, palma sostenida
 * para volver a la vista general— y estorbaban: al abrir la mano, que es el
 * gesto de reposo natural, se disparaban acciones que nadie había pedido. Un
 * vocabulario corto que nunca se equivoca vale más que uno amplio que sí. Todo
 * lo que ya no se puede hacer con la mano se sigue pudiendo hacer con el ratón,
 * el teclado y la voz, que es donde vive el control fino.
 */

/** Índices de los puntos de referencia que usa ORBIS. */
export const PUNTO = {
  MUNECA: 0,
  PULGAR_PUNTA: 4,
  INDICE_MCP: 5,
  INDICE_PUNTA: 8,
  MEDIO_MCP: 9,
  MEDIO_PUNTA: 12,
  ANULAR_MCP: 13,
  ANULAR_PUNTA: 16,
  MENIQUE_MCP: 17,
  MENIQUE_PUNTA: 20,
};

export const GESTO = {
  NINGUNO: 'ninguno',
  PELLIZCO: 'pellizco',
  PELLIZCO_DOBLE: 'pellizco-doble',
  MANO_ABIERTA: 'mano-abierta',
  APUNTANDO: 'apuntando',
  PUNO: 'puno',
};

/** Parámetros ajustables. Todos relativos al tamaño de la mano, no en píxeles. */
export const AJUSTES = {
  suavizado: 0.45,          // 0 = sin suavizar, 1 = congelado
  zonaMuerta: 0.006,        // fracción del ancho de la imagen
  umbralPellizco: 0.42,     // distancia pulgar-índice / tamaño de la mano
  // Un dedo está estirado si su punta está a más de esta proporción de la
  // distancia entre la muñeca y su propio nudillo. Se compara contra el
  // nudillo, no contra un tamaño global: con un puño cerrado la punta queda
  // aproximadamente a la altura del nudillo (proporción ≈ 1), y estirado llega
  // al doble. Un umbral medido sobre el tamaño total de la mano daba «estirado»
  // también con el puño cerrado, porque la punta sigue lejos de la muñeca.
  umbralExtendido: 1.5,
  umbralDeslizamiento: 0.22, // fracción del ancho recorrida para contar un deslizamiento
  ventanaDeslizamiento: 450, // ms en los que debe completarse
};

const distancia = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z ?? 0) - (b.z ?? 0));

/**
 * Tamaño aparente de la mano: distancia de la muñeca al nudillo del corazón.
 * Es estable frente a la apertura de los dedos, al contrario que el ancho de la
 * caja envolvente, que cambia según el gesto.
 */
function tamanoMano(puntos) {
  return Math.max(1e-4, distancia(puntos[PUNTO.MUNECA], puntos[PUNTO.MEDIO_MCP]));
}

/** ¿Está estirado el dedo cuya punta y nudillo se indican? */
function dedoEstirado(puntos, punta, nudillo, umbral = AJUSTES.umbralExtendido) {
  const aNudillo = Math.max(1e-5, distancia(puntos[PUNTO.MUNECA], puntos[nudillo]));
  const aPunta = distancia(puntos[PUNTO.MUNECA], puntos[punta]);
  return aPunta / aNudillo > umbral;
}

/** Centro de la palma: media de la muñeca y los cuatro nudillos. */
function centroPalma(puntos) {
  const indices = [PUNTO.MUNECA, PUNTO.INDICE_MCP, PUNTO.MEDIO_MCP, PUNTO.ANULAR_MCP, PUNTO.MENIQUE_MCP];
  let x = 0;
  let y = 0;
  for (const i of indices) {
    x += puntos[i].x;
    y += puntos[i].y;
  }
  return { x: x / indices.length, y: y / indices.length };
}

export class GestureRecognizer {
  constructor(ajustes = {}) {
    this.ajustes = { ...AJUSTES, ...ajustes };
    this.manosSuavizadas = [];
    this.estado = {
      gesto: GESTO.NINGUNO,
      manos: 0,
      cursor: null,              // { x, y } normalizado, para el cursor holográfico
      arrastre: null,            // { dx, dy } desde el fotograma anterior
      separacion: null,          // distancia entre pellizcos, para el zoom
      progreso: 0,               // 0..1 del barrido en curso
      accionSostenida: null,     // qué se disparará al llegar a 1
    };

    this._separacionAnterior = null;
    this._historialDeslizamiento = [];
  }

  /** Suaviza los puntos de una mano contra su estado anterior. */
  _suavizar(indice, puntos) {
    const anterior = this.manosSuavizadas[indice];
    if (!anterior || anterior.length !== puntos.length) {
      this.manosSuavizadas[indice] = puntos.map((p) => ({ ...p }));
      return this.manosSuavizadas[indice];
    }

    const a = this.ajustes.suavizado;
    for (let i = 0; i < puntos.length; i++) {
      anterior[i].x = anterior[i].x * a + puntos[i].x * (1 - a);
      anterior[i].y = anterior[i].y * a + puntos[i].y * (1 - a);
      anterior[i].z = (anterior[i].z ?? 0) * a + (puntos[i].z ?? 0) * (1 - a);
    }
    return anterior;
  }

  /** Clasifica el gesto de UNA mano. */
  clasificarMano(puntos) {
    const escala = tamanoMano(puntos);
    const pellizco = distancia(puntos[PUNTO.PULGAR_PUNTA], puntos[PUNTO.INDICE_PUNTA]) / escala;

    const u = this.ajustes.umbralExtendido;
    const estirados = {
      indice: dedoEstirado(puntos, PUNTO.INDICE_PUNTA, PUNTO.INDICE_MCP, u),
      medio: dedoEstirado(puntos, PUNTO.MEDIO_PUNTA, PUNTO.MEDIO_MCP, u),
      anular: dedoEstirado(puntos, PUNTO.ANULAR_PUNTA, PUNTO.ANULAR_MCP, u),
      menique: dedoEstirado(puntos, PUNTO.MENIQUE_PUNTA, PUNTO.MENIQUE_MCP, u),
    };
    const totalEstirados = Object.values(estirados).filter(Boolean).length;

    if (pellizco < this.ajustes.umbralPellizco) return GESTO.PELLIZCO;
    if (totalEstirados === 0) return GESTO.PUNO;
    if (estirados.indice && totalEstirados === 1) return GESTO.APUNTANDO;
    // Cuatro dedos estirados es mano abierta, esté de frente o de canto. Antes
    // se distinguía la palma de frente por la dispersión de profundidad de los
    // nudillos, para un gesto sostenido que ya no existe; mantener la distinción
    // solo servía para que el barrido dejara de detectarse justo cuando la mano
    // se pone de frente, que es como todo el mundo hace el gesto de pasar.
    if (totalEstirados === 4) return GESTO.MANO_ABIERTA;
    return GESTO.NINGUNO;
  }

  /**
   * Procesa un resultado de MediaPipe.
   *
   * @param {Array<Array<{x:number,y:number,z:number}>>} manos landmarks normalizados
   * @param {number} ahora marca de tiempo en ms
   * @returns {object} estado con la acción a ejecutar, si la hay
   */
  procesar(manos, ahora = performance.now()) {
    const acciones = [];

    if (!manos?.length) {
      this._separacionAnterior = null;
      this._historialDeslizamiento.length = 0;
      this.manosSuavizadas.length = 0;
      this.estado = { ...this.estado, gesto: GESTO.NINGUNO, manos: 0, cursor: null, arrastre: null, progreso: 0, accionSostenida: null };
      return { ...this.estado, acciones };
    }

    const suavizadas = manos.map((puntos, i) => this._suavizar(i, puntos));
    const gestos = suavizadas.map((puntos) => this.clasificarMano(puntos));

    // --- Zoom con las dos manos en pellizco ---------------------------------
    if (suavizadas.length >= 2 && gestos[0] === GESTO.PELLIZCO && gestos[1] === GESTO.PELLIZCO) {
      const a = suavizadas[0][PUNTO.INDICE_PUNTA];
      const b = suavizadas[1][PUNTO.INDICE_PUNTA];
      const separacion = distancia(a, b);

      if (this._separacionAnterior !== null) {
        const delta = separacion - this._separacionAnterior;
        if (Math.abs(delta) > this.ajustes.zonaMuerta) {
          acciones.push({ tipo: 'zoom', delta: -delta });
        }
      }
      this._separacionAnterior = separacion;
      this._historialDeslizamiento.length = 0;

      this.estado = {
        ...this.estado,
        gesto: GESTO.PELLIZCO_DOBLE, manos: suavizadas.length,
        cursor: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        separacion, progreso: 0, accionSostenida: null, arrastre: null,
      };
      return { ...this.estado, acciones };
    }
    this._separacionAnterior = null;

    // --- Una mano ----------------------------------------------------------
    const puntos = suavizadas[0];
    const gesto = gestos[0];
    const cursor = gesto === GESTO.PELLIZCO ? puntos[PUNTO.INDICE_PUNTA] : centroPalma(puntos);

    const anterior = this._cursorAnterior;
    let arrastre = null;
    if (anterior && this._gestoAnterior === gesto) {
      const dx = cursor.x - anterior.x;
      const dy = cursor.y - anterior.y;
      if (Math.hypot(dx, dy) > this.ajustes.zonaMuerta) arrastre = { dx, dy };
    }
    this._cursorAnterior = { x: cursor.x, y: cursor.y };
    this._gestoAnterior = gesto;

    let progreso = 0;
    let accionSostenida = null;

    // Pellizcar y arrastrar: rotar. Es el gesto de «agarrar y girar», y por eso
    // el cursor se coloca en la punta del índice y no en el centro de la palma.
    if (gesto === GESTO.PELLIZCO && arrastre) {
      acciones.push({ tipo: 'orbitar', ...arrastre });
    }

    // Mano abierta: lo único que hace es barrer de un extremo a otro. El
    // historial se alimenta en cada fotograma, no solo cuando hay arrastre: la
    // zona muerta descarta fotogramas sueltos y un barrido rápido se quedaría
    // sin muestras suficientes para reconocerse.
    if (gesto === GESTO.MANO_ABIERTA) {
      const barrido = this._registrarDeslizamiento(cursor.x, ahora, acciones);
      progreso = barrido.progreso;
      accionSostenida = barrido.accion;
    } else {
      this._historialDeslizamiento.length = 0;
    }

    // El puño y el índice apuntando se siguen reconociendo —la interfaz los
    // nombra para que se vea que la mano se está leyendo— pero no hacen nada.

    this.estado = {
      gesto, manos: suavizadas.length, cursor, arrastre,
      separacion: null, progreso, accionSostenida,
    };
    return { ...this.estado, acciones };
  }

  /**
   * Deslizamiento horizontal: recorrer suficiente distancia en poco tiempo.
   * Se mide sobre una ventana temporal, no entre dos fotogramas: un movimiento
   * rápido puede repartirse en varios y ninguno superaría el umbral por sí solo.
   *
   * Devuelve además el progreso del barrido en curso, para que la interfaz
   * pueda dibujarlo: es el único gesto que no da retroalimentación por sí mismo
   * —la escena no se mueve mientras se barre—, así que sin un indicador no hay
   * forma de saber si falta poco o si no se está detectando nada.
   *
   * @returns {{progreso:number, accion:string|null}}
   */
  _registrarDeslizamiento(x, ahora, acciones) {
    this._historialDeslizamiento.push({ x, t: ahora });

    const limite = ahora - this.ajustes.ventanaDeslizamiento;
    while (this._historialDeslizamiento.length && this._historialDeslizamiento[0].t < limite) {
      this._historialDeslizamiento.shift();
    }
    if (this._historialDeslizamiento.length < 3) return { progreso: 0, accion: null };

    const primero = this._historialDeslizamiento[0];
    const recorrido = x - primero.x;

    // La imagen de la cámara va reflejada, así que un deslizamiento hacia la
    // derecha del usuario reduce la x normalizada.
    const direccion = recorrido > 0 ? -1 : 1;
    const progreso = Math.min(1, Math.abs(recorrido) / this.ajustes.umbralDeslizamiento);

    if (progreso >= 1) {
      acciones.push({ tipo: 'vecino', direccion });
      this._historialDeslizamiento.length = 0;
      return { progreso: 0, accion: null };
    }
    return { progreso, accion: direccion > 0 ? 'siguiente' : 'anterior' };
  }

  reiniciar() {
    this.manosSuavizadas.length = 0;
    this._cursorAnterior = null;
    this._gestoAnterior = null;
    this._separacionAnterior = null;
    this._historialDeslizamiento.length = 0;
  }
}
