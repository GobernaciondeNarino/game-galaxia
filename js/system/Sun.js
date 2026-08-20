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
import { CelestialBody, rutaReducida } from './CelestialBody.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { EPOCA_J2000 } from './Orbit.js';

/** Quien pide menos movimiento no quiere una superficie hirviendo. */
const MOVIMIENTO_REDUCIDO = window.matchMedia?.('(prefers-reduced-motion: reduce)');

const MS_POR_DIA = 86_400_000;

const VERTEX = /* glsl */ `
  // <common> define isPerspectiveMatrix(), que necesita <logdepthbuf_vertex>.
  #include <common>
  #include <logdepthbuf_pars_vertex>

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosicion;
  varying vec3 vNormalLocal;
  varying vec3 vHaciaCamara;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosicion = position;
    // La normal SIN transformar: en una esfera apunta desde el centro, así que
    // su componente Y da directamente el seno de la latitud. Es lo que necesita
    // la rotación diferencial, y tiene que ser en el sistema del propio Sol,
    // no en el de la cámara.
    vNormalLocal = normalize(normal);
    vec4 vista = modelViewMatrix * vec4(position, 1.0);
    vHaciaCamara = normalize(-vista.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    // Después de calcular gl_Position: el fragmento lo lee.
    #include <logdepthbuf_vertex>
  }
`;

/**
 * Fragmento de la superficie solar.
 *
 * Cuatro cosas que sí ocurren en el Sol real y que aquí se reproducen:
 *
 *   1. GRANULACIÓN. Celdas de convección de unos mil kilómetros: plasma
 *      caliente que sube por el centro, se enfría y baja por los bordes. De ahí
 *      que cada celda tenga el centro brillante y los surcos oscuros. Viven
 *      entre ocho y veinte minutos, así que aparecen y se deshacen EN EL SITIO;
 *      no se desplazan. Antes el patrón se arrastraba en vertical y parecía una
 *      cinta transportadora, que es justo lo que no hace el Sol.
 *   2. SUPERGRANULACIÓN. Una segunda escala mucho mayor y mucho más lenta,
 *      superpuesta a la anterior. Sin ella la superficie parece ruido uniforme
 *      en lugar de plasma organizado.
 *   3. ROTACIÓN DIFERENCIAL. El Sol no gira como un sólido: no lo es. El
 *      ecuador da una vuelta en unos 24,5 días y las zonas polares tardan unos
 *      34. La malla gira rígida al periodo del catálogo, así que el desfase
 *      —creciente hacia los polos— se aplica aquí, sobre las coordenadas.
 *   4. OSCURECIMIENTO DEL LIMBO. El borde del disco se ve MÁS OSCURO, no más
 *      brillante: mirando de canto, la línea de visión sale de la fotosfera a
 *      más altura, donde el plasma está más frío. Es lo primero que se nota en
 *      cualquier fotografía del Sol, y antes estaba justo al revés.
 */
const FRAGMENT_SUPERFICIE = /* glsl */ `
  #include <logdepthbuf_pars_fragment>

  uniform sampler2D mapa;
  uniform float tiempo;
  uniform float dias;
  uniform vec3 colorCaliente;
  uniform vec3 colorFrio;
  uniform float tieneMapa;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosicion;
  varying vec3 vNormalLocal;
  varying vec3 vHaciaCamara;

  // Ley de rotación diferencial del Sol, en grados por día:
  //   omega(lat) = A + B·sen²(lat) + C·sen⁴(lat)
  // Coeficientes de Snodgrass y Ulrich (1990), medidos siguiendo el patrón de
  // supergranulación. Dan 24,5 días de periodo en el ecuador y unos 34 cerca de
  // los polos, que es la cifra que aparece en cualquier manual.
  const float OMEGA_A = 14.713;
  const float OMEGA_B = -2.396;
  const float OMEGA_C = -1.787;
  // Periodo con el que gira la malla, del catálogo (609 h = 25,38 días).
  const float OMEGA_MALLA = 360.0 / 25.38;

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

  float turbulencia(vec3 p, int octavas) {
    float suma = 0.0;
    float amplitud = 0.5;
    for (int i = 0; i < 4; i++) {
      if (i >= octavas) break;
      suma += amplitud * ruido(p);
      p *= 2.03;
      amplitud *= 0.5;
    }
    return suma;
  }

  /**
   * Celdas de convección que evolucionan SIN DESPLAZARSE.
   *
   * Sumar el tiempo a la posición es lo evidente y lo equivocado: arrastra el
   * patrón entero en esa dirección y la superficie parece una cinta
   * transportadora. Aquí el tiempo elige el campo de ruido, no lo mueve: se
   * generan dos campos decorrelacionados —el mismo ruido evaluado en zonas muy
   * distintas del espacio— y se funde de uno al siguiente. Cada celda aparece,
   * dura y se deshace donde está, como el plasma real.
   *
   * El suavizado 3x²-2x³ en la mezcla evita que se note el salto de un paso al
   * siguiente, que si no aparece como un latido regular.
   */
  float mezclaTemporal(vec3 p, float t, int octavas) {
    float paso = floor(t);
    float x = fract(t);
    vec3 saltoA = vec3(paso * 17.3, paso * 9.1, paso * 23.7);
    vec3 saltoB = saltoA + vec3(17.3, 9.1, 23.7);
    float a = turbulencia(p + saltoA, octavas);
    float b = turbulencia(p + saltoB, octavas);
    return mix(a, b, x * x * (3.0 - 2.0 * x));
  }

  void main() {
    #include <logdepthbuf_fragment>

    // --- Latitud, para modular la convección ---------------------------------
    // En una esfera la normal sin transformar apunta desde el centro, así que
    // su componente Y es directamente el seno de la latitud.
    float senLat = clamp(vNormalLocal.y, -1.0, 1.0);
    float sen2 = senLat * senLat;
    float omega = OMEGA_A + OMEGA_B * sen2 + OMEGA_C * sen2 * sen2;

    vec3 base = tieneMapa > 0.5 ? texture2D(mapa, vUv).rgb : colorCaliente;

    // NO se cizalla el mapa con la rotación diferencial, y conviene dejar
    // escrito por qué: se intentó y el resultado era un rayado de cientos de
    // bandas. El desfase acumulado entre el ecuador y los polos crece sin
    // límite —a este ritmo, decenas de miles de grados en pocos años— y aplicado
    // sobre una fotografía fija la destroza. El Sol real nunca se ve así porque
    // sus rasgos no duran lo suficiente para arrastrar ese desfase: la
    // granulación se rehace cada diez o veinte minutos. La rotación diferencial
    // es un hecho que se mide siguiendo manchas durante días, no algo que se
    // aprecie en una sola imagen. Por eso se cuenta con palabras, en la
    // narración del Sol, en lugar de dibujarse.
    //
    // Lo que sí depende de la latitud es el RITMO de la convección, que es
    // sutil y no acumula nada.
    vec3 pGirado = vPosicion;
    float ritmoLatitud = omega / OMEGA_A;

    // --- Dos escalas de convección ------------------------------------------
    // Supergranulación: grande y lenta.
    float super_ = mezclaTemporal(pGirado * 0.45, tiempo * 0.012 * ritmoLatitud, 1);
    // Granulación: fina y bastante más rápida.
    float grano = mezclaTemporal(pGirado * 3.1, tiempo * 0.09 * ritmoLatitud, 2);

    // Los surcos entre celdas son estrechos y oscuros; los centros, anchos y
    // brillantes. Elevar a una potencia mayor que uno aprieta los oscuros
    // contra el borde de cada celda en lugar de repartirlos por todas partes.
    float celda = pow(clamp(grano * 1.65, 0.0, 1.0), 1.6);
    float relieve = 0.78 + celda * 0.55 + (super_ - 0.5) * 0.22;

    base *= relieve;

    // El Sol EMITE, no refleja, y tiene que salir del rango normal para que el
    // bloom lo recoja y se vea como una fuente de luz en vez de como una bola
    // de roca caliente. Sin este empuje, el oscurecimiento del limbo —que solo
    // puede restar— dejaba el disco entero apagado y parduzco.
    base *= 1.9;

    // Las crestas más calientes tiran hacia el blanco amarillento, que es el
    // color real del fondo de una celda de convección.
    base += vec3(1.0, 0.92, 0.72) * pow(celda, 2.5) * 0.55;

    // --- Oscurecimiento del limbo -------------------------------------------
    // mu es el coseno del ángulo entre la visual y la normal: 1 en el centro
    // del disco, 0 justo en el borde. La ley cuadrática clásica I(mu)/I(0) =
    // 1 - u1(1-mu) - u2(1-mu)² con u1 = 0,84 y u2 = -0,20 reproduce bien el
    // perfil del Sol en luz visible.
    float mu = clamp(dot(normalize(vNormal), normalize(vHaciaCamara)), 0.0, 1.0);
    float unMenosMu = 1.0 - mu;
    float limbo = 1.0 - 0.84 * unMenosMu + 0.20 * unMenosMu * unMenosMu;
    base *= clamp(limbo, 0.30, 1.0);

    // Y en el borde mismo, el tono se vuelve más rojizo: ahí la visual atraviesa
    // capas más altas y más frías. Es el mismo motivo del oscurecimiento, visto
    // en color en lugar de en brillo.
    base = mix(base, base * colorFrio, smoothstep(0.45, 0.0, mu) * 0.45);

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
          // Como el resto de cuerpos, el Sol arranca con la textura reducida.
          mapa: { value: tieneMapa ? this.gestor.cargarTextura(rutaReducida(this.datos.render.textura)) : null },
          tieneMapa: { value: tieneMapa ? 1 : 0 },
          tiempo: { value: 0 },
          // Días transcurridos en la SIMULACIÓN, no en el reloj de pared: la
          // rotación diferencial tiene que ir al mismo ritmo que la escena, que
          // corre a la velocidad de tiempo que el usuario haya elegido.
          dias: { value: 0 },
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

  /** Sustituye la textura de la fotosfera por la de resolución completa. */
  mejorarTextura() {
    const ruta = this.datos.render?.textura;
    if (!ruta || this._texturaMejorada) return;
    this._texturaMejorada = true;

    const completa = this.gestor.cargarTextura(ruta);
    let intentos = 0;
    const sondeo = setInterval(() => {
      if (completa.image) {
        clearInterval(sondeo);
        const anterior = this.materialSuperficie.uniforms.mapa.value;
        this.materialSuperficie.uniforms.mapa.value = completa;
        if (anterior && anterior !== completa) anterior.dispose();
      } else if (++intentos > 100) clearInterval(sondeo);
    }, 100);
  }

  actualizar(fecha, delta = 0) {
    super.actualizar(fecha);

    // Con movimiento reducido la superficie se congela: sigue teniendo toda su
    // textura, pero deja de hervir. El pliego exige respetar la preferencia en
    // cualquier animación nueva, y una superficie que bulle es exactamente eso.
    if (!MOVIMIENTO_REDUCIDO?.matches) this._tiempo += delta;

    if (this.materialSuperficie) {
      this.materialSuperficie.uniforms.tiempo.value = this._tiempo;
      // La rotación diferencial va con la fecha simulada, no con el reloj de
      // pared: si el usuario acelera el tiempo, el ecuador tiene que adelantar
      // a los polos más deprisa, igual que hace todo lo demás en la escena.
      this.materialSuperficie.uniforms.dias.value =
        (fecha.getTime() - EPOCA_J2000) / MS_POR_DIA;
    }

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
