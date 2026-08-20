/**
 * Panel de estado de las entradas, en la esquina inferior derecha.
 *
 * En la fase 3 muestra qué está activo y ofrece los botones para activar cámara
 * y micrófono, con la explicación de lo que implica cada permiso ANTES de
 * pedirlo. Las fases 6 y 7 le añaden la vista previa de la cámara con el
 * esqueleto de la mano, el nivel del micrófono y el último comando reconocido.
 *
 * Los botones no piden permisos aquí: emiten un evento y es el subsistema
 * correspondiente el que decide. Así el panel no sabe nada de MediaPipe ni de
 * reconocimiento de voz.
 */

import { crear } from '../../utils/dom.js';
import { App } from '../../core/App.js';

export class EstadoEntradas {
  constructor(contenedor) {
    this.ultimoComando = crear('p', { class: 'entradas__comando', text: '—' });

    this.botonCamara = crear('button', {
      class: 'entradas__boton',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => App.emitir('entrada:solicitar-camara', {}),
    }, [
      crear('span', { class: 'entradas__simbolo', 'aria-hidden': 'true', text: '◉' }),
      crear('span', { text: 'Activar cámara' }),
    ]);

    this.botonMicrofono = crear('button', {
      class: 'entradas__boton',
      type: 'button',
      'aria-pressed': 'false',
      onclick: () => App.emitir('entrada:solicitar-microfono', {}),
    }, [
      crear('span', { class: 'entradas__simbolo', 'aria-hidden': 'true', text: '▮' }),
      crear('span', { text: 'Activar micrófono' }),
    ]);

    this.vista = crear('div', { class: 'entradas__vista', hidden: true }, [
      crear('video', { class: 'entradas__video', muted: true, playsinline: true, 'aria-hidden': 'true' }),
      crear('canvas', { class: 'entradas__esqueleto', 'aria-hidden': 'true' }),
    ]);

    this.panel = crear('section', { class: 'panel panel--entradas' }, [
      crear('h2', { class: 'panel__titulo', text: 'Entradas' }),
      this.vista,
      this.botonCamara,
      this.botonMicrofono,
      crear('p', { class: 'entradas__aviso' }, [
        crear('strong', { text: 'El vídeo se procesa en tu navegador. ' }),
        'No se envía, no se graba y no sale de este equipo.',
      ]),
      crear('p', { class: 'panel__titulo panel__titulo--menor', text: 'Último comando' }),
      this.ultimoComando,
    ]);

    contenedor.append(this.panel);
  }

  establecerCamara(activa) {
    this.botonCamara.setAttribute('aria-pressed', activa ? 'true' : 'false');
    this.botonCamara.lastChild.textContent = activa ? 'Apagar cámara' : 'Activar cámara';
    this.vista.hidden = !activa;
  }

  establecerMicrofono(activo) {
    this.botonMicrofono.setAttribute('aria-pressed', activo ? 'true' : 'false');
    this.botonMicrofono.lastChild.textContent = activo ? 'Apagar micrófono' : 'Activar micrófono';
  }

  mostrarComando(texto) {
    this.ultimoComando.textContent = texto || '—';
  }

  destruir() {
    this.panel.remove();
  }
}
