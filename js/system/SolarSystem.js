/**
 * SolarSystem — construye la escena completa a partir del catálogo.
 *
 * Este módulo no contiene ni una sola cifra astronómica: todo sale de
 * data/sistema-solar.json. Si un dato cambia, se cambia en el JSON y aquí no
 * se toca nada.
 *
 * Responsabilidades:
 *   · instanciar el Sol, los planetas, los planetas enanos y los satélites;
 *   · colgar cada satélite de su planeta, no del Sol;
 *   · montar anillos y cinturones;
 *   · actualizar todo para una fecha simulada;
 *   · destruirlo todo liberando cada recurso.
 */

import * as THREE from 'three';
import { CelestialBody } from './CelestialBody.js';
import { Sun } from './Sun.js';
import { Earth } from './Earth.js';
import { Rings } from './Rings.js';
import { AsteroidBelt } from './AsteroidBelt.js';
import { Galaxy } from './Galaxy.js';
import { log } from '../utils/debug.js';

const MS_POR_DIA = 86_400_000;

export class SolarSystem {
  /**
   * @param {object} catalogo contenido de data/sistema-solar.json
   * @param {import('../core/SceneManager.js').SceneManager} gestor
   */
  constructor(catalogo, gestor) {
    this.catalogo = catalogo;
    this.gestor = gestor;

    this.grupo = new THREE.Group();
    this.grupo.name = 'sistema-solar';

    /** @type {Map<string, CelestialBody>} todos los cuerpos por id */
    this.cuerpos = new Map();
    this.cinturones = [];
    this.anillos = [];

    this._porId = new Map(catalogo.cuerpos.map((c) => [c.id, c]));
    this._fechaAnterior = null;
    this._seleccionables = null;

    this._construir();
  }

  _construir() {
    const entradas = this.catalogo.cuerpos;

    // 1. El Sol, en el origen. Es la única fuente de luz.
    const datosSol = this._porId.get('sol');
    this.sol = new Sun(datosSol, this.gestor);
    this.cuerpos.set('sol', this.sol);
    this.grupo.add(this.sol.pivote);
    this.grupo.add(this.sol.luzAmbiente);

    // 2. Todo lo que orbita directamente al Sol.
    for (const datos of entradas) {
      if (datos.tipo === 'cinturon' || datos.padre !== 'sol') continue;

      // La Tierra tiene material propio: día, noche, nubes y atmósfera.
      const Clase = datos.id === 'tierra' ? Earth : CelestialBody;
      const cuerpo = new Clase(datos, this.gestor);
      cuerpo.establecerOrbita(
        datos.orbita,
        datos.render.distanciaEscalada,
        new THREE.Color(datos.render.colorEtiqueta ?? '#4FC3F7'),
      );
      this.grupo.add(cuerpo.orbita.objeto);
      this.cuerpos.set(datos.id, cuerpo);

      if (datos.render.anillos) this._anadirAnillos(cuerpo, datos.render.anillos);
    }

    // 3. Los satélites, colgados de su planeta.
    for (const datos of entradas) {
      if (datos.tipo !== 'satelite') continue;

      const padre = this.cuerpos.get(datos.padre);
      if (!padre) {
        log(`Satélite ${datos.id} sin planeta padre (${datos.padre}); se omite.`);
        continue;
      }

      const satelite = new CelestialBody(datos, this.gestor);
      padre.anadirSatelite(
        satelite,
        datos.orbita,
        datos.render.distanciaEscalada,
        new THREE.Color('#5c7a8c'),
      );
      this.cuerpos.set(datos.id, satelite);
    }

    // 4. Cinturones.
    for (const datos of entradas) {
      if (datos.tipo !== 'cinturon') continue;
      const cinturon = new AsteroidBelt(datos, this.gestor);
      this.cinturones.push(cinturon);
      this.grupo.add(cinturon.objeto);
    }

    // 5. Entorno galáctico.
    this.galaxia = new Galaxy(this.gestor, { textura: 'assets/textures/estrellas.jpg' });
    this.grupo.add(this.galaxia.objeto);

    // 6. Destello del Sol. El halo se genera en un lienzo, sin archivos.
    this.sol.anadirDestello();

    log(
      `Sistema construido: ${this.cuerpos.size} cuerpos, ` +
        `${this.anillos.length} sistemas de anillos, ${this.cinturones.length} cinturones.`,
    );
  }

  _anadirAnillos(cuerpo, config) {
    const anillos = new Rings(config, cuerpo.radio, this.gestor);
    // Los anillos siguen el ecuador del planeta, así que cuelgan del nodo
    // inclinado: los de Urano quedan casi verticales, como en la realidad.
    cuerpo.ejeInclinado.add(anillos.objeto);
    cuerpo.capas.push(anillos);
    this.anillos.push(anillos);
  }

  /**
   * Actualiza el sistema entero para una fecha simulada.
   * @param {Date} fecha
   * @param {number} delta segundos reales transcurridos
   */
  actualizar(fecha, delta) {
    this.sol.actualizar(fecha, delta);

    for (const cuerpo of this.cuerpos.values()) {
      if (cuerpo === this.sol) continue;
      if (cuerpo.datos.tipo === 'satelite') continue;   // Los actualiza su planeta.
      cuerpo.actualizar(fecha);
    }

    // Los cinturones avanzan según el tiempo simulado, no el real.
    const diasSimulados = this._fechaAnterior
      ? (fecha.getTime() - this._fechaAnterior.getTime()) / MS_POR_DIA
      : 0;
    for (const cinturon of this.cinturones) cinturon.actualizar(diasSimulados);

    this._fechaAnterior = new Date(fecha.getTime());
  }

  /** Fundido del disco galáctico según lo lejos que esté la cámara. */
  actualizarEntorno(distanciaCamara, delta) {
    this.galaxia.actualizarSegunDistancia(distanciaCamara, delta);
  }

  establecerVisibilidadOrbitas(visible) {
    for (const cuerpo of this.cuerpos.values()) {
      if (cuerpo.datos.tipo === 'satelite') continue;
      cuerpo.establecerVisibilidadOrbitas(visible);
    }
  }

  establecerVisibilidadCinturones(visible) {
    for (const cinturon of this.cinturones) cinturon.establecerVisibilidad(visible);
  }

  /** Mallas que el selector por ratón debe considerar. Se cachea. */
  get seleccionables() {
    if (!this._seleccionables) {
      this._seleccionables = [];
      for (const cuerpo of this.cuerpos.values()) {
        this._seleccionables.push(cuerpo.malla);
      }
    }
    return this._seleccionables;
  }

  obtener(id) {
    return this.cuerpos.get(id);
  }

  /** Ids en el orden en el que aparecen en la tira de navegación. */
  get ordenNavegacion() {
    return this.catalogo.cuerpos.filter((c) => c.tipo !== 'cinturon').map((c) => c.id);
  }

  destruir() {
    for (const cuerpo of this.cuerpos.values()) {
      if (cuerpo.datos.tipo === 'satelite') continue;   // Su planeta los destruye.
      cuerpo.destruir();
    }
    this.cuerpos.clear();

    for (const cinturon of this.cinturones) cinturon.destruir();
    this.cinturones.length = 0;
    this.anillos.length = 0;

    this.galaxia.destruir();
    this.grupo.clear();
    this.grupo.removeFromParent();
    this._seleccionables = null;
  }
}
