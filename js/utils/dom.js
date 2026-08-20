/**
 * Utilidades mínimas de DOM. Deliberadamente diminutas: ORBIS no usa ninguna
 * librería de interfaz, toda la HUD se construye con estas dos funciones.
 */

/** Selector corto sobre document o sobre un contenedor dado. */
export const $ = (selector, raiz = document) => raiz.querySelector(selector);

/** Selector múltiple que devuelve un array real (no una NodeList). */
export const $$ = (selector, raiz = document) => [...raiz.querySelectorAll(selector)];

/**
 * Crea un elemento con atributos e hijos en una sola expresión.
 *
 *   crear('p', { class: 'panel__titulo', text: 'PERFIL' })
 *   crear('div', { class: 'panel' }, [titulo, cuerpo])
 */
export function crear(etiqueta, atributos = {}, hijos = []) {
  const el = document.createElement(etiqueta);

  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (clave === 'text') el.textContent = valor;
    else if (clave === 'html') el.innerHTML = valor;
    else if (clave === 'dataset') Object.assign(el.dataset, valor);
    else if (clave.startsWith('on') && typeof valor === 'function') {
      el.addEventListener(clave.slice(2).toLowerCase(), valor);
    } else if (valor === true) el.setAttribute(clave, '');
    else el.setAttribute(clave, valor);
  }

  for (const hijo of [hijos].flat()) {
    if (hijo === null || hijo === undefined) continue;
    el.append(hijo instanceof Node ? hijo : document.createTextNode(String(hijo)));
  }
  return el;
}

/** Anuncia un mensaje a los lectores de pantalla sin alterar la interfaz. */
export function anunciar(mensaje) {
  const region = $('#anuncios');
  if (region) region.textContent = mensaje;
}
