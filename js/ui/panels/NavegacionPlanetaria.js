/**
 * Tira inferior de NAVEGACIÓN PLANETARIA.
 *
 * Miniaturas de todos los cuerpos, con el activo enmarcado en ámbar. Se puede
 * recorrer con las flechas del teclado y con los botones laterales, y se
 * colapsa a una pestaña mínima con el botón ×.
 *
 * Las miniaturas no son imágenes: son discos con el color real del cuerpo o un
 * recorte de su textura. Cargar treinta y tres miniaturas aparte multiplicaría
 * las peticiones, y las texturas ya están en memoria.
 */

import { crear } from '../../utils/dom.js';

export class NavegacionPlanetaria {
  constructor(contenedor, catalogo, { alSeleccionar } = {}) {
    this.alSeleccionar = alSeleccionar;
    this.botones = new Map();

    const cuerpos = catalogo.filter((c) => c.tipo !== 'cinturon');

    this.tira = crear('ul', {
      class: 'navegacion__tira',
      role: 'listbox',
      'aria-label': 'Cuerpos del Sistema Solar',
    }, cuerpos.map((cuerpo) => this._crearMiniatura(cuerpo)));

    this.anterior = crear('button', {
      class: 'navegacion__flecha',
      type: 'button',
      'aria-label': 'Desplazar hacia la izquierda',
      onclick: () => this._desplazar(-1),
      text: '‹',
    });
    this.siguiente = crear('button', {
      class: 'navegacion__flecha',
      type: 'button',
      'aria-label': 'Desplazar hacia la derecha',
      onclick: () => this._desplazar(1),
      text: '›',
    });

    this.cerrar = crear('button', {
      class: 'navegacion__cerrar',
      type: 'button',
      'aria-label': 'Ocultar la tira de navegación',
      'aria-expanded': 'true',
      onclick: () => this.alternar(),
      text: '×',
    });

    this.pestana = crear('button', {
      class: 'navegacion__pestana',
      type: 'button',
      hidden: true,
      onclick: () => this.alternar(),
      text: 'Navegación planetaria',
    });

    this.panel = crear('div', { class: 'panel navegacion' }, [
      crear('div', { class: 'navegacion__cabecera' }, [
        crear('h2', { class: 'panel__titulo', text: 'Navegación planetaria' }),
        this.cerrar,
      ]),
      crear('div', { class: 'navegacion__cuerpo' }, [this.anterior, this.tira, this.siguiente]),
    ]);

    contenedor.append(this.panel, this.pestana);

    this.tira.addEventListener('keydown', (e) => this._alTeclear(e));
  }

  _crearMiniatura(cuerpo) {
    const color = cuerpo.render?.color ?? '#8a9098';
    const disco = crear('span', {
      class: 'miniatura__disco',
      style: cuerpo.render?.textura
        ? `background-image:url(${cuerpo.render.textura.replace(/(\.\w+)$/, '@512$1')});`
        : `background:radial-gradient(circle at 34% 30%, ${color}, #10141c 78%);`,
      'aria-hidden': 'true',
    });

    const boton = crear('button', {
      class: 'miniatura',
      type: 'button',
      role: 'option',
      'aria-selected': 'false',
      dataset: { id: cuerpo.id, tipo: cuerpo.tipo },
      title: cuerpo.render?.esSimulacion
        ? `${cuerpo.nombre} — sin mapa fotográfico, representación simulada`
        : cuerpo.nombre,
      onclick: () => this.alSeleccionar?.(cuerpo.id, 'tira'),
    }, [
      disco,
      crear('span', { class: 'miniatura__nombre', text: cuerpo.nombre }),
      cuerpo.render?.esSimulacion
        ? crear('span', { class: 'miniatura__marca', 'aria-hidden': 'true', text: 'SIM' })
        : null,
    ]);

    this.botones.set(cuerpo.id, boton);
    return crear('li', { class: 'navegacion__elemento' }, [boton]);
  }

  _alTeclear(evento) {
    const ids = [...this.botones.keys()];
    const actual = document.activeElement?.dataset?.id;
    if (!actual) return;

    const indice = ids.indexOf(actual);
    let destino = null;

    if (evento.key === 'ArrowRight') destino = (indice + 1) % ids.length;
    else if (evento.key === 'ArrowLeft') destino = (indice - 1 + ids.length) % ids.length;
    else if (evento.key === 'Home') destino = 0;
    else if (evento.key === 'End') destino = ids.length - 1;
    else return;

    evento.preventDefault();
    evento.stopPropagation();      // No dejar que el lienzo interprete la flecha.
    this.botones.get(ids[destino]).focus();
  }

  _desplazar(direccion) {
    this.tira.scrollBy({ left: direccion * this.tira.clientWidth * 0.75, behavior: 'smooth' });
  }

  /** Marca el cuerpo activo y lo trae a la vista. */
  marcar(id) {
    for (const [clave, boton] of this.botones) {
      const activo = clave === id;
      boton.setAttribute('aria-selected', activo ? 'true' : 'false');
      boton.classList.toggle('miniatura--activa', activo);
      if (activo) {
        boton.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }

  alternar() {
    const oculta = this.panel.hasAttribute('hidden');
    if (oculta) {
      this.panel.removeAttribute('hidden');
      this.pestana.hidden = true;
      this.cerrar.setAttribute('aria-expanded', 'true');
      this.cerrar.focus();
    } else {
      this.panel.setAttribute('hidden', '');
      this.pestana.hidden = false;
      this.cerrar.setAttribute('aria-expanded', 'false');
      this.pestana.focus();
    }
  }

  destruir() {
    this.panel.remove();
    this.pestana.remove();
    this.botones.clear();
  }
}
