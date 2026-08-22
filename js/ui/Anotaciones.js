/**
 * Anotaciones de superficie con líneas guía.
 *
 * Cada etiqueta está anclada a una latitud y una longitud REALES de la
 * superficie del cuerpo (las del catálogo). Mientras el cuerpo rota, el punto
 * de anclaje se mueve con él; la etiqueta se dibuja fuera del disco y una línea
 * fina la conecta con su punto.
 *
 * EL PROBLEMA DIFÍCIL es el solapamiento. Con cinco anotaciones sobre un disco,
 * dos puntos cercanos producen dos etiquetas encima. La solución que se usa
 * aquí es un reparto por sectores angulares con separación mínima garantizada:
 * cada etiqueta se coloca en el radio exterior, en el ángulo de su punto, y
 * después se resuelven las colisiones empujando las etiquetas a lo largo del
 * anillo hasta que ninguna queda a menos de la separación mínima de otra.
 *
 * Se ejecuta a 20 Hz, no en cada fotograma: el DOM es lo caro, no el cálculo.
 */

import * as THREE from 'three';
import { crear } from '../utils/dom.js';
import { latLonAVector, aPantalla } from '../utils/math.js';

const SEPARACION_MINIMA = 26;   // px entre centros de etiqueta
const HZ = 20;

export class Anotaciones {
  /**
   * @param {HTMLElement} capa contenedor DOM sobre el lienzo
   * @param {import('../core/SceneManager.js').SceneManager} gestor
   */
  constructor(capa, gestor) {
    this.gestor = gestor;
    this.capa = capa;

    this.contenedor = crear('div', { class: 'anotaciones', 'aria-hidden': 'false' });
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.setAttribute('class', 'anotaciones__lineas');
    this.svg.setAttribute('aria-hidden', 'true');
    capa.append(this.svg, this.contenedor);

    // Aviso para cuando todas las anotaciones caen en la cara oculta: sin él,
    // el usuario ve un cuerpo sin etiquetar y concluye que no tiene ninguna.
    this.aviso = crear('p', { class: 'anotaciones__aviso', hidden: true });
    capa.append(this.aviso);

    this.entradas = [];
    this.cuerpo = null;
    this._acumulado = 0;
    this._vector = new THREE.Vector3();
    this._centro = new THREE.Vector3();
  }

  /**
   * Fija el cuerpo anotado. Destruye las etiquetas anteriores: no tiene sentido
   * conservarlas, y dejarlas acumuladas sería una fuga de nodos.
   */
  establecerCuerpo(cuerpo, datos) {
    this.limpiar();
    if (!cuerpo || !datos?.anotaciones?.length) return;

    this.cuerpo = cuerpo;

    for (const anotacion of datos.anotaciones) {
      const etiqueta = crear('div', { class: 'anotacion' }, [
        crear('span', { class: 'anotacion__punto', 'aria-hidden': 'true' }),
        crear('span', { class: 'anotacion__texto', text: anotacion.etiqueta }),
      ]);
      const linea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      linea.setAttribute('class', 'anotacion__guia');

      this.contenedor.append(etiqueta);
      this.svg.append(linea);

      // Posición local sobre la esfera, en el sistema del propio cuerpo.
      const local = latLonAVector(anotacion.lat, anotacion.lon, cuerpo.radio * 1.005);
      this.entradas.push({
        anotacion,
        etiqueta,
        linea,
        local: new THREE.Vector3(local.x, local.y, local.z),
      });
    }
  }

  limpiar() {
    this.aviso.hidden = true;
    for (const entrada of this.entradas) {
      entrada.etiqueta.remove();
      entrada.linea.remove();
    }
    this.entradas.length = 0;
    this.cuerpo = null;
  }

  /**
   * @param {number} delta segundos reales
   * @param {boolean} visible false en la VISTA DE SISTEMA
   */
  actualizar(delta, visible) {
    this.contenedor.hidden = !visible || this.entradas.length === 0;
    this.svg.style.display = this.contenedor.hidden ? 'none' : '';
    if (this.contenedor.hidden) {
      this.aviso.hidden = true;
      return;
    }

    this._acumulado += delta;
    if (this._acumulado < 1 / HZ) return;
    this._acumulado = 0;

    const ancho = window.innerWidth;
    const alto = window.innerHeight;
    this.svg.setAttribute('viewBox', `0 0 ${ancho} ${alto}`);

    const camara = this.gestor.camara;
    this.cuerpo.malla.getWorldPosition(this._centro);
    const centroPantalla = this._proyectar(this._centro.clone(), camara, ancho, alto);

    // 1. Proyectar cada punto y descartar los que quedan en la cara oculta.
    const candidatos = [];
    for (const entrada of this.entradas) {
      const mundo = entrada.local.clone();
      this.cuerpo.malla.localToWorld(mundo);

      // Producto escalar entre la normal del punto y la dirección a la cámara:
      // si es negativo, el punto está al otro lado del cuerpo.
      const normal = mundo.clone().sub(this._centro).normalize();
      const haciaCamara = camara.position.clone().sub(mundo).normalize();
      const visible = normal.dot(haciaCamara) > 0.08;

      entrada.etiqueta.dataset.oculta = visible ? 'no' : 'si';
      if (!visible) {
        entrada.linea.setAttribute('d', '');
        continue;
      }

      const punto = this._proyectar(mundo, camara, ancho, alto);
      candidatos.push({ entrada, punto });
    }

    if (!candidatos.length) {
      this.aviso.hidden = false;
      const total = this.entradas.length;
      this.aviso.textContent =
        total === 1
          ? '1 anotación en la cara oculta · gire la vista para verla'
          : `${total} anotaciones en la cara oculta · gire la vista para verlas`;
      return;
    }
    this.aviso.hidden = true;

    // 2. Colocar cada etiqueta en un anillo exterior, en el ángulo de su punto.
    const radioAnillo = Math.min(ancho, alto) * 0.34;
    for (const candidato of candidatos) {
      const dx = candidato.punto.x - centroPantalla.x;
      const dy = candidato.punto.y - centroPantalla.y;
      candidato.angulo = Math.atan2(dy, dx);
    }

    // 3. Resolver colisiones separando los ángulos. Se ordenan y se empujan los
    //    que quedan demasiado juntos, respetando el orden original: así las
    //    etiquetas nunca se cruzan entre sí y sus líneas no se enredan.
    candidatos.sort((a, b) => a.angulo - b.angulo);
    const separacionAngular = SEPARACION_MINIMA / radioAnillo;
    for (let i = 1; i < candidatos.length; i++) {
      const minimo = candidatos[i - 1].angulo + separacionAngular;
      if (candidatos[i].angulo < minimo) candidatos[i].angulo = minimo;
    }

    // 4. Pintar.
    for (const { entrada, punto, angulo } of candidatos) {
      const x = centroPantalla.x + Math.cos(angulo) * radioAnillo;
      const y = centroPantalla.y + Math.sin(angulo) * radioAnillo;
      const aLaIzquierda = Math.cos(angulo) < 0;

      entrada.etiqueta.style.transform =
        `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(${aLaIzquierda ? '-100%' : '0'}, -50%)`;
      entrada.etiqueta.dataset.lado = aLaIzquierda ? 'izquierda' : 'derecha';

      // Línea en dos tramos: un codo a mitad de camino, como en la referencia.
      const codoX = punto.x + (x - punto.x) * 0.62;
      const codoY = punto.y + (y - punto.y) * 0.62;
      entrada.linea.setAttribute(
        'd',
        `M${punto.x.toFixed(1)},${punto.y.toFixed(1)} L${codoX.toFixed(1)},${codoY.toFixed(1)} L${x.toFixed(1)},${y.toFixed(1)}`,
      );
    }
  }

  _proyectar(vector, camara, ancho, alto) {
    return aPantalla(vector, camara, ancho, alto, this._vector);
  }

  destruir() {
    this.limpiar();
    this.aviso.remove();
    this.contenedor.remove();
    this.svg.remove();
  }
}
