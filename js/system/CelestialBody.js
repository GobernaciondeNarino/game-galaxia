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

    this.radio = datos.render.radioEscalado ?? 0.3;
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

    // La textura se carga aparte y se asigna cuando llega, para no bloquear la
    // construcción de la escena. Mientras tanto se ve el color plano.
    if (render.textura) {
      const textura = this.gestor.cargarTextura(render.textura);
      material.map = textura;
      material.color.set('#ffffff');
      material.needsUpdate = true;
    }

    const malla = new THREE.Mesh(geometria, material);
    malla.name = this.id;
    // Referencia inversa: el selector por ratón necesita saber a qué cuerpo
    // pertenece el triángulo que ha tocado.
    malla.userData.cuerpo = this;
    return malla;
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
