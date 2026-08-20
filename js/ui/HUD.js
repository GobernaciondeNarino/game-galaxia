/**
 * HUD — orquestador de la interfaz.
 *
 * Construye UNA sola vez los paneles persistentes y se limita a repintar su
 * contenido cuando cambia el cuerpo activo. Esa es la razón de que la
 * transición entre VISTA DE SISTEMA y VISTA DE CUERPO no parpadee: no se
 * destruye ni se vuelve a crear nada, solo cambia lo que hay dentro del
 * viewport central.
 *
 * El repintado de los paneles va a 10 Hz (canal «lento» del bucle), no a 60:
 * actualizar el DOM en cada fotograma cuesta fotogramas y nadie lee un dato
 * sesenta veces por segundo.
 */

import { App } from '../core/App.js';
import { $, crear, anunciar } from '../utils/dom.js';
import { BarraSuperior } from './panels/BarraSuperior.js';
import { PerfilCuerpo } from './panels/PerfilCuerpo.js';
import {
  MapaOrbital, ComposicionAtmosferica, ActividadGeologica,
  DensidadMagnetosferica, DatosAdicionales,
} from './panels/PanelesDerecha.js';
import { NavegacionPlanetaria } from './panels/NavegacionPlanetaria.js';
import { ProyeccionOrbital } from './panels/ProyeccionOrbital.js';
import { EstadoEntradas } from './panels/EstadoEntradas.js';
import { PanelGalactico } from './panels/PanelGalactico.js';
import { Anotaciones } from './Anotaciones.js';
import { ArcoDatos } from './ArcoDatos.js';
import { Reticula } from './Reticula.js';
import { Subtitles } from './Subtitles.js';
import { log } from '../utils/debug.js';

export class HUD {
  /**
   * @param {object} catalogo data/sistema-solar.json
   * @param {object} acciones { seleccionar, vistaGeneral, vecino, alternarPausa, … }
   */
  constructor(catalogo, acciones, { capaEtiquetas, gestor } = {}) {
    this.catalogo = catalogo.cuerpos;
    this.acciones = acciones;
    this.gestor = gestor;
    this.porId = new Map(this.catalogo.map((c) => [c.id, c]));
    this.tierra = this.porId.get('tierra');

    const raiz = $('#hud');
    raiz.hidden = false;

    this.barra = new BarraSuperior($('#hud-barra-superior'), {
      alCambiarModulo: (id) => this._cambiarModulo(id),
    });

    this.perfil = new PerfilCuerpo($('#hud-panel-izquierdo'));

    const derecha = $('#hud-panel-derecho');
    this.mapaOrbital = new MapaOrbital(derecha, {
      alElegirSatelite: (id) => acciones.seleccionar(id, 'mapa-orbital'),
    });
    this.composicion = new ComposicionAtmosferica(derecha);
    this.geologia = new ActividadGeologica(derecha);
    this.magnetosfera = new DensidadMagnetosferica(derecha);
    this.adicionales = new DatosAdicionales(derecha);

    this.navegacion = new NavegacionPlanetaria($('#hud-navegacion-planetaria'), this.catalogo, {
      alSeleccionar: (id, origen) => acciones.seleccionar(id, origen),
    });

    this.proyeccion = new ProyeccionOrbital($('#hud-proyeccion-orbital'), this.catalogo);

    // El panel de entradas cierra la columna derecha en lugar de flotar sobre
    // ella: como elemento fijo se solapaba con los paneles de datos en cuanto
    // la pantalla bajaba de 1080 px de alto.
    this.entradas = new EstadoEntradas(derecha);

    // El viewport central: es lo ÚNICO que cambia entre los dos estados.
    this.viewport = $('#hud-viewport');
    this.panelGalactico = new PanelGalactico(this.viewport);

    // Piezas de la VISTA DE CUERPO. Se crean una vez y se muestran u ocultan;
    // recrearlas en cada cambio de vista provocaría el parpadeo que el pliego
    // pide evitar.
    if (capaEtiquetas && gestor) {
      this.reticula = new Reticula(capaEtiquetas, gestor);
      this.anotaciones = new Anotaciones(capaEtiquetas, gestor);
    }
    this.arco = new ArcoDatos(document.body);
    this.subtitulos = new Subtitles($('#hud-subtitulos'));

    this._montarControlesEscena();
    this._suscribir();

    // Arranque en VISTA DE SISTEMA con el Sol en el perfil.
    this.mostrarCuerpo(this.porId.get('sol'));
    this.establecerVista('sistema');

    log('HUD montada.');
  }

  /** Controles de escena: tiempo, órbitas y vuelta a la vista general. */
  _montarControlesEscena() {
    this.etiquetaVelocidad = crear('span', { class: 'controles__valor panel__cifra', text: '×100' });

    this.controles = crear('div', { class: 'panel controles' }, [
      crear('button', {
        class: 'controles__boton', type: 'button',
        onclick: () => this.acciones.vistaGeneral(),
        title: 'Volver a la vista general (Esc)',
        text: 'Vista general',
      }),
      crear('div', { class: 'controles__grupo' }, [
        crear('button', {
          class: 'controles__boton controles__boton--icono', type: 'button',
          'aria-label': 'Ralentizar el tiempo',
          onclick: () => this.acciones.cambiarVelocidad(-1),
          text: '◀◀',
        }),
        crear('button', {
          class: 'controles__boton controles__boton--icono', type: 'button',
          'aria-label': 'Pausar o reanudar el tiempo (Espacio)',
          onclick: () => this.acciones.alternarPausa(),
          text: '❚❚',
        }),
        crear('button', {
          class: 'controles__boton controles__boton--icono', type: 'button',
          'aria-label': 'Acelerar el tiempo',
          onclick: () => this.acciones.cambiarVelocidad(1),
          text: '▶▶',
        }),
        this.etiquetaVelocidad,
      ]),
      crear('label', { class: 'controles__interruptor' }, [
        crear('input', {
          type: 'checkbox',
          checked: App.preferencias.get('mostrarOrbitas'),
          onchange: (e) => this.acciones.mostrarOrbitas(e.target.checked),
        }),
        crear('span', { text: 'Órbitas' }),
      ]),
      this._crearControlesNarracion(),
    ]);

    $('#hud-barra-superior').append(this.controles);
  }

  /**
   * Controles de narración: silencio, volumen, repetir y subtítulos.
   * El de subtítulos existe porque son obligatorios pero no imponibles: quien
   * los tenga tapando el planeta debe poder quitarlos.
   */
  _crearControlesNarracion() {
    this.botonSilencio = crear('button', {
      class: 'controles__boton controles__boton--icono',
      type: 'button',
      'aria-pressed': String(App.preferencias.get('narracionSilenciada')),
      'aria-label': 'Silenciar la narración (M)',
      title: 'Silenciar la narración (M)',
      onclick: () => this.acciones.alternarSilencio(),
      text: '🔊',
    });

    this.deslizadorVolumen = crear('input', {
      type: 'range', min: 0, max: 1, step: 0.05,
      value: App.preferencias.get('volumenNarracion'),
      class: 'controles__volumen',
      'aria-label': 'Volumen de la narración',
      oninput: (e) => this.acciones.establecerVolumen(Number(e.target.value)),
    });

    return crear('div', { class: 'controles__grupo controles__grupo--audio' }, [
      this.botonSilencio,
      this.deslizadorVolumen,
      crear('button', {
        class: 'controles__boton controles__boton--icono',
        type: 'button',
        'aria-label': 'Repetir la narración',
        title: 'Repetir la narración',
        onclick: () => this.acciones.repetirNarracion(),
        text: '↻',
      }),
      crear('label', { class: 'controles__interruptor' }, [
        crear('input', {
          type: 'checkbox',
          checked: App.preferencias.get('subtitulos'),
          onchange: (e) => App.preferencias.set('subtitulos', e.target.checked),
        }),
        crear('span', { text: 'Subtítulos' }),
      ]),
    ]);
  }

  /** Refleja el estado del silencio en el botón. */
  actualizarSilencio(silenciada) {
    this.botonSilencio.textContent = silenciada ? '🔇' : '🔊';
    this.botonSilencio.setAttribute('aria-pressed', String(silenciada));
  }

  _cambiarModulo(id) {
    // Los módulos no implementados están desactivados en la propia barra, así
    // que aquí solo llegan los que existen.
    anunciar(`Módulo ${id} seleccionado.`);
    App.emitir('hud:modulo', { id });
  }

  _suscribir() {
    this._cancelaciones = [
      App.al('estado:cuerpoActivo', ({ valor }) => {
        const cuerpo = valor ? this.porId.get(valor) : this.porId.get('sol');
        this.mostrarCuerpo(cuerpo);
        this.navegacion.marcar(valor);
      }),
      App.al('estado:vista', ({ valor }) => this.establecerVista(valor)),
      App.al('tiempo:velocidad', (v) => {
        this.etiquetaVelocidad.textContent = v.etiqueta;
      }),
      App.al('entrada:resaltado', ({ id }) => {
        this.navegacion.panel.dataset.resaltado = id ?? '';
      }),
      App.al('voz:comando', ({ texto }) => this.entradas.mostrarComando(texto)),
      App.al('narracion:motor', ({ motor }) => {
        // Un cambio de motor es información, no un fallo silencioso.
        this.barra.establecerSubtitulo(
          motor === 'navegador'
            ? 'Narración con la voz del navegador'
            : 'Narración con voz sintetizada',
        );
      }),
      App.al('narracion:bloqueada', () => {
        this.barra.establecerSubtitulo('Toca la pantalla para permitir el audio');
      }),
    ];
  }

  /** Repinta todos los paneles con los datos de un cuerpo. */
  mostrarCuerpo(cuerpo) {
    if (!cuerpo) return;
    this.cuerpoMostrado = cuerpo;

    this.perfil.mostrar(cuerpo);
    this.mapaOrbital.mostrar(cuerpo, this.catalogo);
    this.composicion.mostrar(cuerpo);
    this.geologia.mostrar(cuerpo);
    this.magnetosfera.mostrar(cuerpo);
    this.adicionales.mostrar(cuerpo, this.tierra);
    this.proyeccion.destacar(cuerpo);

    this.barra.establecerSubtitulo(
      cuerpo.render?.esSimulacion
        ? `${cuerpo.nombre} · representación simulada, sin mapa fotográfico`
        : `${cuerpo.nombre} · seguimiento activo`,
    );

    if (document.body.dataset.vista === 'cuerpo') {
      this.arco.mostrar(cuerpo);
      this._anclarAnotaciones();
    }
  }

  /** Alterna entre VISTA DE SISTEMA y VISTA DE CUERPO. */
  establecerVista(vista) {
    const enCuerpo = vista === 'cuerpo';
    document.body.dataset.vista = vista;

    // El panel galáctico se retira con un barrido; no se destruye, así que
    // volver a la vista general no cuesta ni una reconstrucción.
    this.panelGalactico.panel.dataset.oculto = enCuerpo ? 'si' : 'no';

    this.reticula?.establecerVisible(enCuerpo);
    this.arco.establecerVisible(enCuerpo);

    if (enCuerpo && this.cuerpoMostrado) {
      this.arco.mostrar(this.cuerpoMostrado);
      this._anclarAnotaciones();
    } else {
      this.anotaciones?.limpiar();
    }
  }

  /** Conecta las anotaciones con la malla del cuerpo mostrado. */
  _anclarAnotaciones() {
    if (!this.anotaciones || !this.cuerpoMostrado) return;
    const cuerpo3D = this.acciones.obtenerCuerpo3D?.(this.cuerpoMostrado.id);
    this.anotaciones.establecerCuerpo(cuerpo3D, this.cuerpoMostrado);
  }

  /**
   * Canal rápido del bucle: solo lo que tiene que seguir a la escena fotograma
   * a fotograma —las anotaciones y la retícula—, nunca los paneles de datos.
   */
  actualizarRapido(delta) {
    const enCuerpo = document.body.dataset.vista === 'cuerpo';
    const cuerpo3D = enCuerpo && this.cuerpoMostrado
      ? this.acciones.obtenerCuerpo3D?.(this.cuerpoMostrado.id)
      : null;

    this.reticula?.actualizar(cuerpo3D, delta);
    this.anotaciones?.actualizar(delta, enCuerpo && Boolean(cuerpo3D));
  }

  /** Canal lento del bucle: 10 veces por segundo. */
  actualizarLento(fps, fechaSimulada) {
    this.barra.actualizarFps(fps);
    this.barra.actualizarReloj(fechaSimulada);
    this.proyeccion.actualizar(fechaSimulada);
  }

  destruir() {
    for (const cancelar of this._cancelaciones ?? []) cancelar();
    for (const parte of [
      this.barra, this.perfil, this.mapaOrbital, this.composicion, this.geologia,
      this.magnetosfera, this.adicionales, this.navegacion, this.proyeccion,
      this.entradas, this.panelGalactico, this.reticula, this.anotaciones, this.arco,
      this.subtitulos,
    ]) {
      parte?.destruir?.();
    }
    this.controles?.remove();
    $('#hud').hidden = true;
  }
}
