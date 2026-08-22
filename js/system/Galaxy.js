/**
 * Galaxy — el entorno: campo estelar y disco de la Vía Láctea.
 *
 * Dos capas independientes:
 *
 *   · Un cielo esférico con el mapa estelar real (Solar System Scope, CC BY
 *     4.0), pintado por dentro. Da el fondo constante de la escena.
 *   · Un disco de partículas que representa la Vía Láctea vista desde fuera,
 *     visible solo al alejarse mucho. Es DECORATIVO —no es un mapa de
 *     posiciones estelares— y la interfaz lo marca como SIMULACIÓN.
 */

import * as THREE from 'three';
import { DOS_PI, generador } from '../utils/math.js';

export class Galaxy {
  constructor(gestor, { textura = null, radio = 9000, particulas = 12000, semilla = 31415 } = {}) {
    this.gestor = gestor;
    this.grupo = new THREE.Group();
    this.grupo.name = 'entorno-galactico';
    this.esSimulacion = true;

    this.cielo = this._crearCielo(textura, radio);
    this.grupo.add(this.cielo);

    this.disco = this._crearDisco(particulas, semilla, radio * 0.55);
    this.grupo.add(this.disco);
  }

  _crearCielo(textura, radio) {
    const geometria = this.gestor.registrar(new THREE.SphereGeometry(radio, 48, 32));
    const material = this.gestor.registrar(
      new THREE.MeshBasicMaterial({
        side: THREE.BackSide,     // Se ve desde dentro.
        depthWrite: false,
        color: textura ? 0xffffff : 0x0a1628,
      }),
    );

    if (textura) {
      // El cielo ocupa toda la pantalla al fondo: la versión de 512 px basta
      // hasta que el resto de la escena está lista.
      material.map = this.gestor.cargarTextura(textura.replace(/(\.\w+)$/, '@512$1'));
      this.rutaCieloCompleta = textura;
      // El fondo estelar no debe competir con la escena: se atenúa.
      material.color.setScalar(0.55);
    }

    const malla = new THREE.Mesh(geometria, material);
    malla.name = 'cielo-estelar';
    malla.renderOrder = -1;
    return malla;
  }

  /**
   * Disco galáctico: dos brazos espirales logarítmicos más un bulbo central.
   * Puramente representativo del aspecto de una galaxia espiral barrada.
   */
  _crearDisco(total, semilla, radio) {
    const aleatorio = generador(semilla);
    const posiciones = new Float32Array(total * 3);
    const colores = new Float32Array(total * 3);

    const colorNucleo = new THREE.Color('#ffd9a0');
    const colorBrazo = new THREE.Color('#7fb2ff');
    const color = new THREE.Color();

    const BRAZOS = 2;
    const APERTURA = 0.32;      // Cuánto se abre la espiral logarítmica.

    for (let i = 0; i < total; i++) {
      const enBulbo = aleatorio() < 0.18;
      let x;
      let y;
      let z;

      if (enBulbo) {
        // Bulbo central: distribución esférica concentrada.
        const r = radio * 0.12 * Math.cbrt(aleatorio());
        const theta = aleatorio() * DOS_PI;
        const phi = Math.acos(2 * aleatorio() - 1);
        x = r * Math.sin(phi) * Math.cos(theta);
        y = r * Math.cos(phi) * 0.75;
        z = r * Math.sin(phi) * Math.sin(theta);
        color.copy(colorNucleo);
      } else {
        const t = Math.sqrt(aleatorio());              // Más densidad hacia el centro.
        const r = radio * (0.12 + 0.88 * t);
        const brazo = Math.floor(aleatorio() * BRAZOS);
        const anguloBase = (brazo / BRAZOS) * DOS_PI + Math.log(r / (radio * 0.1)) / APERTURA;
        // Dispersión perpendicular al brazo, proporcional al radio.
        const dispersion = (aleatorio() + aleatorio() + aleatorio() - 1.5) * 0.45;
        const angulo = anguloBase + dispersion;

        x = Math.cos(angulo) * r;
        z = Math.sin(angulo) * r;
        y = (aleatorio() + aleatorio() - 1) * radio * 0.035;
        color.copy(colorBrazo).lerp(colorNucleo, Math.max(0, 1 - t * 1.6));
      }

      posiciones[i * 3] = x;
      posiciones[i * 3 + 1] = y;
      posiciones[i * 3 + 2] = z;
      colores[i * 3] = color.r;
      colores[i * 3 + 1] = color.g;
      colores[i * 3 + 2] = color.b;
    }

    const geometria = this.gestor.registrar(new THREE.BufferGeometry());
    geometria.setAttribute('position', new THREE.BufferAttribute(posiciones, 3));
    geometria.setAttribute('color', new THREE.BufferAttribute(colores, 3));

    const material = this.gestor.registrar(
      new THREE.PointsMaterial({
        size: radio * 0.006,
        sizeAttenuation: true,
        vertexColors: true,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );

    /**
     * Estrellas redondas y no cuadradas.
     *
     * Un `THREE.Points` dibuja cada partícula como un CUADRADO —es un sprite
     * alineado a la pantalla— y a tamaños pequeños no se nota, pero en cuanto
     * la cámara se acerca al disco se ven miles de cuadraditos. Ninguna
     * estrella se ve así.
     *
     * Hay dos formas de arreglarlo. La habitual es darle una textura circular
     * al material, pero eso significa otro archivo que servir, otra textura que
     * liberar y una petición más en el arranque. La otra es descartar en el
     * shader los píxeles que caen fuera del círculo, que es lo que se hace
     * aquí: `gl_PointCoord` va de 0 a 1 dentro del sprite, así que la distancia
     * a su centro dice si el píxel está dentro del disco o en la esquina.
     *
     * Y de paso el borde se difumina en lugar de cortarse en escalón: con
     * `smoothstep` la estrella se apaga hacia fuera, que además de verse mejor
     * evita el dentado de un recorte duro. Sin capa extra ni textura que cargar.
     */
    const ANCLA = '#include <premultiplied_alpha_fragment>';
    material.onBeforeCompile = (parametros) => {
      // Si un día three.js renombra ese fragmento, `replace` no encontraría
      // nada, no fallaría, y las estrellas volverían a salir cuadradas sin que
      // se rompiera absolutamente nada. Un fallo silencioso de manual. Por eso
      // se comprueba y se deja constancia en userData: la prueba lo mira ahí.
      if (!parametros.fragmentShader.includes(ANCLA)) {
        material.userData.redondeado = false;
        return;
      }
      parametros.fragmentShader = parametros.fragmentShader.replace(ANCLA, `
        float distanciaAlCentro = length(gl_PointCoord - vec2(0.5));
        if (distanciaAlCentro > 0.5) discard;
        gl_FragColor.a *= smoothstep(0.5, 0.28, distanciaAlCentro);
        ${ANCLA}
      `);
      material.userData.redondeado = true;
    };

    const puntos = new THREE.Points(geometria, material);
    puntos.name = 'disco-galactico';
    // El Sistema Solar está en el brazo de Orión, a unos 26.000 años luz del
    // centro: el disco se desplaza para que la escena quede en esa posición.
    puntos.position.set(radio * 0.55, 0, 0);
    puntos.rotation.x = 0.42;    // La eclíptica está inclinada ~60° respecto al plano galáctico.
    puntos.visible = false;      // Solo aparece al alejar mucho la cámara.
    return puntos;
  }

  /**
   * El disco galáctico solo tiene sentido cuando la cámara se aleja lo
   * suficiente como para que el Sistema Solar sea un punto. Aparecer y
   * desaparecer con un fundido evita el parpadeo.
   */
  actualizarSegunDistancia(distanciaCamara, delta) {
    const objetivo = distanciaCamara > 700 ? 1 : 0;
    const actual = this.disco.material.opacity;
    const nueva = actual + (objetivo * 0.75 - actual) * Math.min(1, delta * 2.2);

    this.disco.material.opacity = nueva;
    this.disco.visible = nueva > 0.01;
  }

  /** Sustituye el cielo por su versión completa, ya con la escena en marcha. */
  mejorarCielo() {
    if (!this.rutaCieloCompleta || this._mejorado) return;
    this._mejorado = true;

    const completa = this.gestor.cargarTextura(this.rutaCieloCompleta);
    let intentos = 0;
    const sondeo = setInterval(() => {
      if (completa.image) {
        clearInterval(sondeo);
        const anterior = this.cielo.material.map;
        this.cielo.material.map = completa;
        this.cielo.material.needsUpdate = true;
        if (anterior && anterior !== completa) anterior.dispose();
      } else if (++intentos > 150) clearInterval(sondeo);
    }, 100);
  }

  get objeto() {
    return this.grupo;
  }

  destruir() {
    for (const hijo of [this.cielo, this.disco]) {
      hijo.geometry.dispose();
      hijo.material.map?.dispose();
      hijo.material.dispose();
    }
    this.grupo.clear();
    this.grupo.removeFromParent();
  }
}
