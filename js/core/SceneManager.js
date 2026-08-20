/**
 * SceneManager — escena, cámara y renderizador.
 *
 * Es el único módulo que toca el WebGLRenderer. Se ocupa además de que la
 * escena se pueda destruir por completo: cada geometría, material y textura
 * que se crea acaba pasando por aquí para liberarse con dispose().
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { log, aviso } from '../utils/debug.js';

export class SceneManager {
  /**
   * @param {HTMLCanvasElement} lienzo
   * @param {HTMLElement} capaEtiquetas contenedor DOM de las etiquetas 3D→2D
   */
  constructor(lienzo, capaEtiquetas) {
    this.lienzo = lienzo;

    this.escena = new THREE.Scene();

    // Cámara: el rango del Sistema Solar en escala didáctica va de 0,06
    // unidades (Fobos) a más de 300 (Eris). Un `near` demasiado pequeño
    // arruina la precisión del buffer de profundidad, así que se ajusta al
    // tamaño real de lo que hay que ver.
    this.camara = new THREE.PerspectiveCamera(50, this.proporcion, 0.02, 20000);
    this.camara.position.set(0, 90, 220);

    this.renderizador = new THREE.WebGLRenderer({
      canvas: lienzo,
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderizador.setSize(window.innerWidth, window.innerHeight, false);
    this.renderizador.toneMapping = THREE.ACESFilmicToneMapping;
    // Por debajo de 1 para dejar margen al bloom: la escena tiene una fuente
    // de luz muy intensa y superficies muy claras (Encélado, los anillos).
    this.renderizador.toneMappingExposure = 0.82;
    this.renderizador.outputColorSpace = THREE.SRGBColorSpace;

    // Renderizador de etiquetas: DOM posicionado por la escena 3D. Permite que
    // los nombres de los cuerpos sean texto real, seleccionable y accesible.
    this.renderizadorEtiquetas = new CSS2DRenderer({ element: capaEtiquetas });
    this.renderizadorEtiquetas.setSize(window.innerWidth, window.innerHeight);

    this.controles = new OrbitControls(this.camara, lienzo);
    this.controles.enableDamping = true;
    this.controles.dampingFactor = 0.06;
    this.controles.rotateSpeed = 0.55;
    this.controles.zoomSpeed = 0.9;
    this.controles.panSpeed = 0.7;
    this.controles.minDistance = 0.15;
    this.controles.maxDistance = 3000;

    // Gestor de carga: alimenta la barra de progreso REAL del arranque.
    this.gestorCarga = new THREE.LoadingManager();
    this.cargadorTexturas = new THREE.TextureLoader(this.gestorCarga);

    /** Recursos creados, para poder liberarlos al destruir la escena. */
    this._recursos = new Set();

    this._alRedimensionar = this._alRedimensionar.bind(this);
    window.addEventListener('resize', this._alRedimensionar);

    // Un contexto WebGL puede perderse (cambio de GPU, suspensión del equipo).
    // Sin esto la pantalla se queda en negro sin explicación.
    lienzo.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      aviso('Contexto WebGL perdido. Esperando su recuperación…');
    });
    lienzo.addEventListener('webglcontextrestored', () => {
      aviso('Contexto WebGL recuperado.');
    });

    log('SceneManager listo:', this.renderizador.capabilities.isWebGL2 ? 'WebGL 2' : 'WebGL 1');
  }

  get proporcion() {
    return window.innerWidth / Math.max(1, window.innerHeight);
  }

  /**
   * Registra un recurso para liberarlo después. Devuelve el mismo objeto, de
   * modo que se puede envolver la creación:  const g = sm.registrar(new ...)
   */
  registrar(recurso) {
    if (recurso && typeof recurso.dispose === 'function') this._recursos.add(recurso);
    return recurso;
  }

  /** Carga una textura y la registra para su liberación. */
  cargarTextura(ruta, { colorEspacio = THREE.SRGBColorSpace, repetir = false } = {}) {
    const textura = this.cargadorTexturas.load(ruta);
    textura.colorSpace = colorEspacio;
    textura.anisotropy = Math.min(8, this.renderizador.capabilities.getMaxAnisotropy());
    if (repetir) textura.wrapS = textura.wrapT = THREE.RepeatWrapping;
    return this.registrar(textura);
  }

  _alRedimensionar() {
    const ancho = window.innerWidth;
    const alto = window.innerHeight;

    this.camara.aspect = this.proporcion;
    this.camara.updateProjectionMatrix();
    this.renderizador.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderizador.setSize(ancho, alto, false);
    this.renderizadorEtiquetas.setSize(ancho, alto);
    this.alRedimensionar?.(ancho, alto);
  }

  /**
   * Libera TODO: geometrías, materiales, texturas, el renderizador y los
   * oyentes. Es lo que exige la regla 8 del proyecto.
   */
  destruir() {
    window.removeEventListener('resize', this._alRedimensionar);
    this.controles.dispose();

    this.escena.traverse((objeto) => {
      objeto.geometry?.dispose();
      const materiales = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
      for (const material of materiales) {
        if (!material) continue;
        for (const valor of Object.values(material)) {
          if (valor && valor.isTexture) valor.dispose();
        }
        material.dispose();
      }
    });

    for (const recurso of this._recursos) recurso.dispose();
    this._recursos.clear();

    this.escena.clear();
    this.renderizador.dispose();
    this.renderizador.forceContextLoss();
    log('SceneManager destruido y recursos liberados.');
  }

  /** Diagnóstico para el panel de depuración. */
  get estadisticas() {
    const info = this.renderizador.info;
    return {
      llamadas: info.render.calls,
      triangulos: info.render.triangles,
      geometrias: info.memory.geometries,
      texturas: info.memory.textures,
      programas: info.programs?.length ?? 0,
    };
  }
}
