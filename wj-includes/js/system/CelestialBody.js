/**
 * CelestialBody — un cuerpo del Sistema Solar en la escena.
 *
 * Clase base de planetas, satélites y planetas enanos. Encapsula la esfera, su
 * rotación axial real, su órbita y sus recursos, de modo que destruir un cuerpo
 * libere absolutamente todo lo que creó.
 *
 * La rotación y la traslación salen SIEMPRE de los periodos reales del
 * catálogo. Ningún cuerpo gira «a ojo».
 */

import * as THREE from 'three';
import { GRADOS, DOS_PI } from '../utils/math.js';
import { Orbit, EPOCA_J2000 } from './Orbit.js';

const MS_POR_HORA = 3_600_000;

/**
 * Ruta del nivel ligero de una textura.
 *
 * El convenio lo fija tools/texturas.mjs: jupiter.jpg → jupiter@512.jpg. La
 * extensión SIEMPRE pasa a .jpg, sea cual sea la del original, porque el nivel
 * ligero lo produce GD recodificando: un PNG de 512 px de una foto pesa cinco
 * veces más que el JPEG equivalente y a ese tamaño no se distingue.
 *
 * Antes esta línea estaba copiada en tres módulos y conservaba la extensión.
 * En cuanto una textura dejó de ser .jpg —Titán, que es un PNG— los tres
 * empezaron a pedir un archivo que no existe.
 */
export function rutaReducida(ruta) {
  return ruta.replace(/\.\w+$/, '@512.jpg');
}

/** Segmentos de la esfera según su tamaño en pantalla. Un satélite de 0,06
 *  unidades no necesita los mismos triángulos que Júpiter. */
function segmentosPara(radioEscena) {
  if (radioEscena >= 3) return [64, 48];
  if (radioEscena >= 1) return [48, 32];
  if (radioEscena >= 0.3) return [32, 24];
  return [24, 16];
}

export class CelestialBody {
  /**
   * @param {object} datos entrada del catálogo data/sistema-solar.json
   * @param {import('../core/SceneManager.js').SceneManager} gestor
   */
  constructor(datos, gestor) {
    this.datos = datos;
    this.id = datos.id;
    this.gestor = gestor;

    /** Radio con el que se construyó la geometría. Nunca cambia. */
    this.radioBase = datos.render.radioEscalado ?? 0.3;
    /** Radio efectivo en la escena. Cambia con el modo de escala. */
    this.radio = this.radioBase;
    this.periodoRotacionHoras = datos.fisica?.periodoRotacionHoras ?? null;
    this.inclinacionAxial = (datos.fisica?.inclinacionAxialGrados ?? 0) * GRADOS;

    /**
     * Nodo que se mueve por la órbita. Los satélites cuelgan de él, de modo
     * que acompañan a su planeta sin recalcular nada.
     */
    this.pivote = new THREE.Object3D();
    this.pivote.name = `pivote-${this.id}`;

    /** Nodo con la inclinación axial aplicada; dentro gira la esfera. */
    this.ejeInclinado = new THREE.Object3D();
    this.ejeInclinado.rotation.z = this.inclinacionAxial;
    this.pivote.add(this.ejeInclinado);

    this.malla = this._crearMalla();
    this.ejeInclinado.add(this.malla);

    this.orbita = null;
    this.capas = [];        // Nubes, luces nocturnas… se destruyen con el cuerpo.
    this.hijos = [];        // Satélites.
  }

  _crearMalla() {
    const [anchoSeg, altoSeg] = segmentosPara(this.radio);
    const geometria = this.gestor.registrar(
      new THREE.SphereGeometry(this.radio, anchoSeg, altoSeg),
    );

    const render = this.datos.render;
    const material = this.gestor.registrar(
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(render.color ?? '#9aa0a6'),
        roughness: 0.92,
        metalness: 0.0,
      }),
    );

    // NIVEL DE DETALLE. En el arranque se carga la versión de 512 px, no la de
    // 2048: las diecisiete texturas del sistema pasan de unos 8 MB a 1,3 MB, y
    // en una conexión lenta esa es la diferencia entre esperar medio minuto y
    // poder navegar de inmediato. La versión completa se pide solo cuando el
    // usuario enfoca ese cuerpo, que es cuando se nota.
    if (render.textura) {
      const textura = this.gestor.cargarTextura(rutaReducida(render.textura));
      material.map = textura;
      material.color.set('#ffffff');
      material.needsUpdate = true;
      this.texturaReducida = textura;
    }

    const malla = new THREE.Mesh(geometria, material);
    malla.name = this.id;
    // Referencia inversa: el selector por ratón necesita saber a qué cuerpo
    // pertenece el triángulo que ha tocado.
    malla.userData.cuerpo = this;
    return malla;
  }

  /**
   * Sustituye la textura reducida por la de resolución completa.
   *
   * Es idempotente y no bloquea: si ya se pidió, no hace nada; si la descarga
   * falla, se queda la reducida, que es peor pero no rompe nada. La reducida se
   * libera solo cuando la nueva ya está en la GPU, para que no haya un
   * fotograma con el cuerpo en gris.
   */
  mejorarTextura() {
    this._conTexturaCompleta((completa) => {
      const anterior = this.malla.material.map;
      this.malla.material.map = completa;
      this.malla.material.needsUpdate = true;
      if (anterior && anterior !== completa) anterior.dispose();
      this.texturaReducida = null;
    });
  }

  /**
   * Carga la textura de resolución completa y llama a `aplicar` cuando llega.
   *
   * La espera vivía duplicada aquí y en Sun.js, que la sobrescribe entera solo
   * porque el Sol no aplica la textura a `material.map` sino a un uniforme de
   * su shader. Lo que cambia es esa línea; todo lo demás —el guardián de una
   * sola vez, la carga y el sondeo— era idéntico.
   *
   * Hay sondeo y no solo un evento porque el TextureLoader de Three NO emite
   * «load» sobre la textura: rellena `image` y ya está. Se escuchan los dos y
   * el guardián `hecho` impide que se aplique dos veces si llegan ambos, que
   * es lo que pasaba antes.
   */
  _conTexturaCompleta(aplicar) {
    const ruta = this.datos.render?.textura;
    if (!ruta || this._texturaMejorada) return;
    this._texturaMejorada = true;

    const completa = this.gestor.cargarTextura(ruta);
    let hecho = false;
    const unaVez = () => {
      if (hecho) return;
      hecho = true;
      aplicar(completa);
    };

    if (completa.image) { unaVez(); return; }

    completa.addEventListener?.('load', unaVez);
    let intentos = 0;
    const sondeo = setInterval(() => {
      if (completa.image) {
        clearInterval(sondeo);
        unaVez();
      } else if (++intentos > 100) {
        clearInterval(sondeo);   // 10 s: se queda la reducida.
      }
    }, 100);
  }

  /** Conecta el cuerpo a una órbita construida a partir de sus elementos. */
  establecerOrbita(elementos, semiejeEscena, colorLinea) {
    this.orbita = new Orbit(elementos, semiejeEscena);
    this.orbita.crearLinea({ color: colorLinea });
    this.orbita.nodoPeriastro.add(this.pivote);
    return this.orbita;
  }

  /** Añade un satélite, que pasa a orbitar este cuerpo. */
  anadirSatelite(cuerpo, elementos, semiejeEscena, colorLinea) {
    cuerpo.establecerOrbita(elementos, semiejeEscena, colorLinea);
    this.pivote.add(cuerpo.orbita.objeto);
    this.hijos.push(cuerpo);
  }

  /**
   * Actualiza posición y rotación para una fecha simulada.
   * @param {Date} fecha
   */
  actualizar(fecha) {
    if (this.orbita) {
      this.orbita.posicionEn(fecha, this.pivote.position);
    }

    if (this.periodoRotacionHoras) {
      // Fase absoluta desde J2000: la rotación no depende de cuántos
      // fotogramas se hayan dibujado, así que pausar y reanudar no la desplaza.
      const horas = (fecha.getTime() - EPOCA_J2000) / MS_POR_HORA;
      this.malla.rotation.y = (DOS_PI * horas) / this.periodoRotacionHoras;
    }

    for (const capa of this.capas) capa.actualizar?.(fecha);
    for (const hijo of this.hijos) hijo.actualizar(fecha);
  }

  /**
   * Cambia el radio efectivo del cuerpo.
   *
   * Se reescala la malla en lugar de reconstruir la geometría: crear treinta y
   * tres esferas nuevas en cada cambio de escala provocaría un tirón y dejaría
   * las anteriores para el recolector.
   */
  establecerRadio(nuevo) {
    if (!nuevo || nuevo === this.radio) return;
    this.radio = nuevo;
    this.ejeInclinado.scale.setScalar(nuevo / this.radioBase);
  }

  /** Posición del cuerpo en coordenadas de mundo. */
  posicionMundial(destino = new THREE.Vector3()) {
    return this.pivote.getWorldPosition(destino);
  }

  establecerVisibilidadOrbitas(visible) {
    this.orbita?.establecerVisibilidadLinea(visible);
    for (const hijo of this.hijos) hijo.establecerVisibilidadOrbitas(visible);
  }

  /** Objetos que el selector por ratón debe considerar. */
  recogerSeleccionables(destino = []) {
    destino.push(this.malla);
    for (const hijo of this.hijos) hijo.recogerSeleccionables(destino);
    return destino;
  }

  destruir() {
    for (const hijo of this.hijos) hijo.destruir();
    this.hijos.length = 0;

    for (const capa of this.capas) capa.destruir?.();
    this.capas.length = 0;

    this.malla.geometry.dispose();
    const materiales = Array.isArray(this.malla.material) ? this.malla.material : [this.malla.material];
    for (const material of materiales) {
      for (const valor of Object.values(material)) {
        if (valor && valor.isTexture) valor.dispose();
      }
      material.dispose();
    }
    this.malla.removeFromParent();

    this.orbita?.destruir();
    this.pivote.removeFromParent();
  }
}
