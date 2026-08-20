/**
 * Sun — el Sol.
 *
 * Es la única fuente de luz de la escena (un PointLight en el origen) y el
 * único cuerpo que emite en lugar de reflejar, así que no usa el material
 * estándar sino un shader propio con granulación y una corona que lo envuelve.
 *
 * La granulación es DECORATIVA: no representa fotosferas medidas. Se genera con
 * ruido determinista y la interfaz la etiqueta como SIMULACIÓN.
 */

import * as THREE from 'three';
import { CelestialBody } from './CelestialBody.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosicion;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosicion = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragmento de la superficie solar. Combina el mapa fotográfico con ruido
 * animado que imita la granulación y un realce en el limbo.
 */
const FRAGMENT_SUPERFICIE = /* glsl */ `
  uniform sampler2D mapa;
  uniform float tiempo;
  uniform vec3 colorCaliente;
  uniform vec3 colorFrio;
  uniform float tieneMapa;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosicion;

  // Ruido de valor clásico: barato y suficiente para una textura orgánica.
  float aleatorio(vec3 p) {
    return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  }

  float ruido(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = aleatorio(i);
    float n100 = aleatorio(i + vec3(1.0, 0.0, 0.0));
    float n010 = aleatorio(i + vec3(0.0, 1.0, 0.0));
    float n110 = aleatorio(i + vec3(1.0, 1.0, 0.0));
    float n001 = aleatorio(i + vec3(0.0, 0.0, 1.0));
    float n101 = aleatorio(i + vec3(1.0, 0.0, 1.0));
    float n011 = aleatorio(i + vec3(0.0, 1.0, 1.0));
    float n111 = aleatorio(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
      mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
      f.z);
  }

  float turbulencia(vec3 p) {
    float suma = 0.0;
    float amplitud = 0.5;
    for (int i = 0; i < 4; i++) {
      suma += amplitud * ruido(p);
      p *= 2.03;
      amplitud *= 0.5;
    }
    return suma;
  }

  void main() {
    vec3 base = tieneMapa > 0.5 ? texture2D(mapa, vUv).rgb : colorCaliente;

    // Celdas de convección lentas.
    float granulacion = turbulencia(vPosicion * 1.6 + vec3(0.0, tiempo * 0.05, 0.0));
    base = mix(base, base * (0.75 + granulacion * 0.85), 0.55);

    // Realce del limbo: el borde del disco se ve más brillante.
    float limbo = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
    base += colorFrio * limbo * 0.45;

    gl_FragColor = vec4(base, 1.0);
  }
`;

export class Sun extends CelestialBody {
  constructor(datos, gestor) {
    super(datos, gestor);

    // La malla estándar sobra: se sustituye por la de shader.
    this.malla.geometry.dispose();
    this.malla.material.dispose();
    this.ejeInclinado.remove(this.malla);

    this.malla = this._crearSuperficie();
    this.malla.userData.cuerpo = this;
    this.ejeInclinado.add(this.malla);

    this.corona = this._crearCorona();
    // La corona NO cuelga del eje inclinado: es un rótulo orientado a cámara y
    // no debe girar con el Sol.
    this.pivote.add(this.corona);

    /**
     * Única fuente de luz del Sistema Solar.
     *
     * Sin atenuación (decay 0) a propósito: en la escala didáctica Neptuno
     * está a 195 unidades y con atenuación física realista quedaría negro. La
     * intensidad se ajusta para que los planetas queden expuestos, no
     * quemados: con el bloom encima, pasarse de luz los convierte en manchas
     * blancas sin textura.
     */
    this.luz = new THREE.PointLight(0xfff3d6, 1.9, 0, 0);
    this.pivote.add(this.luz);

    this.luzAmbiente = new THREE.AmbientLight(0x2a3d52, 0.16);  // Un mínimo para que la cara nocturna no sea negro puro.

    this._tiempo = 0;
  }

  _crearSuperficie() {
    const geometria = this.gestor.registrar(new THREE.SphereGeometry(this.radio, 96, 64));
    const tieneMapa = Boolean(this.datos.render.textura);

    this.materialSuperficie = this.gestor.registrar(
      new THREE.ShaderMaterial({
        uniforms: {
          mapa: { value: tieneMapa ? this.gestor.cargarTextura(this.datos.render.textura) : null },
          tieneMapa: { value: tieneMapa ? 1 : 0 },
          tiempo: { value: 0 },
          colorCaliente: { value: new THREE.Color('#ffb547') },
          colorFrio: { value: new THREE.Color('#ff7a18') },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT_SUPERFICIE,
      }),
    );

    return new THREE.Mesh(geometria, this.materialSuperficie);
  }

  /**
   * Corona.
   *
   * La primera versión era una esfera mayor con un shader de limbo. Se
   * descartó: por muy suave que sea el degradado, la esfera tiene una silueta,
   * y esa silueta se ve como un disco recortado alrededor del Sol.
   *
   * Un rótulo orientado siempre a la cámara (Sprite) con un degradado radial no
   * tiene silueta que delatar, cuesta un triángulo y se ve igual desde
   * cualquier ángulo. Es lo que hace falta aquí.
   */
  _crearCorona() {
    this.materialCorona = this.gestor.registrar(
      new THREE.SpriteMaterial({
        map: this._crearHalo(512),
        color: new THREE.Color('#ffb156'),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.95,
      }),
    );

    const rotulo = new THREE.Sprite(this.materialCorona);
    rotulo.scale.setScalar(this.radio * 7.5);
    rotulo.renderOrder = -1;
    return rotulo;
  }

  /**
   * Genera el halo del destello en un lienzo: un degradado radial con alfa.
   *
   * Es preferible a cargar un PNG por dos motivos: no añade una petición de red
   * y, sobre todo, no hay riesgo de usar por error una textura opaca —una
   * imagen sin canal alfa aparece como un cuadrado de color sobre la escena—.
   */
  _crearHalo(tamano = 256) {
    const lienzo = document.createElement('canvas');
    lienzo.width = lienzo.height = tamano;
    const ctx = lienzo.getContext('2d');

    const centro = tamano / 2;
    const degradado = ctx.createRadialGradient(centro, centro, 0, centro, centro, centro);
    // El degradado se apaga hacia NEGRO, no hacia naranja transparente. El
    // destello se mezcla en modo aditivo y, con esa mezcla, un píxel de alfa 0
    // pero color naranja sigue sumando luz: aparecería un cuadrado sólido
    // alrededor del halo. Apagando también el color, el borde suma cero.
    degradado.addColorStop(0.0, 'rgba(255, 246, 224, 1)');
    degradado.addColorStop(0.16, 'rgba(255, 214, 150, 0.85)');
    degradado.addColorStop(0.42, 'rgba(180, 100, 35, 0.30)');
    degradado.addColorStop(1.0, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = degradado;
    ctx.fillRect(0, 0, tamano, tamano);

    const textura = new THREE.CanvasTexture(lienzo);
    textura.colorSpace = THREE.SRGBColorSpace;
    return this.gestor.registrar(textura);
  }

  /**
   * Destello de lente. Es un efecto de cámara, no un fenómeno del Sol: se
   * añade porque forma parte del lenguaje visual de la interfaz de referencia.
   */
  anadirDestello() {
    const halo = this._crearHalo();
    const destello = new Lensflare();

    // El halo principal va pegado a la fuente; los reflejos secundarios se
    // reparten por el eje óptico, que es como se comporta una lente real.
    destello.addElement(new LensflareElement(halo, 340, 0, new THREE.Color(0xffe0b0)));
    destello.addElement(new LensflareElement(halo, 42, 0.42, new THREE.Color(0xffc078)));
    destello.addElement(new LensflareElement(halo, 68, 0.62, new THREE.Color(0xff9a3c)));
    destello.addElement(new LensflareElement(halo, 96, 0.85, new THREE.Color(0x7fb2ff)));

    this.luz.add(destello);
    this.destello = destello;
    return destello;
  }

  actualizar(fecha, delta = 0) {
    super.actualizar(fecha);
    this._tiempo += delta;
    if (this.materialSuperficie) this.materialSuperficie.uniforms.tiempo.value = this._tiempo;
    // Latido lento de la corona. Amplitud pequeña a propósito: el Sol no
    // parpadea, y una pulsación marcada quedaría de dibujo animado.
    if (this.materialCorona) {
      this.materialCorona.opacity = 0.95 + 0.05 * Math.sin(this._tiempo * 0.5);
    }
  }

  destruir() {
    this.destello?.dispose?.();
    this.corona.material.map?.dispose();
    this.corona.material.dispose();
    this.corona.removeFromParent();
    this.luz.removeFromParent();
    this.luzAmbiente.removeFromParent();
    super.destruir();
  }
}
